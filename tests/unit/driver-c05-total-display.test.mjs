import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, "../../", path), "utf8");

const ROUTES = read("server/routes.ts");
const DRIVER_ORDERS = read("client/screens/DriverOrdersScreen.tsx");
const DRIVER_DETAIL = read("client/screens/DriverOrderDetailScreen.tsx");
const DRIVER_BATCH = read("client/screens/DriverBatchScreen.tsx");
const DRIVER_EARNINGS = read("client/screens/DriverEarningsScreen.tsx");
const SETTLEMENT = read("server/settlement.ts");

function serverTotal({ subtotal, deliveryFee, serviceFee = 0, discount = 0 }) {
  return Math.max(0, subtotal + deliveryFee + serviceFee - discount);
}

function driverFinalAmount(order) {
  return order.total;
}

describe("C-05 — server total contract", () => {
  test("the backend computes and stores total including deliveryFee", () => {
    assert.match(
      ROUTES,
      /verifiedSubtotal \+ verifiedDeliveryFee \+ verifiedServiceFee - verifiedDiscount/,
    );
    assert.match(ROUTES, /total: verifiedTotal,/);
    assert.match(ROUTES, /deliveryFee: verifiedDeliveryFee,/);
  });

  test("case 1: subtotal 10,000 plus delivery 1,000 gives 11,000", () => {
    assert.equal(
      serverTotal({ subtotal: 10000, deliveryFee: 1000 }),
      11000,
    );
  });

  test("case 2: driver UI displays an already-final total once", () => {
    assert.equal(driverFinalAmount({ total: 11000, deliveryFee: 1000 }), 11000);
  });

  test("case 3: zero delivery fee does not change total", () => {
    assert.equal(
      serverTotal({ subtotal: 10000, deliveryFee: 0 }),
      10000,
    );
    assert.equal(driverFinalAmount({ total: 10000, deliveryFee: 0 }), 10000);
  });

  test("case 4: service orders still use one server-decided delivery fee", () => {
    assert.match(ROUTES, /verifiedDeliveryFee = service\.deliveryFee;/);
    assert.equal(
      serverTotal({ subtotal: 0, deliveryFee: 2500, serviceFee: 0 }),
      2500,
    );
    assert.equal(driverFinalAmount({ total: 2500, deliveryFee: 2500 }), 2500);
  });
});

describe("C-05 — driver display regression guards", () => {
  test("DriverOrdersScreen does not add deliveryFee to the final amount", () => {
    assert.match(
      DRIVER_ORDERS,
      /formatPrice\(order\.total \?\? 0\)/,
    );
    assert.doesNotMatch(
      DRIVER_ORDERS,
      /order\.total\s*\+\s*order\.deliveryFee/,
    );
  });

  test("DriverOrderDetailScreen uses total as the final amount", () => {
    assert.match(DRIVER_DETAIL, /const orderTotal = order\.total \|\| 0;/);
    assert.doesNotMatch(
      DRIVER_DETAIL,
      /const orderTotal = .*order\.deliveryFee/,
    );
  });

  test("other driver financial displays do not reconstruct customer total", () => {
    assert.match(DRIVER_BATCH, /formatPrice\(order\.total\)/);
    assert.match(DRIVER_EARNINGS, /formatPrice\(item\.driverEarning \|\| 0\)/);
    assert.doesNotMatch(DRIVER_BATCH, /order\.total\s*\+\s*order\.deliveryFee/);
    assert.doesNotMatch(DRIVER_EARNINGS, /item\.total\s*\+\s*item\.deliveryFee/);
  });

  test("vendor financials and settlement remain fee-aware and unchanged in scope", () => {
    assert.match(
      SETTLEMENT,
      /order\?\.total\s*\|\|\s*0\)\s*-\s*\(order\?\.deliveryFee\s*\|\|\s*0\)/,
    );
    assert.match(
      ROUTES,
      /\(o\.total \|\| 0\)\s*-\s*\(o\.deliveryFee \|\| 0\)\s*-\s*\(o\.serviceFee \|\| 0\)/,
    );
  });
});
