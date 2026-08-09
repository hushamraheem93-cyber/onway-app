/**
 * Vendor commission tests (audit finding H-06).
 *
 * The same stored value was read three different ways:
 *   `v.commissionPercent || 10`  → a contracted 0% silently became 10%
 *   `v.commissionPercent ?? 10`  → correct, but still let NaN / negatives through
 *   `v.commissionPercent ?? 0`   → the store's OWN wallet screen
 *
 * So a store signed at an introductory 0% had `commissionPercent: 0` written back
 * as 10 by POST /api/admin/vendors, every restaurant order then stamped
 * vendorCommissionAmount at 10% — the figure accrueDeliveredOrderSettlements
 * prefers over recomputing — and the store's own screen kept showing 0%. The
 * discrepancy only surfaced at payout.
 *
 * Run:  node --test tests/unit/commission-percent.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_COMMISSION_PERCENT,
  isValidCommissionPercent,
  commissionPercentOf,
} from "../../server/orderValidation.ts";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, "../../", p), "utf8");
const ROUTES = read("server/routes.ts");
const VENDOR = read("server/vendor.ts");

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

const CREATE = handlerBody(ROUTES, 'app.post("/api/admin/vendors"');
const UPDATE = handlerBody(ROUTES, 'app.put("/api/admin/vendors/:id"');

describe("H-06 — zero is a real rate, not a missing one", () => {
  test("0% is valid and stays 0", () => {
    assert.equal(isValidCommissionPercent(0), true);
    assert.equal(commissionPercentOf(0), 0, "REGRESSION: a contracted 0% became the default again");
    assert.equal(commissionPercentOf("0"), 0);
  });

  test("an ordinary rate is untouched", () => {
    for (const r of [8, 10, 12, 15.5, "8", "12.5"]) {
      assert.equal(isValidCommissionPercent(r), true);
      assert.equal(commissionPercentOf(r), Number(r));
    }
  });

  test("100% is the top of the range and is allowed", () => {
    assert.equal(isValidCommissionPercent(100), true);
    assert.equal(commissionPercentOf(100), 100);
  });

  test("the arithmetic a 0% store expects", () => {
    const bill = (base, rate) => Math.round(base * (commissionPercentOf(rate) / 100));
    assert.equal(bill(400000, 0), 0, "a 0% store must be billed nothing");
    assert.equal(bill(400000, 10), 40000);
    assert.equal(bill(400000, undefined), 40000, "no rate set → the platform default");
  });
});

describe("H-06 — unusable rates never reach the arithmetic", () => {
  for (const bad of [NaN, "abc", "", null, undefined, -1, -10, 101, 1000, Infinity, -Infinity, "1e400"]) {
    test(`${JSON.stringify(String(bad))} is refused by the write guard`, () => {
      assert.equal(isValidCommissionPercent(bad), false);
    });

    test(`${JSON.stringify(String(bad))} falls back to the default on read`, () => {
      const r = commissionPercentOf(bad);
      assert.equal(r, DEFAULT_COMMISSION_PERCENT);
      assert.ok(Number.isFinite(r * 400000), "REGRESSION: NaN would poison the ledger");
    });
  }

  test("the default is the platform rate the settlement engine already used", () => {
    assert.equal(DEFAULT_COMMISSION_PERCENT, 10);
  });

  test("an explicit fallback is honoured for callers that need one", () => {
    assert.equal(commissionPercentOf(undefined, 0), 0);
    assert.equal(commissionPercentOf("junk", 5), 5);
  });
});

describe("H-06 — the write paths validate instead of coercing", () => {
  test("POST /api/admin/vendors no longer uses `Number(x) || 10`", () => {
    assert.doesNotMatch(
      CREATE,
      /commissionPercent: Number\(commissionPercent\) \|\| 10/,
      "REGRESSION: a contracted 0% is stored as 10 again",
    );
  });

  test("POST refuses an unusable rate with 400", () => {
    assert.match(CREATE, /!isValidCommissionPercent\(commissionPercent\)/);
    assert.match(CREATE, /نسبة العمولة غير صالحة/);
  });

  test("POST still defaults when the field is simply omitted", () => {
    assert.match(CREATE, /\? DEFAULT_COMMISSION_PERCENT/);
  });

  test("PUT /api/admin/vendors/:id validates before it stores", () => {
    // The assignment itself is unchanged; what matters is that it is now gated.
    assert.doesNotMatch(
      UPDATE,
      /if \(body\.commissionPercent !== undefined\) vendorUpdates\.commissionPercent = Number/,
      "REGRESSION: NaN / negative / >100 rates are stored again",
    );
    const guard = UPDATE.indexOf("!isValidCommissionPercent(body.commissionPercent)");
    const store = UPDATE.indexOf("vendorUpdates.commissionPercent = Number(body.commissionPercent)");
    assert.ok(guard > -1 && store > -1, "a step went missing");
    assert.ok(guard < store, "the guard must run before the write");
    assert.match(UPDATE, /نسبة العمولة غير صالحة/);
  });
});

describe("H-06 — every read path resolves the rate the same way", () => {
  test("no `|| 10` survives anywhere in the server", () => {
    for (const [name, src] of [["routes.ts", ROUTES], ["vendor.ts", VENDOR]]) {
      assert.doesNotMatch(
        stripComments(src),
        /commissionPercent \|\| 10/,
        `REGRESSION: ${name} turns 0% into 10% again`,
      );
    }
  });

  test("the settlement accrual uses the shared resolver", () => {
    assert.match(
      ROUTES,
      /Math\.round\(\(orderValue \* commissionPercentOf\(v\.commissionPercent\)\) \/ 100\)/,
      "REGRESSION: `?? 10` lets a stored NaN through into the ledger",
    );
  });

  test("the amount stamped on the order uses the shared resolver", () => {
    // accrueDeliveredOrderSettlements prefers this stored figure over recomputing,
    // so a wrong value here is what actually gets billed.
    assert.match(ROUTES, /const vendorRate = commissionPercentOf\(vendor\.commissionPercent\);/);
    assert.match(ROUTES, /orderData\.vendorCommissionPercent = vendorRate;/);
    assert.match(ROUTES, /orderData\.vendorCommissionAmount = Math\.round\(restaurantSubtotal \* \(vendorRate \/ 100\)\);/);
  });

  test("the admin vendor statement uses the shared resolver", () => {
    assert.match(ROUTES, /orderBase\(o\) \* commissionPercentOf\(vendor\.commissionPercent\) \/ 100/);
  });

  test("the vendor list normaliser uses the shared resolver", () => {
    assert.match(ROUTES, /commissionPercent: commissionPercentOf\(v\.commissionPercent\)/);
  });

  test("the store's own wallet now agrees with the settlement engine", () => {
    assert.doesNotMatch(
      VENDOR,
      /Number\(\(vendorDoc\.data\(\) as any\)\?\.commissionPercent \?\? 0\) \|\| 0/,
      "REGRESSION: the store sees 0% while it is billed 10%",
    );
    assert.match(VENDOR, /const commissionRate = commissionPercentOf\(/);
  });

  test("the wallet and the ledger cannot disagree for the same stored value", () => {
    for (const stored of [undefined, null, 0, 8, "abc", -5, 150]) {
      const wallet = commissionPercentOf(stored);
      const ledger = commissionPercentOf(stored);
      assert.equal(wallet, ledger, `divergence for ${JSON.stringify(stored)}`);
    }
  });
});

describe("H-06 — earlier fixes are untouched", () => {
  const ORDERS = handlerBody(ROUTES, 'app.post("/api/orders"');
  test("H-01…H-05 guards all still present", () => {
    assert.match(ORDERS, /verifiedDiscount = Math\.min\(verifiedDiscount, verifiedSubtotal\)/);
    assert.match(ORDERS, /if \(isValidProductPrice\(vpPrice\)\)/);
    assert.match(ORDERS, /let verifiedDeliveryFee: number \| null = null/);
    assert.match(ORDERS, /const verifiedServiceFee = await getConfiguredServiceFee\(\);/);
    assert.match(ORDERS, /claimPromoUsage\(promoClaimant, promoCodeCanonical\)/);
  });
});
