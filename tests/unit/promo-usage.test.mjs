/**
 * Promo consumption tests (audit finding H-03).
 *
 * "check with a query → create the order → record with .add()" is three separate
 * round trips with no transaction and no uniqueness constraint, so N concurrent
 * requests carrying the same code all passed the check and all got the discount.
 * The recording write used an auto-generated document id, so Firestore itself had
 * nothing to refuse, and its `.catch()` swallowed failures — a lost write silently
 * granted the code again.
 *
 * Two further ways the same counters were defeated without any concurrency at all:
 *
 *   • Casing. The pre-check called getPromoCodeByCode(promoCode) verbatim while the
 *     pricing block called it with .toUpperCase(). Posting "welcome10" made the
 *     pre-check find nothing — skipping isActive, expiry AND maxUsage entirely —
 *     while the pricing block still found "WELCOME10" and applied the discount.
 *
 *   • Identity. The per-user key was `userId || phoneNumber`, both read straight off
 *     the request body, so rotating userId reset the per-user limit every time.
 *
 * Run:  node --test tests/unit/promo-usage.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { promoUsageId } from "../../server/firebase.ts";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, "../../", p), "utf8");
const ROUTES = read("server/routes.ts");
const FIREBASE = read("server/firebase.ts");

function stripComments(src) {
  return src
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*"));
    })
    .join("\n");
}

function handlerBody(src, marker) {
  const i = src.indexOf(marker);
  if (i === -1) return "";
  const rest = src.slice(i + marker.length);
  const next = rest.search(/\n\s*(app|router)\.(get|post|put|patch|delete)\(/);
  return stripComments(marker + (next === -1 ? rest : rest.slice(0, next)));
}

const ORDERS = handlerBody(ROUTES, 'app.post("/api/orders"');

describe("H-03 — the claim id is what makes the write refusable", () => {
  test("the same (user, code) always maps to the same document id", () => {
    assert.equal(promoUsageId("07701234567", "WELCOME10"), "WELCOME10__07701234567");
    assert.equal(
      promoUsageId("07701234567", "WELCOME10"),
      promoUsageId("07701234567", "WELCOME10"),
    );
  });

  test("different users and different codes never collide", () => {
    const ids = new Set([
      promoUsageId("07701234567", "WELCOME10"),
      promoUsageId("07709999999", "WELCOME10"),
      promoUsageId("07701234567", "SUMMER20"),
    ]);
    assert.equal(ids.size, 3);
  });

  test("a slash can never break out into a subcollection path", () => {
    // Firestore document ids may not contain "/".
    assert.doesNotMatch(promoUsageId("a/b", "C/D"), /\//);
    assert.equal(promoUsageId("a/b", "CD"), "CD__a_b");
  });
});

describe("H-03 — one canonical spelling for the whole request", () => {
  test("the canonical form is derived once, trimmed and upper-cased", () => {
    assert.match(
      ORDERS,
      /const promoCodeCanonical = promoCode \? String\(promoCode\)\.trim\(\)\.toUpperCase\(\) : "";/,
    );
  });

  test("the pre-check no longer looks the code up verbatim", () => {
    assert.doesNotMatch(
      ORDERS,
      /getPromoCodeByCode\(promoCode\)/,
      "REGRESSION: lowercase input skips isActive / expiry / maxUsage again",
    );
  });

  test("both lookups use the same canonical value", () => {
    const hits = ORDERS.match(/getPromoCodeByCode\(promoCodeCanonical\)/g) ?? [];
    assert.equal(hits.length, 2, "the pre-check and the pricing block must agree");
  });

  test("the usage query and the stored order use the canonical value too", () => {
    assert.match(ORDERS, /countPromoUsage\(promoCodeCanonical\)/);
    assert.match(ORDERS, /orderData\.promoCode = promoCodeCanonical;/);
    assert.doesNotMatch(
      ORDERS,
      /orderData\.promoCode = promoCode;/,
      "REGRESSION: the order and promoUsageHistory can drift apart again",
    );
  });

  test("casing and padding all collapse to the same key", () => {
    const canon = (c) => (c ? String(c).trim().toUpperCase() : "");
    const forms = ["WELCOME10", "welcome10", "WeLcOmE10", "  welcome10  "];
    const ids = new Set(forms.map((f) => promoUsageId("0770", canon(f))));
    assert.equal(ids.size, 1, "REGRESSION: varying the letters mints a fresh claim");
  });
});

describe("H-03 — the coupon is charged to the authenticated identity", () => {
  test("the claimant comes from the verified token, not the body", () => {
    assert.match(
      ORDERS,
      /const promoClaimant = \(\(req as any\)\.customerPhone as string\) \|\| "";/,
    );
  });

  test("the body-supplied key is no longer what the claim is written under", () => {
    assert.doesNotMatch(
      ORDERS,
      /recordPromoUsage\(userId \|\| phoneNumber/,
      "REGRESSION: rotating userId resets the per-user limit again",
    );
    assert.match(ORDERS, /claimPromoUsage\(promoClaimant, promoCodeCanonical\)/);
  });

  test("usage recorded under the old key is still honoured", () => {
    // Existing rows were keyed on the users/ document id, which is a Firestore
    // auto-id — not the phone number — so dropping it would hand every customer
    // one free re-use of every coupon.
    assert.match(ORDERS, /const legacyKey = userId \? String\(userId\) : "";/);
    assert.match(ORDERS, /checkPromoUsage\(legacyKey, promoCodeCanonical\)/);
  });
});

describe("H-03 — the claim happens before the order, and is atomic", () => {
  test("claimPromoUsage runs before createOrder", () => {
    const claim = ORDERS.indexOf("claimPromoUsage(promoClaimant");
    const create = ORDERS.indexOf("const newOrder = await createOrder(orderData);");
    assert.ok(claim > -1 && create > -1, "a step went missing");
    assert.ok(claim < create, "REGRESSION: the coupon is recorded after the order again");
  });

  test("a lost claim refuses the order instead of being swallowed", () => {
    assert.doesNotMatch(
      ORDERS,
      /recordPromoUsage\([^)]*\)\.catch/,
      "REGRESSION: a failed usage write silently grants the code again",
    );
    assert.match(ORDERS, /if \(!claimed\) \{\s*\n\s*return res\.status\(400\)/);
  });

  test("an order that never came into existence gives the coupon back", () => {
    assert.match(
      ORDERS,
      /if \(!newOrder && promoCodeCanonical\) \{[\s\S]{0,200}releasePromoUsage\(promoClaimant, promoCodeCanonical\)/,
    );
  });

  test("the authoritative cap check counts our own claim", () => {
    // Post-claim the row exists, so the comparison must be `>` — `>=` would reject
    // the very request that legitimately consumed the last slot.
    assert.match(
      ORDERS,
      /promoMaxUsage > 0 && \(await countPromoUsage\(promoCodeCanonical\)\) > promoMaxUsage/,
    );
    assert.match(
      ORDERS,
      /releasePromoUsage\(promoClaimant, promoCodeCanonical\);\s*\n\s*return res\.status\(400\)\.json\(\{ error: "لقد وصل هذا الكوبون لحد الاستخدام الأقصى" \}\)/,
      "an overshooting racer must hand its claim back",
    );
  });

  test("the cheap pre-claim cap check is still there (fails fast, `>=`)", () => {
    assert.match(ORDERS, /\(await countPromoUsage\(promoCodeCanonical\)\) >= promoMaxUsage/);
  });
});

describe("H-03 — server/firebase.ts provides the atomic primitive", () => {
  test("the claim uses .create(), which Firestore refuses when the id exists", () => {
    assert.match(
      FIREBASE,
      /doc\(promoUsageId\(userId, promoCode\)\)\.create\(\{/,
      "REGRESSION: .add() cannot refuse a duplicate",
    );
  });

  test("ALREADY_EXISTS becomes false, every other error still propagates", () => {
    assert.match(FIREBASE, /if \(error\?\.code === 6 \|\| \/ALREADY_EXISTS\/i\.test\(String\(error\?\.message \|\| ""\)\)\) return false;/);
    assert.match(FIREBASE, /throw error;/);
  });

  test("release deletes exactly the claimed id", () => {
    assert.match(FIREBASE, /releasePromoUsage[\s\S]{0,400}doc\(promoUsageId\(userId, promoCode\)\)\.delete\(\)/);
  });

  test("the legacy query-based check is kept, so auto-id rows still count", () => {
    assert.match(FIREBASE, /export async function checkPromoUsage/);
    assert.match(FIREBASE, /\.where\("userId", "==", userId\)[\s\S]{0,120}\.where\("promoCode", "==", promoCode\)/);
  });

  test("no new collection and no new field were introduced", () => {
    for (const fn of ["claimPromoUsage", "releasePromoUsage", "countPromoUsage"]) {
      const from = FIREBASE.indexOf(`export async function ${fn}`);
      const rest = FIREBASE.slice(from + 10);
      const to = rest.search(/\nexport /);
      const body = rest.slice(0, to === -1 ? rest.length : to);
      const collections = [...body.matchAll(/collection\("([^"]+)"\)/g)].map((m) => m[1]);
      for (const c of collections) {
        assert.equal(c, "promoUsageHistory", `${fn} touched an unexpected collection: ${c}`);
      }
    }
    const claim = FIREBASE.slice(FIREBASE.indexOf("export async function claimPromoUsage"));
    assert.match(claim.slice(0, 500), /userId,\s*\n\s*promoCode,\s*\n\s*timestamp:/);
  });
});

describe("H-03 — earlier fixes in the same handler still hold", () => {
  test("H-04's clamp, H-05's price guards, H-02's fee, H-01's service fee", () => {
    assert.match(ORDERS, /verifiedDiscount = Math\.min\(verifiedDiscount, verifiedSubtotal\)/);
    assert.match(ORDERS, /if \(isValidProductPrice\(vpPrice\)\)/);
    assert.match(ORDERS, /let verifiedDeliveryFee: number \| null = null/);
    assert.match(ORDERS, /const verifiedServiceFee = await getConfiguredServiceFee\(\);/);
  });
});
