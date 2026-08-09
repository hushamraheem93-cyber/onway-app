/**
 * Promo discount clamping tests (audit finding H-04).
 *
 * The preview route POST /api/promo-codes/apply clamped the discount correctly
 * with `Math.min(discount, cartTotal)`, where cartTotal is the cart SUBTOTAL.
 * The order-creation route POST /api/orders did not: a `fixed` coupon was used
 * as `verifiedDiscount = promo.value` verbatim.
 *
 *   subtotal 3,000 + delivery 1,000 + service 0, fixed coupon 10,000
 *     → Math.max(0, 3000 + 1000 + 0 − 10000) = 0
 *
 * The coupon swallowed the goods AND the delivery fee. The driver delivered real
 * stock and collected nothing; the settlement booked grossAmount 0 while the
 * store was still owed its goods. The client meanwhile displayed 1,000 (it had
 * been quoted the clamped figure by /apply), so the customer expected to pay.
 *
 * Separately, the stored `value` was never checked as a number — `Number("abc")`
 * is NaN, and `Math.max(0, NaN)` is NaN, so `total: NaN` reached Firestore.
 *
 * Run:  node --test tests/unit/promo-discount.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { isValidProductPrice } from "../../server/orderValidation.ts";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, "../../", p), "utf8");
const ROUTES = read("server/routes.ts");

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

const ORDERS = handlerBody(ROUTES, 'app.post("/api/orders"');
const APPLY = handlerBody(ROUTES, 'app.post("/api/promo-codes/apply"');

/**
 * Mirror of the two server blocks, which are now identical in shape:
 *
 *   order creation  (routes.ts, POST /api/orders)
 *     percentage → Math.round(subtotal * value/100), capped by maximumDiscountAmount
 *     fixed      → value
 *     both       → Math.min(discount, subtotal)
 *
 *   preview        (routes.ts, POST /api/promo-codes/apply)
 *     ... → Math.min(discount, cartTotal)   where the client sends cartTotal = subtotal
 *
 * The source guards further down pin the real code to this shape; these cases
 * describe what that shape is supposed to produce.
 */
function discountFor(promo, subtotal) {
  const value = Number(promo?.value);
  if (!promo?.isActive || !isValidProductPrice(value)) return null; // → 400, no discount
  let d;
  if (promo.type === "percentage") {
    d = Math.round(subtotal * (value / 100));
    if (promo.maximumDiscountAmount && promo.maximumDiscountAmount > 0) {
      d = Math.min(d, promo.maximumDiscountAmount);
    }
  } else {
    d = value;
  }
  return Math.min(d, subtotal);
}

const totalFor = (subtotal, delivery, service, discount) =>
  Math.max(0, subtotal + delivery + service - discount);

const active = (o) => ({ isActive: true, ...o });

describe("H-04 — a fixed coupon can never exceed the cart subtotal", () => {
  test("the exact finding: fixed 10,000 on a 3,000 cart discounts 3,000, not 10,000", () => {
    const d = discountFor(active({ type: "fixed", value: 10000 }), 3000);
    assert.equal(d, 3000, "REGRESSION: the coupon is swallowing more than the goods");
  });

  test("the delivery fee and service fee survive the coupon", () => {
    const subtotal = 3000, delivery = 1000, service = 0;
    const d = discountFor(active({ type: "fixed", value: 10000 }), subtotal);
    const total = totalFor(subtotal, delivery, service, d);
    assert.equal(total, 1000, "the customer must still pay delivery + service");
    assert.ok(
      total >= delivery + service,
      "REGRESSION: the total dropped below the fees — the driver collects nothing",
    );
  });

  test("the total never reaches 0 while a fee is owed", () => {
    for (const value of [10000, 100000, 5_000_000]) {
      const total = totalFor(3000, 1000, 500, discountFor(active({ type: "fixed", value }), 3000));
      assert.equal(total, 1500, `coupon ${value} must not zero out the order`);
    }
  });

  test("an ordinary coupon is untouched — fixed 2,000 on a 50,000 cart stays 2,000", () => {
    assert.equal(discountFor(active({ type: "fixed", value: 2000 }), 50000), 2000);
    assert.equal(totalFor(50000, 1000, 500, 2000), 49500);
  });

  test("a coupon exactly equal to the subtotal is allowed in full", () => {
    const subtotal = 3000;
    const d = discountFor(active({ type: "fixed", value: 3000 }), subtotal);
    assert.equal(d, 3000);
    assert.equal(totalFor(subtotal, 1000, 0, d), 1000, "goods free, delivery still paid");
  });
});

describe("H-04 — a percentage coupon cannot exceed the subtotal either", () => {
  test("a normal 20% coupon is unchanged", () => {
    assert.equal(discountFor(active({ type: "percentage", value: 20 }), 50000), 10000);
  });

  test("100% discounts the goods and nothing more", () => {
    const subtotal = 3000;
    assert.equal(discountFor(active({ type: "percentage", value: 100 }), subtotal), 3000);
    assert.equal(totalFor(subtotal, 1000, 0, 3000), 1000);
  });

  test("150% is clamped to the subtotal, not 1.5x it", () => {
    const subtotal = 3000;
    const d = discountFor(active({ type: "percentage", value: 150 }), subtotal);
    assert.equal(d, 3000, "REGRESSION: a >100% coupon eats the delivery fee");
    assert.equal(totalFor(subtotal, 1000, 0, d), 1000);
  });

  test("maximumDiscountAmount still caps a percentage coupon", () => {
    assert.equal(
      discountFor(active({ type: "percentage", value: 50, maximumDiscountAmount: 5000 }), 50000),
      5000,
    );
  });
});

describe("H-04 — a corrupt coupon value can never poison the total", () => {
  // POST /api/admin/promo-codes stores `value: Number(value)` with no validation,
  // so these really can sit in the promoCodes collection.
  for (const bad of ["abc", NaN, -5000, "-5000", Infinity, "1e400", 0, "", null, undefined]) {
    test(`value ${JSON.stringify(String(bad))} yields no discount at all (request is refused)`, () => {
      const d = discountFor(active({ type: "fixed", value: bad }), 3000);
      assert.equal(d, null, "an unusable coupon must be refused, not applied");
    });

    test(`value ${JSON.stringify(String(bad))} can never produce NaN or a negative total`, () => {
      const d = discountFor(active({ type: "fixed", value: bad }) , 3000) ?? 0;
      const total = totalFor(3000, 1000, 500, d);
      assert.ok(Number.isFinite(total), "REGRESSION: total: NaN would be written to Firestore");
      assert.ok(total >= 0);
      assert.equal(total, 4500, "with no discount applied the customer pays the full amount");
    });
  }

  test("a negative coupon can no longer INCREASE the bill", () => {
    // Before: verifiedDiscount = -50000 → total = subtotal + fees + 50000.
    const d = discountFor(active({ type: "fixed", value: -50000 }), 3000);
    assert.equal(d, null);
    assert.equal(totalFor(3000, 1000, 0, 0), 4000, "the customer is not overcharged");
  });

  test("the guard is the project's existing predicate, not a second validation system", () => {
    for (const bad of [NaN, -5000, Infinity, 0]) assert.equal(isValidProductPrice(bad), false);
    for (const good of [1, 2000, 10000]) assert.equal(isValidProductPrice(good), true);
  });
});

describe("H-04 — the preview route and the order route agree", () => {
  // /api/promo-codes/apply is what the checkout screen displays; /api/orders is
  // what is actually charged. They disagreeing is how the customer was quoted
  // 1,000 and billed 0.
  const CARTS = [3000, 50000, 10000, 1];
  const PROMOS = [
    { type: "fixed", value: 10000 },
    { type: "fixed", value: 2000 },
    { type: "percentage", value: 20 },
    { type: "percentage", value: 150 },
    { type: "percentage", value: 50, maximumDiscountAmount: 5000 },
  ];

  for (const p of PROMOS) {
    for (const subtotal of CARTS) {
      test(`${p.type} ${p.value} on a ${subtotal} cart: both routes compute the same discount`, () => {
        // The preview route's cartTotal is the cart subtotal (CheckoutScreen sends
        // `cartTotal: subtotal`), so the same input produces the same clamp.
        const fromOrder = discountFor(active(p), subtotal);
        const fromPreview = discountFor(active(p), subtotal);
        assert.equal(fromOrder, fromPreview);
        assert.ok(fromOrder <= subtotal, "neither route may exceed the subtotal");
      });
    }
  }
});

describe("H-04 — source guards on POST /api/orders", () => {
  test("the route was found", () => {
    assert.ok(ORDERS.length > 0, "route marker not found in server/routes.ts");
    assert.ok(APPLY.length > 0, "preview route marker not found in server/routes.ts");
  });

  test("the discount is clamped to the verified subtotal", () => {
    assert.match(
      ORDERS,
      /verifiedDiscount = Math\.min\(verifiedDiscount, verifiedSubtotal\)/,
      "REGRESSION: a coupon larger than the cart can swallow the delivery fee again",
    );
  });

  test("a fixed coupon is no longer taken verbatim from the promo document", () => {
    assert.doesNotMatch(
      ORDERS,
      /verifiedDiscount = promo\.value;/,
      "REGRESSION: the unclamped fixed-coupon assignment is back",
    );
  });

  test("the coupon value is validated as a finite positive number first", () => {
    assert.match(ORDERS, /const promoValue = Number\(promo\?\.value\)/);
    assert.match(
      ORDERS,
      /promo\.isActive && notExpired && isValidProductPrice\(promoValue\)/,
      "REGRESSION: NaN / negative / Infinity coupon values reach the arithmetic again",
    );
  });

  test("an unusable coupon is refused, never silently ignored", () => {
    assert.match(ORDERS, /كود الخصم غير صالح أو منتهي الصلاحية/);
  });

  test("the existing Math.max(0, ...) floor is preserved", () => {
    assert.match(
      ORDERS,
      /const verifiedTotal = Math\.max\(\s*0,\s*verifiedSubtotal \+ verifiedDeliveryFee \+ verifiedServiceFee - verifiedDiscount,?\s*\)/,
      "REGRESSION: the defence-in-depth floor was removed",
    );
  });

  test("the preview route keeps its own clamp", () => {
    assert.match(APPLY, /discount = Math\.min\(discount, cartTotal\)/);
  });
});

describe("H-04 — the fee calculations were not touched", () => {
  // NOTE: H-02 and H-01 later tightened these two lines further (the fee no longer
  // comes from the body at all, and the service fee is always stored). The
  // assertions track the current shape; tests/unit/order-fees.test.mjs owns them.
  test("the delivery fee is still server-authoritative", () => {
    assert.match(ORDERS, /let verifiedDeliveryFee: number \| null = null/);
    assert.match(ORDERS, /verifiedDeliveryFee = vendorDeliveryFeeOverride/);
    assert.match(ORDERS, /verifiedDeliveryFee = sysSettings\.restaurantDeliveryFee/);
    assert.match(ORDERS, /verifiedDeliveryFee = Math\.round\(areaFee\)/);
  });

  test("the service fee still comes from getConfiguredServiceFee()", () => {
    assert.match(ORDERS, /const verifiedServiceFee = await getConfiguredServiceFee\(\);/);
  });

  test("neither fee is discounted", () => {
    assert.doesNotMatch(ORDERS, /verifiedDeliveryFee\s*-=/);
    assert.doesNotMatch(ORDERS, /verifiedServiceFee\s*-=/);
    assert.doesNotMatch(ORDERS, /verifiedDiscount, verifiedTotal/);
  });

  test("the vendor payout base is unchanged (H-04 must not shift who pays)", () => {
    const SETTLEMENT = read("server/settlement.ts");
    assert.match(
      SETTLEMENT,
      /Math\.round\(\(order\?\.total \|\| 0\) - \(order\?\.deliveryFee \|\| 0\) - \(order\?\.serviceFee \|\| 0\)\)/,
      "vendorCommissionBase was deliberately left alone in this round",
    );
  });
});
