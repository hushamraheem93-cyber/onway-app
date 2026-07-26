/**
 * Regression guards for the 26 VERIFIED High findings in FINAL_SADD_AUDIT.md.
 *
 * Companion to critical-regressions.test.mjs. Same rationale: where a defect lives
 * in code that cannot be imported (routes.ts exports only registerRoutes,
 * admin.html and the shell scripts are not modules), the test asserts on the source
 * text, and each assertion targets the exact construct that was wrong. Everything
 * that CAN be imported is tested behaviourally.
 *
 * Run:  npm run test:unit
 */
/* global Buffer */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  sanitizeQuantity,
  MAX_ITEM_QUANTITY,
  capOrderItemImages,
  isAllowedImageMime,
  safeImageExtension,
  safeImageContentType,
  sniffImageMime,
} from "../../server/orderValidation.ts";
import { ORDER_TRANSITIONS } from "../../server/firebase.ts";
import { settlementPaymentId } from "../../server/settlement.ts";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, "../../", p), "utf8");

const ROUTES = read("server/routes.ts");
const INDEX = read("server/index.ts");
const VENDOR = read("server/vendor.ts");
const FIREBASE = read("server/firebase.ts");
const ADMIN = read("server/templates/admin.html");
const ADMIN_AUTH = read("server/adminAuth.ts");
const RULES = read("firestore.rules");

function stripComments(src) {
  return src
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*"));
    })
    .join("\n");
}

/** Body of a named route handler, bounded by the next route registration. */
function handlerBody(src, marker) {
  const i = src.indexOf(marker);
  if (i === -1) return "";
  const rest = src.slice(i + marker.length);
  const next = rest.search(/\n\s*(app|router)\.(get|post|put|patch|delete)\(/);
  return stripComments(marker + (next === -1 ? rest : rest.slice(0, next)));
}

/** Body of a named function declaration, bounded by the next top-level declaration. */
function functionBody(src, marker) {
  const i = src.indexOf(marker);
  if (i === -1) return "";
  const rest = src.slice(i + marker.length);
  const next = rest.search(
    /\n(async function|function|const|export|router\.|app\.)/,
  );
  return stripComments(
    marker + (next === -1 ? rest.slice(0, 4000) : rest.slice(0, next)),
  );
}

// ── H1 — client calls that omit the required JWT ────────────────────────────
describe("H1 — guarded customer endpoints must be called with the JWT", () => {
  // Every one of these is behind requireCustomerAuth (or an inline JWT check) on the
  // server. A call site that forgets the header gets a 401 that the surrounding
  // `catch {}` swallows, so the feature is silently and completely dead — which is
  // exactly how support chat, the 3-minute cancel window and address resolution
  // ended up broken with nothing in the logs.
  const callSites = [
    [
      "client/screens/SupportChatScreen.tsx",
      "/api/support/messages",
      "support chat",
    ],
    [
      "client/screens/OrderConfirmationScreen.tsx",
      "/cancel",
      "3-minute order cancel",
    ],
    ["client/lib/geocoding.ts", "/api/reverse-geocode", "address resolution"],
  ];

  for (const [file, endpoint, label] of callSites) {
    test(`${label} sends Authorization (${file})`, () => {
      const src = read(file);
      assert.ok(
        src.includes(endpoint),
        `${endpoint} is no longer requested from ${file}`,
      );
      // Either the header is set inline (screens, from useAuth().customerToken) or
      // through the shared helper (plain modules, which cannot use the hook).
      assert.match(
        src,
        /Authorization|customerAuthHeaders/,
        `REGRESSION: ${label} calls a JWT-guarded endpoint with no Authorization header — the feature is 100% dead and fails silently`,
      );
    });
  }

  test("reverse-geocode reads the token from storage (it is not a component)", () => {
    const src = read("client/lib/geocoding.ts");
    assert.match(
      src,
      /customerAuthHeaders\(\)/,
      "plain modules must use the shared header helper",
    );
  });

  test("the server still guards those endpoints (the other half of the contract)", () => {
    assert.match(
      ROUTES,
      /app\.get\("\/api\/reverse-geocode",\s*requireCustomerAuth/,
    );
    assert.match(
      ROUTES,
      /app\.get\("\/api\/support\/messages",\s*requireCustomerAuth/,
    );
    assert.match(
      ROUTES,
      /app\.post\("\/api\/support\/messages",\s*requireCustomerAuth/,
    );
  });
});

// ── H2 — driver approval never enforced ─────────────────────────────────────
describe("H2 — a pending or rejected driver must not be able to work", () => {
  const mw = functionBody(ROUTES, "async function requireDriverAuth");

  test("requireDriverAuth checks the driver's approval status", () => {
    assert.match(
      mw,
      /driver\.status\s*!==\s*"approved"/,
      "REGRESSION: approval is not enforced — a pending or admin-rejected driver can go online, take batches with customer PII, and collect cash",
    );
    assert.match(
      mw,
      /res\.status\(403\)/,
      "a non-approved driver must be refused",
    );
  });

  test("only the screens needed to show the pending state stay open", () => {
    assert.match(ROUTES, /DRIVER_PREAPPROVAL_ROUTES\s*=\s*\[/);
    const list = ROUTES.slice(ROUTES.indexOf("DRIVER_PREAPPROVAL_ROUTES"));
    const closing = list.indexOf("]");
    const allowed = list.slice(0, closing);
    for (const dangerous of [
      "toggle-online",
      "batch/accept",
      "complete-order",
      "wallet",
      "settlement",
    ]) {
      assert.ok(
        !allowed.includes(dangerous),
        `REGRESSION: ${dangerous} is reachable before approval`,
      );
    }
  });
});

// ── H3 — ORDER_TRANSITIONS missing keys ─────────────────────────────────────
describe("H3 — the order state machine must cover every status", () => {
  test("`ready` can move to pickup (the vendor→driver handoff)", () => {
    assert.ok(
      ORDER_TRANSITIONS.ready,
      "REGRESSION: `ready` has no key, so EVERY transition out of it is blocked",
    );
    assert.ok(
      ORDER_TRANSITIONS.ready.includes("in_delivery") ||
        ORDER_TRANSITIONS.ready.includes("picked_up"),
      "a driver must be able to pick up an order the vendor marked ready",
    );
  });

  test("`preparing` can reach `ready`", () => {
    assert.ok(
      ORDER_TRANSITIONS.preparing.includes("ready"),
      "the vendor marks orders ready from preparing",
    );
  });

  test("every declared status is a key", () => {
    // A missing key silently blocks that status forever, which is how this bug
    // survived: `ORDER_TRANSITIONS[current] ?? []` never throws.
    const declared =
      (FIREBASE.match(/status:\s*("[a-z_]+"\s*\|\s*)+"[a-z_]+";/) || [""])[0]
        .match(/"([a-z_]+)"/g)
        ?.map((s) => s.replace(/"/g, "")) ?? [];
    assert.ok(declared.length >= 8, "could not read the declared status union");
    const missing = declared.filter((s) => !(s in ORDER_TRANSITIONS));
    assert.deepEqual(
      missing,
      [],
      `statuses with no transition entry: ${missing.join(", ")}`,
    );
  });

  test("pickup-order honours the return value instead of reporting success", () => {
    const body = handlerBody(
      ROUTES,
      'app.post("/api/driver/batch/pickup-order"',
    );
    assert.doesNotMatch(
      body,
      /^\s*await updateOrderStatus\(orderId, "in_delivery"\);/m,
      "REGRESSION: the blocked-transition result is discarded — pickedUpAt is written and 'on the way' pushed while the order never moves",
    );
    assert.match(body, /const moved = await updateOrderStatus/);
    assert.match(
      body,
      /res\.status\(409\)/,
      "a blocked transition must surface as an error",
    );
  });
});

// ── H4 / H5 — order pricing inputs ──────────────────────────────────────────
describe("H4 — serviceFee must be server-authoritative", () => {
  test("the request body value is not used for pricing", () => {
    const body = handlerBody(ROUTES, 'app.post("/api/orders"');
    assert.doesNotMatch(
      body,
      /const verifiedServiceFee = Number\(serviceFee\)/,
      "REGRESSION: {serviceFee:-50000} yields a near-zero or negative cash order — free food, unbounded",
    );
    assert.match(
      body,
      /getConfiguredServiceFee\(\)/,
      "the fee must come from appSettings, like the delivery fee",
    );
  });

  test("the total is floored at zero", () => {
    const body = handlerBody(ROUTES, 'app.post("/api/orders"');
    assert.match(
      body,
      /const verifiedTotal = Math\.max\(\s*0,/,
      "a promo larger than the cart must never store a negative total",
    );
  });
});

describe("H5 — cart quantity must be validated", () => {
  test("a negative quantity cannot create a credit line", () => {
    assert.equal(
      sanitizeQuantity(-5),
      1,
      "REGRESSION: a negative quantity cancels out the rest of the cart — free order",
    );
  });

  test("Infinity never reaches the ledger", () => {
    // "1e999" parses to Infinity, which poisons every later sum on that account.
    assert.equal(sanitizeQuantity("1e999"), 1);
    assert.equal(sanitizeQuantity(Infinity), 1);
    assert.equal(sanitizeQuantity(NaN), 1);
  });

  test("ordinary quantities are untouched", () => {
    assert.equal(sanitizeQuantity(3), 3);
    assert.equal(sanitizeQuantity("2"), 2);
    assert.equal(
      sanitizeQuantity(undefined),
      1,
      "missing quantity keeps the old `|| 1` behaviour",
    );
  });

  test("quantity is capped", () => {
    assert.equal(sanitizeQuantity(10_000), MAX_ITEM_QUANTITY);
    assert.equal(
      sanitizeQuantity(2.9),
      2,
      "fractional quantities floor, they do not round up",
    );
  });

  test("the order route uses the sanitizer", () => {
    const body = handlerBody(ROUTES, 'app.post("/api/orders"');
    assert.doesNotMatch(
      body,
      /Number\(it\.quantity\)\s*\|\|\s*1/,
      "REGRESSION: raw coercion is back",
    );
    assert.match(body, /sanitizeQuantity\(it\.quantity\)/);
  });
});

// ── H6 — driver order ownership ─────────────────────────────────────────────
describe("H6 — driver routes must verify the order belongs to the caller", () => {
  const routes = [
    "/api/driver/start-delivery",
    "/api/driver/report-issue",
    "/api/driver/batch/arrived-at-store",
    "/api/driver/batch/pickup-order",
    "/api/driver/batch/complete-order",
  ];

  for (const route of routes) {
    test(`${route} asserts ownership`, () => {
      const body = handlerBody(ROUTES, `app.post("${route}"`);
      assert.ok(body.length > 0, `could not locate ${route}`);
      assert.match(
        body,
        /assertOrderOwnership\(res, orderId, phoneNumber\)/,
        `REGRESSION: any authenticated driver can drive ${route} for an arbitrary order`,
      );
    });
  }

  test("the guard is not gated on an optional field", () => {
    // The original guard was `if (batchId && …)`, so omitting batchId skipped it.
    const body = handlerBody(
      ROUTES,
      'app.post("/api/driver/batch/pickup-order"',
    );
    const guardAt = body.indexOf("assertOrderOwnership");
    const conditional = body.slice(0, guardAt).match(/if\s*\(batchId\s*&&/);
    assert.ok(
      guardAt !== -1 &&
        (!conditional ||
          body.indexOf("assertOrderOwnership") >
            body.indexOf("if (batchId &&")),
      "the order-level guard must run unconditionally",
    );
  });

  test("ownership is decided from persisted data, not in-process memory", () => {
    const fn = functionBody(ROUTES, "async function orderBelongsToDriver");
    assert.match(fn, /order\.driverPhone/);
    assert.match(fn, /order\.batchId/);
    assert.doesNotMatch(
      fn,
      /driverAssignments/,
      "an in-memory map is empty after a restart, which would silently deny every driver",
    );
  });
});

// ── H7 — vendor status never re-checked ─────────────────────────────────────
describe("H7 — suspending a vendor must actually cut them off", () => {
  const mw = functionBody(VENDOR, "async function requireVendor");

  test("requireVendor re-reads the vendor's status", () => {
    assert.match(
      mw,
      /VENDOR_BLOCKED_STATUSES\.includes\(status\)/,
      "REGRESSION: the 7-day token keeps working after suspension and mobile-auth mints fresh ones",
    );
    assert.match(mw, /res\.status\(403\)/);
  });

  test("the blocked set matches what POST /api/vendor/login already refuses", () => {
    const list = VENDOR.slice(VENDOR.indexOf("VENDOR_BLOCKED_STATUSES"));
    const decl = list.slice(0, list.indexOf("]"));
    for (const s of ["pending", "suspended", "rejected"]) {
      assert.ok(
        decl.includes(`"${s}"`),
        `${s} must be blocked, as the password login already does`,
      );
    }
  });
});

// ── H8 / H9 — PII over sockets and in public responses ──────────────────────
describe("H8 — settlement socket events must carry no payload", () => {
  test("the raw payload is not broadcast to every socket", () => {
    const section = ROUTES.slice(
      ROUTES.indexOf('orderEvents.on("settlement:request"'),
    );
    const scoped = stripComments(section.slice(0, 900));
    assert.doesNotMatch(
      scoped,
      /ioServer\.emit\("settlement[s]?:(request|changed)",\s*payload\)/,
      "REGRESSION: every driver's phone, name and outstanding balance is streamed to anonymous sockets",
    );
    assert.match(
      scoped,
      /ioServer\.emit\("settlements:changed"\)/,
      "the refresh ping itself must stay",
    );
  });
});

describe("H9 — the public ratings endpoint must not expose phone numbers", () => {
  test("only the last 4 digits leave the server", () => {
    const body = handlerBody(ROUTES, 'app.get("/api/stores/:id/ratings"');
    assert.doesNotMatch(
      body,
      /customerPhone:\s*r\.customerPhone\s*\?\?\s*""/,
      "REGRESSION: unauthenticated bulk harvest of reviewer phone numbers correlated to stores",
    );
    assert.match(body, /String\(r\.customerPhone\)\.slice\(-4\)/);
  });
});

// ── H10 / H11 — Firestore rules ─────────────────────────────────────────────
describe("H10/H11 — collections carrying PII must not be world-readable", () => {
  function blockFor(collection) {
    const re = new RegExp(
      `match\\s+/${collection}/\\{[^}]*\\}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`,
    );
    const m = RULES.match(re);
    return m
      ? m[1]
          .split("\n")
          .map((l) => l.replace(/\/\/.*$/, ""))
          .join("\n")
      : "";
  }

  test("app_settings (holds the admin Expo push token) is closed", () => {
    assert.doesNotMatch(
      blockFor("app_settings"),
      /allow[^;]*\bread\b[^;]*:\s*if\s+true/,
      "REGRESSION: a readable admin push token means anyone can spoof admin notifications via Expo's unauthenticated send API",
    );
  });

  test("vendorProducts (carries vendorPhone) is closed", () => {
    assert.doesNotMatch(
      blockFor("vendorProducts"),
      /allow[^;]*\bread\b[^;]*:\s*if\s+true/,
      "REGRESSION: bulk harvest of every store owner's personal phone number",
    );
  });
});

// ── H12 — order documents exceeding Firestore's 1MB limit ───────────────────
describe("H12 — inline item images must not blow the 1MB document limit", () => {
  const dataUri = (kb) => "data:image/webp;base64," + "A".repeat(kb * 1024);

  test("a small cart is returned completely untouched", () => {
    const items = [
      { productId: "a", image: dataUri(50) },
      { productId: "b", image: dataUri(50) },
    ];
    assert.deepEqual(capOrderItemImages(items), items);
  });

  test("a large cart is capped instead of failing the write", () => {
    // ~15 items x 60KB = 900KB of images alone; the write used to be rejected and
    // checkout was permanently broken for that cart.
    const items = Array.from({ length: 15 }, (_, i) => ({
      productId: String(i),
      image: dataUri(60),
    }));
    const capped = capOrderItemImages(items);
    const bytes = capped.reduce((n, it) => n + it.image.length, 0);
    assert.ok(
      bytes <= 700_000,
      `REGRESSION: ${bytes} bytes of images would be written into one order document`,
    );
    assert.equal(
      capped.length,
      items.length,
      "no item may be dropped — only its inline image",
    );
    assert.ok(
      capped.every((it) => it.productId),
      "productId must survive so the image is still resolvable",
    );
  });

  test("items without images are passed through", () => {
    const items = [{ productId: "a" }, { productId: "b", image: "" }];
    assert.deepEqual(capOrderItemImages(items), items);
  });

  test("the order route applies the cap", () => {
    const body = handlerBody(ROUTES, 'app.post("/api/orders"');
    assert.match(body, /items: capOrderItemImages\(items\)/);
  });

  test("limitImageSize is no longer a no-op that only looks like a guard", () => {
    const fn = functionBody(ROUTES, "function limitImageSize");
    assert.doesNotMatch(
      fn,
      /if \(img\.length <= maxLen\) return img;\s*\n\s*return img;/,
      "REGRESSION: every branch returns img unchanged",
    );
  });
});

// ── H13 — vendor product images ─────────────────────────────────────────────
describe("H13 — vendor product images must go to Storage, not into the document", () => {
  test("processAndSaveImage uploads both derivatives to Storage", () => {
    const fn = functionBody(VENDOR, "async function processAndSaveImage");
    // BOTH derivatives must go to Storage — uploading only the full image while the
    // thumbnail stays inline still puts ~5 blobs in the document.
    const uploads = (fn.match(/uploadToFirebaseStorage\(/g) || []).length;
    assert.equal(
      uploads,
      2,
      `REGRESSION: ${uploads} of 2 image derivatives go to Storage. Base64-in-document means 5 images per product exceeds Firestore's 1MB limit and the vendor cannot save at all`,
    );
  });

  test("no Base64 fallback remains — a Storage failure must surface", () => {
    // This assertion USED to require `catch (storageErr` here, i.e. it encoded the
    // Base64 fallback as a requirement. Once the bucket was provisioned
    // (gs://onway-74c20.firebasestorage.app) that premise inverted: silently
    // degrading to Base64 recreates the very 1MB-document failure this guard exists
    // to prevent, and hides it. The function must now let the error propagate.
    const fn = functionBody(VENDOR, "async function processAndSaveImage");
    assert.doesNotMatch(
      fn,
      /data:image\/webp;base64/,
      "REGRESSION: processAndSaveImage builds a Base64 data URI again — a failed upload would be written into the product document instead of reported",
    );
  });

  test("the stale 'Storage is not provisioned' claim is gone", () => {
    assert.doesNotMatch(
      VENDOR,
      /Firebase Storage is not provisioned for this project/,
      "the bucket-name defect is fixed; the comment kept sending future changes down the Base64 path",
    );
  });
});

// ── H14 — non-transactional money writes ────────────────────────────────────
describe("H14 — driver payments and adjustments must be transactional", () => {
  for (const fnName of ["recordDriverPayment", "recordDriverAdjustment"]) {
    test(`${fnName} reads and writes inside one transaction`, () => {
      const fn = functionBody(FIREBASE, `export async function ${fnName}`);
      assert.match(
        fn,
        /runTransaction/,
        `REGRESSION: ${fnName} is read-modify-write again — a concurrent payment and settlement lose one update`,
      );
      assert.doesNotMatch(
        fn,
        /await db\s*\n?\s*\.collection\("driverFinancialAccounts"\)[\s\S]{0,120}\.get\(\)/,
        "the balance read must happen through the transaction, not before it",
      );
    });
  }

  test("the audit row is written in the same transaction as the balance", () => {
    const fn = functionBody(
      FIREBASE,
      "export async function recordDriverPayment",
    );
    assert.doesNotMatch(
      fn,
      /await db\.collection\("driverTransactions"\)\.add\(/,
      "REGRESSION: the audit row survives a rolled-back balance change, so ledger and audit disagree",
    );
    assert.match(
      fn,
      /tx\.set\(database\.collection\("driverTransactions"\)\.doc\(\)/,
    );
  });
});

// ── H15 — settlement double-payment ─────────────────────────────────────────
describe("H15 — completing the same settlement twice must not pay twice", () => {
  test("a request-driven settlement gets a deterministic payment id", () => {
    const a = settlementPaymentId({
      accountType: "driver",
      accountId: "0770",
      amount: 1,
      requestId: "req-1",
    });
    const b = settlementPaymentId({
      accountType: "driver",
      accountId: "0770",
      amount: 1,
      requestId: "req-1",
    });
    assert.equal(
      a,
      b,
      "REGRESSION: an admin double-tap creates a second payment and clears the balance twice",
    );
    assert.ok(a && a.startsWith("stl_"));
  });

  test("different requests get different ids", () => {
    assert.notEqual(
      settlementPaymentId({
        accountType: "driver",
        accountId: "x",
        amount: 1,
        requestId: "a",
      }),
      settlementPaymentId({
        accountType: "driver",
        accountId: "x",
        amount: 1,
        requestId: "b",
      }),
    );
  });

  test("a caller-supplied key also dedupes", () => {
    assert.equal(
      settlementPaymentId({
        accountType: "vendor",
        accountId: "v1",
        amount: 1,
        idempotencyKey: "k",
      }),
      settlementPaymentId({
        accountType: "vendor",
        accountId: "v1",
        amount: 1,
        idempotencyKey: "k",
      }),
    );
  });

  test("an unidentified manual payment keeps the previous random id", () => {
    assert.equal(
      settlementPaymentId({ accountType: "driver", accountId: "x", amount: 1 }),
      null,
    );
  });

  test("the id is a legal Firestore document id", () => {
    const id = settlementPaymentId({
      accountType: "driver",
      accountId: "x",
      amount: 1,
      idempotencyKey: "a/b c",
    });
    assert.ok(
      !id.includes("/"),
      "a slash would create a subcollection path instead of a document",
    );
    assert.ok(id.length < 1500);
  });

  test("the engine short-circuits on an existing payment", () => {
    const SETTLEMENT = read("server/settlement.ts");
    assert.match(SETTLEMENT, /if \(existing\.exists\)/);
    assert.match(SETTLEMENT, /duplicate: true/);
    assert.match(
      SETTLEMENT,
      /!\(result as any\)\.duplicate/,
      "a replay must not re-run FIFO bookkeeping against money that was never paid",
    );
  });
});

// ── H16 / H17 — attribute-context escaping in the admin dashboard ───────────
describe("H16/H17 — JS-string-in-attribute values need a JS-aware escape", () => {
  test("escapeJsInAttr exists and backslash-escapes the quote", () => {
    // escapeAttr turns ' into &#39;, which the HTML parser decodes back to ' BEFORE
    // the JS is parsed — so it does not protect this context at all.
    assert.match(ADMIN, /function escapeJsInAttr/);
    const fn = ADMIN.slice(
      ADMIN.indexOf("function escapeJsInAttr"),
      ADMIN.indexOf("function escapeJsInAttr") + 500,
    );
    assert.match(
      fn,
      /\.replace\(\/'\/g, "\\\\'"\)/,
      "the quote must be backslash-escaped, not entity-escaped",
    );
    assert.match(
      fn,
      /\\\\\\\\/,
      "backslashes themselves must be escaped first",
    );
  });

  test("no onclick handler passes a value through escapeHtml", () => {
    const offenders = ADMIN.match(/onclick="[^"]*escapeHtml\(/g) || [];
    assert.deepEqual(
      offenders,
      [],
      `REGRESSION: escapeHtml does not escape quotes — a driver named x',alert(1),' injects JS. Found ${offenders.length} site(s)`,
    );
  });

  test("the merchant card no longer hand-rolls a single-quote replace", () => {
    assert.doesNotMatch(
      ADMIN,
      /const nameEsc\s*=\s*name\.replace\(\/'\/g/,
      'REGRESSION: that leaves <, > and " unescaped — a store name breaks out of the attribute entirely',
    );
    assert.match(ADMIN, /const nameEsc\s*=\s*escapeJsInAttr\(name\)/);
  });

  test("the vendor product name uses the same escape", () => {
    assert.match(ADMIN, /const safeName = escapeJsInAttr\(/);
  });
});

// ── H18 — the public website ────────────────────────────────────────────────
describe("H18 — `/` must not be the Expo Go developer preview", () => {
  // Strip the HTML comment that explains WHY this file exists — it necessarily
  // mentions Expo Go, and only what the visitor actually sees is being asserted on.
  const PUBLIC = read("server/templates/landing-public.html").replace(
    /<!--[\s\S]*?-->/g,
    "",
  );
  const PREVIEW = read("server/templates/landing-page.html");

  test("the public page does not tell visitors to install Expo Go", () => {
    assert.doesNotMatch(
      PUBLIC,
      /Expo Go/i,
      "REGRESSION: every visitor is told to install a different app",
    );
    assert.doesNotMatch(
      PUBLIC,
      /host\.exp\.exponent|id982107779/,
      "those store links point at Expo Go",
    );
  });

  test("the public page is the default and the preview is opt-in", () => {
    const fn = functionBody(INDEX, "function serveLandingPage");
    assert.match(fn, /req\.query\.expo !== undefined/);
    assert.match(
      fn,
      /wantsExpoPreview \? landingPageTemplate : publicPageTemplate/,
      "REGRESSION: the developer preview is served to the public again",
    );
  });

  test("the developer preview is not indexable", () => {
    assert.match(PREVIEW, /name="robots" content="noindex/);
    assert.match(
      functionBody(INDEX, "function serveLandingPage"),
      /X-Robots-Tag/,
    );
  });

  test("the public page stays indexable with the Arabic consumer copy", () => {
    assert.match(PUBLIC, /name="robots" content="index, follow"/);
    assert.match(PUBLIC, /og:title/);
  });

  test("no fabricated store listing is claimed", () => {
    assert.doesNotMatch(
      PUBLIC,
      /apps\.apple\.com|play\.google\.com/,
      "there is no published app to link to yet",
    );
  });
});

// ── H19 — upload content types ──────────────────────────────────────────────
// ── Storage integration (Phase 2.2B) ────────────────────────────────────────
describe("Storage — no upload path may degrade to Base64 or local disk", () => {
  // The bucket is provisioned (gs://onway-74c20.firebasestorage.app). Every
  // fallback that used to exist turned a hard configuration fault into silent
  // Base64 blobs inside Firestore documents — which is precisely how the wrong
  // bucket name went unnoticed for so long, and how order and product documents
  // drifted toward the 1MB limit. A failed upload must now fail the request.
  const SERVER = ROUTES + "\n" + VENDOR;

  test("no route catches a Storage error and substitutes a data URI", () => {
    const offenders = SERVER.split("\n")
      .map((l, i) => [i + 1, l])
      .filter(([, l]) => /=\s*`data:image\/[a-z]+;base64,\$\{/.test(l))
      .map(([n, l]) => `${n}: ${l.trim().slice(0, 80)}`);
    assert.deepEqual(
      offenders,
      [],
      `REGRESSION: a Storage failure is being written into Firestore as Base64 instead of surfacing:\n  ${offenders.join("\n  ")}`,
    );
  });

  test("the profile upload does not fall back to the ephemeral local disk", () => {
    const body = handlerBody(ROUTES, 'app.post("/api/upload"');
    assert.doesNotMatch(
      body,
      /return res\.json\(\{ url: `\/uploads\/\$\{req\.file\.filename\}` \}\)/,
      "REGRESSION: /uploads is wiped on every redeploy — that URL works in testing and 404s a week later",
    );
    assert.match(body, /res\.status\(502\)/, "a failed upload must be reported, not papered over");
  });

  test("storage.rules exists and denies all client access", () => {
    // Every write goes through the Admin SDK, which bypasses rules. This app does
    // not use Firebase Auth, so request.auth is always null and any rule written in
    // terms of it would be dead — default-deny is the only correct model.
    const rules = read("storage.rules");
    assert.match(rules, /service firebase\.storage/);
    assert.match(
      rules,
      /match \/\{allPaths=\*\*\}\s*\{\s*allow read, write: if false;/,
      "REGRESSION: the bucket must not be client-readable or client-writable",
    );
  });

  test("firebase.json deploys storage.rules", () => {
    const fb = JSON.parse(read("firebase.json"));
    assert.equal(
      fb.storage?.rules,
      "storage.rules",
      "without this block `firebase deploy` never publishes the Storage rules and the bucket keeps whatever defaults the console generated",
    );
  });
});

describe("H19 — uploads must be images, decided by the server", () => {
  test("the disk uploader has a fileFilter", () => {
    // Scope to THIS multer() call — `uploadWebP` right below has its own filter, and
    // a loose regex would happily match that one instead.
    const start = ROUTES.indexOf("const upload = multer({");
    assert.ok(start !== -1, "could not locate the disk uploader");
    const decl = ROUTES.slice(start, ROUTES.indexOf("\n});", start));
    assert.match(
      decl,
      /fileFilter/,
      "REGRESSION: with no filter an evil.html lands in /uploads and is served from the app's own origin under Access-Control-Allow-Origin: *",
    );
    assert.match(decl, /isAllowedImageMime\(file\.mimetype\)/);
  });

  test("the stored filename extension never comes from the client", () => {
    assert.doesNotMatch(
      ROUTES,
      /const uniqueName = `\$\{randomUUID\(\)\}\$\{path\.extname\(file\.originalname\)\}`/,
      "REGRESSION: the client picks the extension, and express.static picks the Content-Type from it",
    );
    assert.match(ROUTES, /safeImageExtension\(file\.mimetype\)/);
  });

  test("/uploads is served with nosniff", () => {
    assert.match(ROUTES, /X-Content-Type-Options["'\s,:]+nosniff/);
  });

  test("the allowlist accepts images and rejects everything else", () => {
    assert.equal(isAllowedImageMime("image/png"), true);
    assert.equal(isAllowedImageMime("text/html"), false);
    assert.equal(isAllowedImageMime(undefined), false);
    assert.equal(safeImageExtension("image/png"), ".png");
    assert.equal(
      safeImageExtension("text/html"),
      ".jpg",
      "an unknown type must not produce an executable extension",
    );
    assert.equal(
      safeImageContentType("text/html"),
      "image/jpeg",
      "never echo the client's Content-Type back",
    );
  });

  test("magic-byte sniffing rejects HTML while accepting real photos", () => {
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13,
    ]);
    const jpeg = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.alloc(8),
    ]);
    const html = Buffer.from("<html><script>alert(1)</script></html>");
    assert.equal(sniffImageMime(png), "image/png");
    assert.equal(sniffImageMime(jpeg), "image/jpeg");
    assert.equal(
      sniffImageMime(html),
      null,
      "REGRESSION: HTML uploaded as application/octet-stream is stored XSS",
    );
    assert.equal(
      sniffImageMime(Buffer.alloc(3)),
      null,
      "a truncated file is not an image",
    );
  });

  test("the support upload decides on the bytes, not the declared type", () => {
    const body = handlerBody(ROUTES, 'app.post("/api/support/upload-image"');
    assert.match(body, /sniffImageMime\(req\.file\.buffer\)/);
    assert.doesNotMatch(
      body,
      /req\.file\.mimetype \|\| "image\/jpeg"/,
      "REGRESSION: the client's Content-Type is stored on the object again",
    );
  });
});

// ── H20 / H21 — deployment scripts ──────────────────────────────────────────
describe("H20/H21 — deploy scripts must actually deploy", () => {
  const UPDATE = read("deployment/update.sh");
  const SSL = read("deployment/ssl-setup.sh");

  test("update.sh defines every helper it calls (set -euo pipefail is fatal)", () => {
    const defined = new Set(
      [...UPDATE.matchAll(/^([a-z_]+)\(\)/gm)].map((m) => m[1]),
    );
    const used = new Set(
      [...UPDATE.matchAll(/^\s*(info|success|err|warn)\b/gm)].map((m) => m[1]),
    );
    const missing = [...used].filter((u) => !defined.has(u));
    assert.deepEqual(
      missing,
      [],
      `REGRESSION: '${missing.join(", ")}' is undefined — the deploy exits 127 after the build but BEFORE pm2 start, leaving the site down`,
    );
  });

  test("PM2 is reloaded through the ecosystem file so .env is re-parsed", () => {
    for (const [name, src] of [
      ["update.sh", UPDATE],
      ["ssl-setup.sh", SSL],
    ]) {
      assert.match(
        src,
        /pm2 startOrReload ecosystem\.config\.js --update-env/,
        `REGRESSION in ${name}: 'pm2 reload onway' replays the env captured at first start, so a rewritten ALLOWED_ORIGINS never reaches the process and fail-closed CORS 403s every browser request`,
      );
    }
  });

  test("ssl-setup.sh no longer swallows a failed reload", () => {
    assert.doesNotMatch(
      SSL,
      /pm2 reload onway 2>\/dev\/null \|\| true/,
      "`|| true` hid the fact that the new ALLOWED_ORIGINS was never applied",
    );
  });
});

// ── H22 — admin session revocation ──────────────────────────────────────────
describe("H22 — revoked admin sessions must stay revoked across a restart", () => {
  test("revocation state is persisted, not process-local", () => {
    assert.match(
      ADMIN_AUTH,
      /function persistRevocationState/,
      "REGRESSION: JWT_SECRET is unchanged across restarts, so a stolen 7-day admin cookie verifies again — and max_memory_restart guarantees restarts",
    );
    assert.match(ADMIN_AUTH, /loadRevocationState/);
  });

  test("both revocation paths persist", () => {
    const one = functionBody(ADMIN_AUTH, "export function invalidateSession");
    const all = functionBody(
      ADMIN_AUTH,
      "export function invalidateAllSessions",
    );
    assert.match(one, /persistRevocationState\(\)/);
    assert.match(all, /persistRevocationState\(\)/);
  });

  test("the state is hydrated before the server accepts requests", () => {
    const boot = INDEX.slice(INDEX.indexOf("await loadRevocationState()"));
    assert.ok(
      boot.length > 0,
      "loadRevocationState must be awaited during boot",
    );
    assert.ok(
      INDEX.indexOf("await loadRevocationState()") <
        INDEX.indexOf("const server = await registerRoutes"),
      "hydration must complete before routes are mounted",
    );
  });

  test("the persisted set is pruned so it cannot grow forever", () => {
    assert.match(
      functionBody(ADMIN_AUTH, "function persistRevocationState"),
      /expiresAt > now/,
    );
  });
});

// ── H23 — route-local error.message leaks ───────────────────────────────────
describe("H23 — route handlers must not return raw error messages", () => {
  for (const [name, src] of [
    ["routes.ts", ROUTES],
    ["vendor.ts", VENDOR],
  ]) {
    test(`${name} has no 5xx that echoes error.message`, () => {
      const offenders = src
        .split("\n")
        .filter((l) =>
          /res\.status\(5\d\d\)\.json\(\{\s*error:\s*(error|err)\??\.message/.test(
            l,
          ),
        );
      assert.deepEqual(
        offenders.map((l) => l.trim()),
        [],
        "REGRESSION: the hardened global handler never runs for these, so Firestore project ids, collection names and index-creation URLs reach unauthenticated clients",
      );
    });
  }

  test("the sanitised sites still log the real error server-side", () => {
    const lines = ROUTES.split("\n");
    const unlogged = [];
    lines.forEach((l, i) => {
      if (!/res\.status\(5\d\d\)\.json\(\{ error: GENERIC_SERVER_ERROR/.test(l))
        return;
      const ctx = lines.slice(Math.max(0, i - 6), i + 1).join("\n");
      if (!ctx.includes("console.")) unlogged.push(i + 1);
    });
    assert.deepEqual(
      unlogged,
      [],
      `sanitising must not make failures invisible; lines: ${unlogged.join(", ")}`,
    );
  });
});

// ── H24 / H25 / H26 — unbounded growth and cron re-entrancy ─────────────────
describe("H24 — the rejection cooldown map must be pruned", () => {
  test("expired entries are evicted", () => {
    assert.match(
      ROUTES,
      /function pruneDriverCooldowns/,
      "REGRESSION: the map grows by one entry per rejection forever, crosses max_memory_restart, and the PM2 restart wipes the driver queue mid-shift",
    );
    assert.match(
      functionBody(ROUTES, "function pruneDriverCooldowns"),
      /cooldowns\.delete\(orderId\)/,
    );
  });

  test("the read path prunes rather than only reading", () => {
    assert.match(
      ROUTES,
      /const driverCooldowns = pruneDriverCooldowns\(phoneNumber\)/,
    );
  });
});

describe("H25 — the redundant completed-orders cache is gone", () => {
  test("no in-memory mirror of driverCompletedOrders is kept", () => {
    assert.doesNotMatch(
      ROUTES,
      /driverCompletedOrders\.set\(/,
      "REGRESSION: the record is already persisted by the awaited saveDriverCompletedOrder above; this only retains ~180k objects a year",
    );
    assert.doesNotMatch(ROUTES, /const driverCompletedOrders: Map</);
  });

  test("completed orders still come back from Firestore", () => {
    assert.match(
      functionBody(ROUTES, "async function getCompletedOrders"),
      /getDriverCompletedOrdersFromDB/,
    );
  });
});

describe("H26 — the 60s cron must be bounded and non-overlapping", () => {
  test("the scan is limited", () => {
    const fn = functionBody(INDEX, "async function checkStaleOrders");
    assert.match(
      fn,
      /\.limit\(STALE_ORDER_SCAN_LIMIT\)/,
      "REGRESSION: an unbounded scan plus a sequential vendor read + push + write per order easily outruns the 60s interval",
    );
  });

  test("a still-running pass blocks the next tick", () => {
    const fn = functionBody(INDEX, "function startStaleOrderJob");
    assert.match(
      fn,
      /if \(staleOrderRunInFlight\)/,
      "REGRESSION: runs stack and re-read the same orders before the notified-marker is written — duplicate vendor pushes and multiplying Firestore load",
    );
    assert.match(
      fn,
      /\.finally\(/,
      "the flag must be cleared even when the pass throws",
    );
  });
});
