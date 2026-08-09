/**
 * Order fee authority tests (audit findings H-02 and H-01).
 *
 * H-02 — unknown region → the client's own delivery fee was used → free delivery.
 *   `let verifiedDeliveryFee = Number(deliveryFee) || 0;` seeded the fee from the
 *   REQUEST BODY and was only overwritten when `region` matched an active delivery
 *   area. `{"region":"x","deliveryFee":0}` therefore shipped free forever on every
 *   non-restaurant order. The driver's share is computed from `order.deliveryFee`
 *   (computeDriverPayout), so the driver earned nothing on that order while the
 *   cash they owed the company kept growing.
 *
 * H-01 — deleting the service-fee FIELD cancelled the fee entirely.
 *   `serviceFee === undefined ? 0 : await getConfiguredServiceFee()` made the VALUE
 *   server-authoritative but left the FIELD'S PRESENCE in the client's hands, and
 *   `if (serviceFee !== undefined) orderData.serviceFee = ...` then omitted the key
 *   from the stored document, so no reconciliation report could ever notice.
 *
 * Run:  node --test tests/unit/order-fees.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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

function handlerBody(src, marker) {
  const i = src.indexOf(marker);
  if (i === -1) return "";
  const rest = src.slice(i + marker.length);
  const next = rest.search(/\n\s*(app|router)\.(get|post|put|patch|delete)\(/);
  return stripComments(marker + (next === -1 ? rest : rest.slice(0, next)));
}

const ORDERS = handlerBody(ROUTES, 'app.post("/api/orders"');

/**
 * Mirror of the delivery-fee precedence in POST /api/orders. `null` means the fee
 * could not be resolved from any authoritative source, which the handler turns
 * into a 400 rather than falling back to anything the client sent.
 */
function resolveDeliveryFee({ vendorOverride = null, allRestaurant = false, region, areas = [], restaurantFlat = 1000 }) {
  if (vendorOverride != null) return vendorOverride;
  if (allRestaurant) return restaurantFlat;
  const wanted = String(region ?? "").trim();
  const matched = wanted ? areas.find((a) => String(a.name ?? "").trim() === wanted) : undefined;
  const fee = matched?.fee;
  if (matched && typeof fee === "number" && Number.isFinite(fee) && fee >= 0) return Math.round(fee);
  return null;
}

const AREAS = [
  { name: "الضلوعية", fee: 1000, isActive: true },
  { name: "الدور", fee: 3000, isActive: true },
];

describe("H-02 — the delivery fee never comes from the request body", () => {
  test("the body field is no longer even destructured", () => {
    assert.doesNotMatch(
      ORDERS.split("\n")[1] ?? "",
      /\bdeliveryFee\b/,
      "REGRESSION: deliveryFee is being read off req.body again",
    );
  });

  test("the client-seeded starting value is gone", () => {
    assert.doesNotMatch(
      ORDERS,
      /let verifiedDeliveryFee = Number\(deliveryFee\)/,
      "REGRESSION: the fee is seeded from the client again — free delivery is back",
    );
    assert.match(ORDERS, /let verifiedDeliveryFee: number \| null = null/);
  });

  test("an unresolvable region is refused with 400", () => {
    assert.match(
      ORDERS,
      /if \(verifiedDeliveryFee === null\) \{\s*\n\s*return res\.status\(400\)/,
      "REGRESSION: an unknown region no longer stops the order",
    );
    assert.match(ORDERS, /منطقة التوصيل غير مدعومة/);
  });

  test("all three authoritative sources are still consulted, in order", () => {
    const i1 = ORDERS.indexOf("verifiedDeliveryFee = vendorDeliveryFeeOverride");
    const i2 = ORDERS.indexOf("verifiedDeliveryFee = sysSettings.restaurantDeliveryFee");
    const i3 = ORDERS.indexOf("verifiedDeliveryFee = Math.round(areaFee);");
    assert.ok(i1 > -1 && i2 > -1 && i3 > -1, "a fee source was dropped");
    assert.ok(i1 < i2 && i2 < i3, "the documented precedence changed");
  });

  test("the driver's payout still keys off the stored delivery fee", () => {
    // This is why free delivery also silently zeroed the driver's earnings.
    assert.match(ROUTES, /computeDriverPayout\(isRestaurantOrder, order\.deliveryFee \|\| 0\)/);
  });

  // ── behaviour ────────────────────────────────────────────────────────────
  test("a matching region resolves to that area's fee", () => {
    assert.equal(resolveDeliveryFee({ region: "الضلوعية", areas: AREAS }), 1000);
    assert.equal(resolveDeliveryFee({ region: "الدور", areas: AREAS }), 3000);
  });

  test("the exact exploit — an unknown region with deliveryFee 0 — is refused", () => {
    assert.equal(resolveDeliveryFee({ region: "x", areas: AREAS }), null);
    assert.equal(resolveDeliveryFee({ region: "الضلوعيه", areas: AREAS }), null);
  });

  test("a missing or blank region is refused, not treated as free", () => {
    for (const region of [undefined, null, "", "   "]) {
      assert.equal(resolveDeliveryFee({ region, areas: AREAS }), null, `region ${JSON.stringify(region)}`);
    }
  });

  test("an inactive area is not a match (only activeOnly areas are passed in)", () => {
    assert.equal(resolveDeliveryFee({ region: "كركوك", areas: AREAS }), null);
  });

  test("stray whitespace on either side still matches", () => {
    assert.equal(resolveDeliveryFee({ region: "  الضلوعية  ", areas: AREAS }), 1000);
    assert.equal(resolveDeliveryFee({ region: "الضلوعية", areas: [{ name: " الضلوعية ", fee: 1000 }] }), 1000);
  });

  test("a corrupt stored area fee is refused rather than becoming free delivery", () => {
    for (const fee of [NaN, "abc", -500, Infinity, undefined, null]) {
      assert.equal(
        resolveDeliveryFee({ region: "الضلوعية", areas: [{ name: "الضلوعية", fee }] }),
        null,
        `fee ${JSON.stringify(fee)} must not resolve`,
      );
    }
  });

  test("a zero-fee area is legitimate and still resolves", () => {
    assert.equal(resolveDeliveryFee({ region: "الضلوعية", areas: [{ name: "الضلوعية", fee: 0 }] }), 0);
  });

  test("a store override wins over everything and skips the region check", () => {
    assert.equal(resolveDeliveryFee({ vendorOverride: 2500, region: "x", areas: AREAS }), 2500);
    assert.equal(resolveDeliveryFee({ vendorOverride: 0, region: "x", areas: AREAS }), 0);
  });

  test("a restaurant order uses the flat system fee and skips the region check", () => {
    assert.equal(resolveDeliveryFee({ allRestaurant: true, region: "x", restaurantFlat: 1000 }), 1000);
  });
});

describe("H-01 — the service fee is always computed and always stored", () => {
  test("the body field is no longer destructured", () => {
    assert.doesNotMatch(
      ORDERS.split("\n")[1] ?? "",
      /\bserviceFee\b/,
      "REGRESSION: serviceFee is being read off req.body again",
    );
  });

  test("omitting the field no longer zeroes the fee", () => {
    assert.doesNotMatch(
      ORDERS,
      /serviceFee === undefined \? 0 :/,
      "REGRESSION: a client that drops the key pays no service fee",
    );
    assert.match(ORDERS, /const verifiedServiceFee = await getConfiguredServiceFee\(\);/);
  });

  test("the fee is written to every order document unconditionally", () => {
    assert.doesNotMatch(
      ORDERS,
      /if \(serviceFee !== undefined\) orderData\.serviceFee/,
      "REGRESSION: the field is omitted again — reconciliation cannot see the gap",
    );
    assert.match(ORDERS, /\n\s*orderData\.serviceFee = verifiedServiceFee;/);
  });

  test("the fee still feeds the verified total", () => {
    assert.match(
      ORDERS,
      /verifiedSubtotal \+ verifiedDeliveryFee \+ verifiedServiceFee - verifiedDiscount/,
    );
  });

  test("getConfiguredServiceFee keeps its own validation and default", () => {
    const fn = ROUTES.slice(ROUTES.indexOf("async function getConfiguredServiceFee"));
    assert.match(fn.slice(0, 600), /Number\.isFinite\(value\) && value >= 0 \? Math\.round\(value\) : DEFAULT_SERVICE_FEE/);
    assert.match(ROUTES, /const DEFAULT_SERVICE_FEE = 500;/);
  });

  test("the client and the server agree on the default, so nothing shifts for an honest app", () => {
    const CHECKOUT = read("client/screens/CheckoutScreen.tsx");
    assert.match(CHECKOUT, /const SERVICE_FEE = feesData\?\.serviceFee \?\? 500;/);
  });
});

describe("H-02/H-01 — the rest of the pricing block is untouched", () => {
  test("H-04's coupon clamp is still in place", () => {
    assert.match(ORDERS, /verifiedDiscount = Math\.min\(verifiedDiscount, verifiedSubtotal\)/);
  });

  test("H-05's stored-price guards are still in place", () => {
    assert.match(ORDERS, /isValidProductPrice\(legacyProduct\.price\)/);
    assert.match(ORDERS, /if \(isValidProductPrice\(vpPrice\)\)/);
  });

  test("the zero floor on the total is still in place", () => {
    assert.match(ORDERS, /const verifiedTotal = Math\.max\(\s*0,/);
  });

  test("price drift is still logged, never used to reject", () => {
    assert.match(ORDERS, /\[PRICE_DRIFT\]/);
  });
});
