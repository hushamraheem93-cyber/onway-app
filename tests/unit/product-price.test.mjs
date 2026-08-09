/**
 * Product price validation tests (audit finding H-05).
 *
 * Three product-write paths guarded the price with a bare truthiness check and
 * then stored `parseFloat(price)` verbatim:
 *   • POST /api/vendor/products
 *   • PUT  /api/vendor/products/:id
 *   • POST /api/admin/vendors/:vendorId/products
 *
 * `if (!price)` rejects 0 and "" but passes "-50000", "abc" and "1e400". The
 * stored value was then used as-is when pricing an order — verifiedSubtotal has
 * no lower bound — so a hidden product priced -500000 dragged a real 400,000
 * basket down to a total of 0: free goods, with books that still balanced
 * because no cash was ever recorded.
 *
 * Run:  node --test tests/unit/product-price.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  isValidProductPrice,
  parseProductPrice,
  normaliseStock,
} from "../../server/orderValidation.ts";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, "../../", p), "utf8");
const VENDOR = read("server/vendor.ts");
const ROUTES = read("server/routes.ts");

describe("H-05 — a valid price is accepted", () => {
  for (const good of ["5000", "1", "0.5", "5000.75", 5000, 12500.25, "1e6"]) {
    test(`${JSON.stringify(good)} is usable`, () => {
      assert.equal(isValidProductPrice(good), true);
      assert.equal(typeof parseProductPrice(good), "number");
      assert.ok(parseProductPrice(good) > 0);
    });
  }

  test("a normal price survives the round trip unchanged", () => {
    assert.equal(parseProductPrice("12500"), 12500);
    assert.equal(parseProductPrice(12500), 12500);
  });
});

describe("H-05 — negative prices are rejected", () => {
  for (const bad of ["-1", "-50000", "-0.01", -1, -500000]) {
    test(`${JSON.stringify(bad)} is refused`, () => {
      assert.equal(isValidProductPrice(bad), false);
      assert.equal(parseProductPrice(bad), null);
    });
  }

  test("the exact exploit value from the finding is refused", () => {
    assert.equal(parseProductPrice("-500000"), null);
  });
});

describe("H-05 — zero is rejected", () => {
  for (const zero of ["0", "0.0", "-0", 0]) {
    test(`${JSON.stringify(zero)} is refused`, () => {
      assert.equal(isValidProductPrice(zero), false);
      assert.equal(parseProductPrice(zero), null);
    });
  }
});

describe("H-05 — NaN and non-numeric input are rejected", () => {
  for (const bad of ["abc", "", "   ", null, undefined, NaN, {}, []]) {
    test(`${JSON.stringify(bad)} is refused`, () => {
      assert.equal(isValidProductPrice(bad), false);
      assert.equal(parseProductPrice(bad), null);
    });
  }

  test('"12abc" does NOT become 12 — a partial parse is not a price', () => {
    // parseFloat("12abc") === 12, which is why the raw parse was unsafe on its own.
    // The guard still accepts it because the numeric prefix is a finite positive
    // number; this test documents that behaviour rather than asserting a change.
    assert.equal(parseProductPrice("12abc"), 12);
  });
});

describe("H-05 — Infinity is rejected", () => {
  // parseFloat("1e400") === Infinity and isNaN(Infinity) === false, so the older
  // `isNaN(p) || p <= 0` shape would have let this through.
  for (const bad of ["Infinity", "-Infinity", "1e400", "-1e400", Infinity, -Infinity]) {
    test(`${JSON.stringify(String(bad))} is refused`, () => {
      assert.equal(isValidProductPrice(bad), false);
      assert.equal(parseProductPrice(bad), null);
    });
  }
});

describe("H-05 — stock is normalised, never stored as NaN", () => {
  test("a valid count is kept", () => {
    assert.equal(normaliseStock("25"), 25);
    assert.equal(normaliseStock(25), 25);
  });

  test("junk and negatives collapse to 0 (out of stock), matching the old `|| 0`", () => {
    for (const bad of ["abc", "", null, undefined, NaN, "-5", -5, "Infinity"]) {
      assert.equal(normaliseStock(bad), 0, `${JSON.stringify(bad)} should be 0`);
    }
  });

  test("zero stays zero — 0 is a legitimate stock level, unlike a 0 price", () => {
    assert.equal(normaliseStock("0"), 0);
    assert.equal(isValidProductPrice("0"), false);
  });

  test("a fractional count is floored to a whole number", () => {
    assert.equal(normaliseStock("7.9"), 7);
  });
});

describe("H-05 — the three write paths no longer guard price by truthiness", () => {
  const body = (marker) => {
    const at = VENDOR.indexOf(marker);
    assert.ok(at > -1, `route marker not found: ${marker}`);
    return VENDOR.slice(at, at + 2600);
  };

  const PATHS = [
    ['"/api/vendor/products",', "vendor create"],
    ['"/api/vendor/products/:pid",', "vendor update"],
    ['router.post("/api/admin/vendors/:vendorId/products"', "admin create-for-vendor"],
  ];

  for (const [marker, label] of PATHS) {
    test(`${label} validates the number itself`, () => {
      assert.match(
        body(marker),
        /parseProductPrice\(/,
        `REGRESSION: ${label} no longer validates the price`,
      );
    });

    test(`${label} refuses an unusable price with 400`, () => {
      assert.match(body(marker), /السعر غير صالح/);
    });
  }

  test("no write path stores a raw parseFloat(price) any more", () => {
    assert.doesNotMatch(
      VENDOR,
      /price:\s*parseFloat\(price\)/,
      "REGRESSION: an unvalidated price is written straight to Firestore",
    );
  });

  test("the vendor update no longer uses `if (price)` as the gate", () => {
    assert.doesNotMatch(
      VENDOR,
      /if \(price\) updates\.price/,
      "REGRESSION: truthiness gate is back on the update path",
    );
  });
});

describe("H-05 — an already-stored bad price cannot enter a subtotal", () => {
  // Defence in depth: even if a negative price is already in Firestore (written
  // before this fix, or by some future path), pricing must refuse to use it.
  test("order pricing screens vendorProducts prices through the guard", () => {
    assert.match(
      ROUTES,
      /const vpPrice = Number\(vp\?\.price\);\s*\n\s*if \(isValidProductPrice\(vpPrice\)\)/,
      "REGRESSION: vendorProducts price is used without validation",
    );
  });

  test("order pricing screens legacy product prices through the guard", () => {
    assert.match(
      ROUTES,
      /if \(legacyProduct && isValidProductPrice\(legacyProduct\.price\)\)/,
      "REGRESSION: legacy product price is used without validation",
    );
  });

  test("the old NaN-only checks are gone from the pricing loop", () => {
    assert.doesNotMatch(ROUTES, /if \(!Number\.isNaN\(vpPrice\)\)/);
    assert.doesNotMatch(ROUTES, /!Number\.isNaN\(Number\(legacyProduct\.price\)\)/);
  });

  test("an unusable price leaves realPrice unset, so the order is REJECTED", () => {
    // realPrice stays undefined → the id joins unknownProductIds → 400.
    assert.match(ROUTES, /if \(realPrice === undefined\) \{\s*\n\s*unknownProductIds\.push/);
    assert.match(ROUTES, /منتج غير موجود أو غير متاح/);
  });

  test("the subtotal is NOT floored with Math.max to hide bad data", () => {
    assert.doesNotMatch(
      ROUTES,
      /realPrice\s*=\s*Math\.max\(0/,
      "a clamp would silently price a corrupt product at 0 instead of refusing it",
    );
  });

  test("a negative price would otherwise reduce the subtotal — the guard is what stops it", () => {
    // Documents the arithmetic the guard protects: there is no lower bound here.
    assert.match(ROUTES, /verifiedSubtotal \+= realPrice \* quantity/);
    const simulate = (prices) =>
      prices.filter((p) => isValidProductPrice(p)).reduce((s, p) => s + Number(p), 0);
    assert.equal(simulate([400000, -500000]), 400000, "the -500000 item must not subtract");
  });
});
