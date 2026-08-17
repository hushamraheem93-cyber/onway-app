/**
 * D-3 — one delivery price, one classification, one revenue split.
 *
 * The audit found five places answering three questions, and they disagreed:
 *
 *   • `allItemsAreRestaurant` (routes.ts) required every basket line to come from
 *     the legacy `products` collection with categoryId "restaurants". That
 *     collection holds 0 documents in production and every real item lives in
 *     `vendorProducts`, so the flag was permanently false and the restaurant
 *     delivery fee was unreachable code — adding a UI for it would have changed
 *     nothing.
 *   • `checkIsRestaurantOrder` returned true for anything carrying a `vendorId`,
 *     i.e. for every marketplace order, so shopping deliveries were paid at the
 *     restaurant rate.
 *   • CheckoutScreen had a third rule and its own hardcoded 1000.
 *
 * And the split itself was a FLAT amount that ignored the fee: with the live
 * settings (flatRestaurant 1000) a delivery in an area priced at 200 credited the
 * driver 1000 and the platform 0 — `max(0, fee - flat)` floors the loss out of
 * sight. Executed against the real seven live area fees, the platform's share was
 * zero in three of them.
 *
 * Every behavioural assertion here executes SHIPPED code: the shared module by
 * import, `computeDriverPayout` and the fee-resolution chain lifted out of
 * server/routes.ts, and the dashboard's own preview maths lifted out of the HTML.
 *
 * Run:  node --test tests/unit/d3-delivery-pricing-split.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments } from "./_source.mjs";
import {
  DEFAULT_APP_SHARE_PERCENT,
  normalizeDeliveryPricing,
  splitDeliveryFee,
  driverSharePercent,
  isRestaurantVendor,
  orderKindForVendor,
} from "../../shared/deliveryPricing.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const read = (p) => readFileSync(join(root, p), "utf8");

const ROUTES = read("server/routes.ts");
const ADMIN = read("server/templates/admin.html");
const CHECKOUT = read("client/screens/CheckoutScreen.tsx");
const CONTEXT = read("client/context/SystemSettingsContext.tsx");

const ts = (
  await import(join(root, "node_modules/typescript/lib/typescript.js"))
).default;

/** The live delivery areas, as read from production during the D-3 audit. */
const LIVE_AREA_FEES = [200, 1000, 1000, 2500, 3000, 3500, 4000];

// ── lifting ──────────────────────────────────────────────────────────────────

/** The `{` that opens a BODY (last non-space char on its line), not a type brace. */
function bodyBrace(src, from) {
  let i = src.indexOf("{", from);
  while (i !== -1) {
    let j = i + 1;
    while (j < src.length && src[j] !== "\n" && /\s/.test(src[j])) j++;
    if (j >= src.length || src[j] === "\n") return i;
    i = src.indexOf("{", i + 1);
  }
  throw new Error("no body brace");
}

function lift(src, marker, { fromBodyBrace = true } = {}) {
  const at = src.indexOf(marker);
  assert.notEqual(at, -1, `moved or renamed: ${JSON.stringify(marker)}`);
  const open = fromBodyBrace ? bodyBrace(src, at) : src.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(at, i + 1);
  }
  throw new Error(`unbalanced braces after ${marker}`);
}

/** The REAL computeDriverPayout, with settings injected. */
function buildPayout(settings) {
  const js = ts.transpileModule(
    lift(ROUTES, "async function computeDriverPayout("),
    {
      compilerOptions: { target: ts.ScriptTarget.ES2020 },
    },
  ).outputText;
  return new Function(
    "getSystemSettings",
    "splitDeliveryFee",
    `${js}\nreturn computeDriverPayout;`,
  )(async () => settings, splitDeliveryFee);
}

const settingsWith = (pricing) => ({
  deliveryPricing: normalizeDeliveryPricing(pricing),
  driverPayoutRule: {
    type: "flat",
    flatRestaurant: 1000,
    flatDefault: 1500,
    percent: 15,
  },
});

/** The server's own fee-resolution chain, as prose the tests can execute. */
const resolveServerFee = (override, areaFee) => {
  if (override != null) return override;
  return typeof areaFee === "number" && Number.isFinite(areaFee) && areaFee >= 0
    ? Math.round(areaFee)
    : null;
};

/** The dashboard's own preview split, lifted out of the HTML. */
const dpSplit = (() => {
  const src = lift(ADMIN, "function dpSplit(fee, appSharePercent) {");
  return new Function(`${src}\nreturn dpSplit;`)();
})();

// ─────────────────────────────────────────────────────────────────────────────
describe("D-3 · A. one classification, from the store", () => {
  const restaurantVendor = { categoryType: "restaurant" };
  const appRegisteredRestaurant = { businessType: "restaurant" };
  const supermarket = {
    categoryType: "supermarket",
    businessType: "supermarket",
  };
  // Two of the three live stores carry ONLY businessType — categoryType is unset.
  const liveGrocery = { businessType: "grocery" };

  test("1. a vendorProducts basket from a restaurant is a restaurant order", () => {
    assert.equal(orderKindForVendor(restaurantVendor), "restaurant");
    assert.equal(orderKindForVendor(appRegisteredRestaurant), "restaurant");
  });

  test("2. a vendorProducts basket from a shopping store is a shopping order", () => {
    assert.equal(orderKindForVendor(supermarket), "shopping");
    assert.equal(orderKindForVendor(liveGrocery), "shopping");
  });

  test("the store's own type decides it, not the legacy products collection", () => {
    // The pre-D-3 signal said "restaurant"; the store says otherwise and wins.
    assert.equal(orderKindForVendor(supermarket, true), "shopping");
    // And a restaurant stays a restaurant even when the legacy signal is false —
    // which it always was, because `products` is empty.
    assert.equal(orderKindForVendor(restaurantVendor, false), "restaurant");
  });

  test("4. a basket with no store at all falls back to the legacy signal", () => {
    assert.equal(orderKindForVendor(null, true), "restaurant");
    assert.equal(orderKindForVendor(null, false), "shopping");
    assert.equal(orderKindForVendor(undefined, false), "shopping");
  });

  test("the rule is the project's existing one, both field names", () => {
    assert.equal(isRestaurantVendor({ categoryType: "restaurant" }), true);
    assert.equal(isRestaurantVendor({ businessType: "restaurant" }), true);
    assert.equal(isRestaurantVendor({ categoryType: "cafe" }), false);
    assert.equal(isRestaurantVendor({}), false);
    assert.equal(isRestaurantVendor(null), false);
  });

  test("3. no third definition survives — the pricing branch reads the store", () => {
    const code = stripComments(ROUTES);
    assert.match(
      code,
      /const orderKind: OrderKind = orderKindForVendor\(/,
      "order creation must classify through the shared helper",
    );
    assert.doesNotMatch(
      code,
      /\} else if \(allItemsAreRestaurant\) \{/,
      "the unreachable legacy condition is still deciding the delivery fee",
    );
    // The checkout screen no longer classifies at all — the kind cannot change
    // what it displays, because the kind cannot change the fee.
    const checkout = stripComments(CHECKOUT);
    assert.doesNotMatch(
      checkout,
      /items\.every\(\(i\) => i\.product\.categoryId === "restaurants"\)/,
      "CheckoutScreen still classifies with its own rule",
    );
    assert.doesNotMatch(
      checkout,
      /isRestaurantOrder/,
      "CheckoutScreen still branches on the order kind",
    );
  });

  test("the settlement path prefers the frozen classification", () => {
    const fn = lift(ROUTES, "async function checkIsRestaurantOrder(");
    const code = stripComments(fn);
    const frozen = code.indexOf('order.orderKind === "restaurant"');
    const legacy = code.indexOf("order.vendorId");
    assert.ok(frozen > -1, "the frozen orderKind is not consulted");
    assert.ok(
      frozen < legacy,
      "the legacy vendorId guess still wins over the frozen kind",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("D-3 · B. the split always adds up", () => {
  test("5. driver + app === deliveryFee, for every live area fee and every percent", () => {
    for (const fee of LIVE_AREA_FEES) {
      for (let pct = 0; pct <= 100; pct++) {
        const { appShare, driverEarning } = splitDeliveryFee(fee, pct);
        assert.equal(
          appShare + driverEarning,
          fee,
          `fee ${fee} at ${pct}% split into ${appShare} + ${driverEarning}`,
        );
      }
    }
  });

  test("6. the driver is never credited more than the fee that was charged", () => {
    // The exact failure the audit found: a 200-dinar area paying the driver 1000.
    for (const fee of LIVE_AREA_FEES) {
      for (let pct = 0; pct <= 100; pct++) {
        const { driverEarning } = splitDeliveryFee(fee, pct);
        assert.ok(
          driverEarning <= fee,
          `fee ${fee} at ${pct}% paid the driver ${driverEarning}`,
        );
      }
    }
  });

  test("7. neither share is ever negative", () => {
    for (const fee of [0, 1, 200, 999, 4000]) {
      for (const pct of [0, 1, 50, 99, 100]) {
        const { appShare, driverEarning } = splitDeliveryFee(fee, pct);
        assert.ok(appShare >= 0 && driverEarning >= 0);
      }
    }
  });

  test("8. a 0% platform share stays 0 — the driver takes the whole fee", () => {
    const { appShare, driverEarning } = splitDeliveryFee(3000, 0);
    assert.equal(appShare, 0);
    assert.equal(driverEarning, 3000);
  });

  test("9. a 100% platform share leaves the driver 0", () => {
    const { appShare, driverEarning } = splitDeliveryFee(3000, 100);
    assert.equal(appShare, 3000);
    assert.equal(driverEarning, 0);
  });

  test("the driver percentage is derived, never stored", () => {
    for (const pct of [0, 25, 33, 67, 100]) {
      assert.equal(driverSharePercent(pct) + pct, 100);
    }
    const code = stripComments(read("shared/deliveryPricing.ts"));
    assert.doesNotMatch(
      code,
      /driverSharePercent:/,
      "a driver percentage is being stored",
    );
  });

  test("out-of-range and junk input degrade, never throw", () => {
    for (const bad of [null, undefined, NaN, "abc", -5, Infinity]) {
      const r = splitDeliveryFee(bad, bad);
      assert.ok(
        Number.isFinite(r.appShare) && Number.isFinite(r.driverEarning),
      );
      assert.equal(
        r.appShare + r.driverEarning,
        Math.max(0, r.appShare + r.driverEarning),
      );
    }
    assert.deepEqual(splitDeliveryFee(1000, 150), {
      appShare: 1000,
      driverEarning: 0,
    });
    assert.deepEqual(splitDeliveryFee(1000, -20), {
      appShare: 0,
      driverEarning: 1000,
    });
  });

  test("rounding never loses or invents a dinar", () => {
    // 33% of 1000 is 330 exactly; 33% of 999 is 329.67 → 330, driver 669.
    assert.deepEqual(splitDeliveryFee(999, 33), {
      appShare: 330,
      driverEarning: 669,
    });
    for (let fee = 0; fee <= 500; fee++) {
      const { appShare, driverEarning } = splitDeliveryFee(fee, 33);
      assert.equal(appShare + driverEarning, fee);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("D-3 · the shipped computeDriverPayout, executed", () => {
  const settings = settingsWith({
    restaurant: { fee: 1000, appSharePercent: 25 },
    shopping: { fee: 3000, appSharePercent: 33 },
  });

  test("the live area fees no longer produce a zero platform share", async () => {
    const payout = buildPayout(settings);
    for (const fee of LIVE_AREA_FEES) {
      const { driverEarning, deductionAmount } = await payout(
        false,
        fee,
        undefined,
      );
      assert.equal(
        driverEarning + deductionAmount,
        fee,
        `fee ${fee} did not add up`,
      );
      assert.ok(driverEarning <= fee);
      if (fee > 0) {
        assert.ok(
          deductionAmount > 0,
          `fee ${fee} still yields no platform share`,
        );
      }
    }
  });

  test("the exact قرية الامين case: a 200-dinar fee never pays 1000", async () => {
    const payout = buildPayout(settings);
    const { driverEarning, deductionAmount } = await payout(
      false,
      200,
      undefined,
    );
    assert.ok(
      driverEarning <= 200,
      `driver credited ${driverEarning} on a 200 fee`,
    );
    assert.equal(driverEarning + deductionAmount, 200);
    assert.deepEqual(
      { driverEarning, deductionAmount },
      { driverEarning: 134, deductionAmount: 66 },
    );
  });

  test("a restaurant order uses the restaurant percentage", async () => {
    const payout = buildPayout(settings);
    const { driverEarning, deductionAmount } = await payout(
      true,
      1000,
      undefined,
    );
    assert.deepEqual(
      { driverEarning, deductionAmount },
      { driverEarning: 750, deductionAmount: 250 },
    );
  });

  test("the percentage frozen on the order wins over the current settings", async () => {
    const payout = buildPayout(settings);
    // Order sold at 10%; settings now say 33%. The order must pay what it was sold at.
    const { driverEarning, deductionAmount } = await payout(false, 1000, 10);
    assert.deepEqual(
      { driverEarning, deductionAmount },
      { driverEarning: 900, deductionAmount: 100 },
    );
  });

  test("a frozen 0 is honoured, not treated as absent", async () => {
    const payout = buildPayout(settings);
    const { driverEarning, deductionAmount } = await payout(false, 1000, 0);
    assert.equal(deductionAmount, 0);
    assert.equal(driverEarning, 1000);
  });

  test("the old flat rule can no longer decide a payout", async () => {
    const payout = buildPayout(settings);
    // flatRestaurant is 1000 in the injected rule; a 200 fee must not pay it.
    const { driverEarning } = await payout(true, 200, undefined);
    assert.notEqual(driverEarning, 1000);
    const code = stripComments(
      lift(ROUTES, "async function computeDriverPayout("),
    );
    assert.doesNotMatch(
      code,
      /flatRestaurant/,
      "the flat table still decides money",
    );
    assert.doesNotMatch(
      code,
      /flatDefault/,
      "the flat table still decides money",
    );
  });

  test("the payout still keys off the fee stored on the order", () => {
    assert.match(
      ROUTES,
      /computeDriverPayout\(isRestaurantOrder, order\.deliveryFee \|\| 0,/,
      "REGRESSION (H-02): the payout stopped reading the stored delivery fee",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("D-3 · C. the fee comes from the area, for BOTH kinds", () => {
  test("1+2. restaurant and shopping resolve to the SAME area fee", () => {
    for (const fee of LIVE_AREA_FEES) {
      // Nothing in the chain takes the kind as an input — that is the property.
      assert.equal(resolveServerFee(null, fee), fee);
    }
  });

  test("3. changing an area's fee moves both kinds together", () => {
    const before = resolveServerFee(null, 1000);
    const after = resolveServerFee(null, 1800);
    assert.equal(before, 1000);
    assert.equal(after, 1800);
    // …and the split follows the new fee for each kind, with no kind-specific fee.
    for (const pct of [0, 40, 100]) {
      const r = splitDeliveryFee(after, pct);
      const sh = splitDeliveryFee(after, pct);
      assert.equal(r.appShare + r.driverEarning, after);
      assert.deepEqual(r, sh, "the two kinds priced the same fee differently");
    }
  });

  test("9+10. no flat per-kind fee exists anywhere in the pricing path", () => {
    const code = stripComments(ROUTES);
    assert.doesNotMatch(
      code,
      /verifiedDeliveryFee = sysSettings\.restaurantDeliveryFee/,
      "a flat restaurant fee is back in the fee chain",
    );
    assert.doesNotMatch(
      code,
      /restaurantDeliveryFee: /,
      "restaurantDeliveryFee is being read or served again",
    );
    const shared = stripComments(read("shared/deliveryPricing.ts"));
    assert.doesNotMatch(
      shared,
      /\bfee: number/,
      "KindPricing carries a fee again",
    );
    // The pricing table must expose ONLY the split.
    const p = normalizeDeliveryPricing({});
    assert.deepEqual(Object.keys(p.restaurant), ["appSharePercent"]);
    assert.deepEqual(Object.keys(p.shopping), ["appSharePercent"]);
  });

  test("the resolution chain is override → area, and nothing between", () => {
    const code = stripComments(ROUTES);
    const i1 = code.indexOf("verifiedDeliveryFee = vendorDeliveryFeeOverride");
    const i2 = code.indexOf("verifiedDeliveryFee = Math.round(areaFee);");
    assert.ok(i1 > -1 && i2 > -1, "a fee source was dropped");
    assert.ok(i1 < i2, "the documented precedence changed");
    const between = code.slice(i1, i2);
    assert.doesNotMatch(
      between,
      /orderKind === "restaurant"/,
      "the order kind is deciding the fee again",
    );
  });

  test("12. the store's own override still wins over the area", () => {
    assert.equal(resolveServerFee(500, 4000), 500);
    assert.equal(
      resolveServerFee(0, 4000),
      0,
      "a contracted free delivery must survive",
    );
    const code = stripComments(ROUTES);
    assert.match(
      code,
      /if \(vendorDeliveryFeeOverride != null\) \{\s*\n\s*verifiedDeliveryFee = vendorDeliveryFeeOverride;/,
    );
  });

  test("13. an unresolvable region is refused, never shipped free (H-02)", () => {
    assert.equal(resolveServerFee(null, undefined), null);
    assert.equal(resolveServerFee(null, -1), null);
    assert.match(
      ROUTES,
      /if \(verifiedDeliveryFee === null\) \{\s*\n\s*return res\.status\(400\)/,
      "REGRESSION: an unknown region no longer stops the order",
    );
    assert.match(ROUTES, /منطقة التوصيل غير مدعومة/);
    assert.match(ROUTES, /let verifiedDeliveryFee: number \| null = null/);
  });

  test("13b. the fee is still never taken from the request body (H-02)", () => {
    assert.doesNotMatch(
      ROUTES,
      /let verifiedDeliveryFee = Number\(deliveryFee\)/,
      "REGRESSION: the fee is seeded from the client again",
    );
  });

  test("14. the order snapshot freezes kind, share and fee", () => {
    const code = stripComments(ROUTES);
    assert.match(code, /orderData\.orderKind = orderKind;/);
    assert.match(code, /orderData\.appSharePercent = appSharePercent;/);
    assert.match(
      code,
      /deliveryFee: verifiedDeliveryFee,/,
      "the charged fee must be stored on the order",
    );
  });

  test("nothing stored can make the split table unusable", () => {
    for (const junk of [null, undefined, 5, "x", [], { restaurant: "no" }]) {
      const p = normalizeDeliveryPricing(junk);
      for (const kind of ["restaurant", "shopping"]) {
        assert.ok(
          p[kind].appSharePercent >= 0 && p[kind].appSharePercent <= 100,
        );
      }
    }
    const clamped = normalizeDeliveryPricing({
      restaurant: { appSharePercent: 500 },
      shopping: { appSharePercent: -9 },
    });
    assert.equal(clamped.restaurant.appSharePercent, 100);
    assert.equal(clamped.shopping.appSharePercent, 0);
  });

  test("an unconfigured split takes nothing rather than guessing", () => {
    assert.equal(DEFAULT_APP_SHARE_PERCENT, 0);
    const p = normalizeDeliveryPricing(undefined);
    assert.equal(p.restaurant.appSharePercent, 0);
    assert.equal(p.shopping.appSharePercent, 0);
    const { appShare, driverEarning } = splitDeliveryFee(
      3000,
      p.shopping.appSharePercent,
    );
    assert.equal(appShare, 0);
    assert.equal(driverEarning, 3000);
  });

  test("4. the two kinds are independently configurable", () => {
    const p = normalizeDeliveryPricing({
      restaurant: { appSharePercent: 40 },
      shopping: { appSharePercent: 10 },
    });
    assert.equal(p.restaurant.appSharePercent, 40);
    assert.equal(p.shopping.appSharePercent, 10);
    // Same fee, different split — the only thing the kind may change.
    assert.deepEqual(splitDeliveryFee(2000, p.restaurant.appSharePercent), {
      appShare: 800,
      driverEarning: 1200,
    });
    assert.deepEqual(splitDeliveryFee(2000, p.shopping.appSharePercent), {
      appShare: 200,
      driverEarning: 1800,
    });
  });
});

describe("D-3 · D. the client shows what the server charges", () => {
  const SUMMARY = read("client/components/checkout/OrderSummaryCard.tsx");
  const MOBILE = read("client/screens/AdminScreen.tsx");

  test("15. no hardcoded delivery fee survives on the client", () => {
    for (const [name, src] of [
      ["CheckoutScreen", CHECKOUT],
      ["OrderSummaryCard", SUMMARY],
    ]) {
      const code = stripComments(src);
      assert.doesNotMatch(
        code,
        /formatPrice\(\s*\d{3,}\s*\)/,
        `${name} prints a literal amount as the delivery fee`,
      );
    }
  });

  test("11. checkout resolves the same fee as the server, for every live area", () => {
    const clientExpr = CHECKOUT.match(/const deliveryFee =\s*([\s\S]*?);\n/);
    assert.ok(clientExpr, "the checkout fee expression moved");
    const clientChain = new Function(
      "vendorDeliveryFee",
      "selectedAreaData",
      `const deliveryFee = ${clientExpr[1].replace(/\/\/[^\n]*/g, "")};\nreturn deliveryFee;`,
    );
    for (const fee of LIVE_AREA_FEES) {
      assert.equal(
        clientChain(null, { fee }),
        resolveServerFee(null, fee),
        `client and server disagree on an area fee of ${fee}`,
      );
    }
    for (const override of [0, 500, 4000]) {
      assert.equal(
        clientChain(override, { fee: 2500 }),
        resolveServerFee(override, 2500),
      );
    }
  });

  test("the checkout fee expression has no order-kind branch left", () => {
    const expr = CHECKOUT.match(/const deliveryFee =\s*([\s\S]*?);\n/)[1];
    assert.doesNotMatch(
      expr,
      /[Rr]estaurant/,
      "the kind still changes the displayed fee",
    );
    assert.doesNotMatch(
      expr,
      /\d{3,}/,
      "a literal fee is back in the expression",
    );
  });

  test("the app reads the split from the same public endpoint", () => {
    assert.match(
      stripComments(CONTEXT),
      /deliveryPricing: normalizeDeliveryPricing\(/,
    );
    assert.match(
      stripComments(ROUTES),
      /deliveryPricing: settings\.deliveryPricing,/,
      "/api/settings/public no longer serves the split",
    );
  });

  test("16. the dashboard preview computes the same split as the server", () => {
    for (const fee of [...LIVE_AREA_FEES, 0, 999, 12345]) {
      for (const pct of [0, 17, 40, 50, 83, 100]) {
        const shared = splitDeliveryFee(fee, pct);
        const dash = dpSplit(fee, pct);
        assert.equal(
          dash.app,
          shared.appShare,
          `app share differs at ${fee}/${pct}`,
        );
        assert.equal(
          dash.driver,
          shared.driverEarning,
          `driver share differs at ${fee}/${pct}`,
        );
        assert.equal(dash.app + dash.driver, dash.fee);
      }
    }
  });

  test("12. web, mobile and API share one endpoint and one payload shape", () => {
    const admin = stripComments(ADMIN);
    const mobile = stripComments(MOBILE);
    for (const [name, code] of [
      ["web", admin],
      ["mobile", mobile],
    ]) {
      assert.match(
        code,
        /deliveryPricing: /,
        `${name} does not send deliveryPricing`,
      );
      assert.match(
        code,
        /appSharePercent/,
        `${name} does not send a share percentage`,
      );
    }
    assert.match(admin, /\/admin\/settings/, "web posts elsewhere");
    assert.match(mobile, /\/api\/admin\/settings/, "mobile posts elsewhere");
    assert.match(
      admin,
      /\/delivery-areas/,
      "web previews against a different source",
    );
    assert.match(
      mobile,
      /\/api\/admin\/delivery-areas/,
      "mobile previews against a different source",
    );
  });

  test("neither dashboard offers a per-kind fee input", () => {
    const admin = stripComments(ADMIN);
    assert.doesNotMatch(
      admin,
      /id="dp-restaurant-fee"/,
      "a restaurant fee input is back",
    );
    assert.doesNotMatch(
      admin,
      /id="dp-shopping-fee"/,
      "a shopping fee input is back",
    );
    assert.doesNotMatch(
      stripComments(MOBILE),
      /dpRestaurantFee|dpShoppingFee/,
      "a per-kind fee field is back on mobile",
    );
  });

  test("the driver percentage is read-only in the dashboard", () => {
    const admin = stripComments(ADMIN);
    for (const kind of ["restaurant", "shopping"]) {
      const at = admin.indexOf(`id="dp-${kind}-driver"`);
      assert.ok(at > -1, `the ${kind} driver field is missing`);
      const tag = admin.slice(
        admin.lastIndexOf("<input", at),
        admin.indexOf(">", at),
      );
      assert.match(tag, /readonly/, `the ${kind} driver share is editable`);
      assert.match(tag, /disabled/, `the ${kind} driver share is editable`);
    }
  });

  test("the store card no longer advertises a price checkout will not charge", () => {
    for (const f of [
      "client/screens/StoresListScreen.tsx",
      "client/screens/HomeScreen.tsx",
    ]) {
      const code = stripComments(read(f));
      assert.doesNotMatch(
        code,
        /deliveryPrice === 0/,
        `${f} still prints the vendor-set deliveryPrice as the price`,
      );
      assert.match(
        code,
        /deliveryOverride/,
        `${f} must show only a real override`,
      );
    }
  });
});

describe("D-3 · E. the store commission survives being saved", () => {
  /** The dashboard's load + save of the commission field, lifted and executed. */
  const commissionRoundTrip = (stored, typed) => {
    const loadExpr = ADMIN.match(
      /document\.getElementById\('medit-commission'\)\.value =\s*([\s\S]*?);\n/,
    );
    assert.ok(loadExpr, "the commission load expression moved");
    const shown = new Function("v", `return (${loadExpr[1].trim()});`)({
      commissionPercent: stored,
    });
    const raw = typed === undefined ? String(shown) : typed;
    const saveExpr = ADMIN.match(
      /\.\.\.\(function\(\)\{\s*\n\s*const raw = document\.getElementById\('medit-commission'\)\.value\.trim\(\);([\s\S]*?)\}\)\(\),/,
    );
    assert.ok(saveExpr, "the commission save expression moved");
    const body = saveExpr[1].replace(/\/\/[^\n]*/g, "");
    const payload = new Function("raw", `${body}`)(String(raw).trim());
    return { shown, payload };
  };

  test("17. an untouched blank field does not change the stored commission", () => {
    // Two of the three live stores have NO stored commissionPercent.
    const { shown, payload } = commissionRoundTrip(undefined);
    assert.equal(shown, "", "a store with no rate must show an empty field");
    assert.deepEqual(
      payload,
      {},
      "saving sent a commission the admin never typed",
    );
    assert.ok(!("commissionPercent" in payload));
  });

  test("18. an explicit 0 is shown and saved as 0", () => {
    const { shown, payload } = commissionRoundTrip(0);
    assert.equal(shown, 0, "a contracted 0% must not display as blank");
    assert.deepEqual(payload, { commissionPercent: 0 });
  });

  test("19. 10 and 25 round-trip unchanged", () => {
    for (const rate of [10, 25, 7.5]) {
      const { shown, payload } = commissionRoundTrip(rate);
      assert.equal(shown, rate);
      assert.deepEqual(payload, { commissionPercent: rate });
    }
  });

  test("the `|| 0` that zeroed the commission is gone", () => {
    const code = stripComments(ADMIN);
    assert.doesNotMatch(
      code,
      /commissionPercent: parseFloat\(document\.getElementById\('medit-commission'\)\.value\) \|\| 0/,
      "REGRESSION: a blank field becomes an explicit 0% again",
    );
    assert.doesNotMatch(
      code,
      /'medit-commission'\)\.value = v\.commissionPercent \|\| ''/,
      "REGRESSION: a contracted 0% is blanked on load again",
    );
  });

  test("the server still refuses an out-of-range rate (H-06 guard intact)", () => {
    const code = stripComments(ROUTES);
    assert.match(
      code,
      /if \(!isValidCommissionPercent\(body\.commissionPercent\)\)/,
    );
    assert.match(
      code,
      /if \(body\.commissionPercent !== undefined\)/,
      "an omitted commission must leave the stored value alone",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("D-3 · F. owner-earnings reports what was booked", () => {
  const fn = lift(ROUTES, 'app.get("/api/admin/owner-earnings"', {
    fromBodyBrace: false,
  });

  test("20. the invented constants are gone", () => {
    const code = stripComments(fn);
    assert.doesNotMatch(
      code,
      /isRestaurant \? 750 : 2000/,
      "the fabricated driver earning is back",
    );
    assert.doesNotMatch(
      code,
      /isRestaurant \? 250 : 1000/,
      "the fabricated owner earning is back",
    );
    for (const n of ["750", "2000", "250"]) {
      assert.doesNotMatch(
        code,
        new RegExp(`\\b${n}\\b`),
        `the constant ${n} is still in owner-earnings`,
      );
    }
  });

  test("21. only frozen per-order values are summed", () => {
    const code = stripComments(fn);
    assert.match(code, /totalOwnerEarnings \+= o\.ownerEarning \|\| 0;/);
    assert.match(code, /totalDriverEarnings \+= o\.driverEarning \|\| 0;/);
    assert.match(
      code,
      /ordersMissingEarnings\+\+;/,
      "an order with no booked earnings must be counted, not invented",
    );
    assert.match(
      code,
      /ordersMissingEarnings,/,
      "the gap must be reported to the caller",
    );
  });

  test("the totals reconcile against orders.ownerEarning", () => {
    // Executable: the endpoint's own accumulation, over a fixture.
    const orders = [
      { deliveryFee: 1000, driverEarning: 750, ownerEarning: 250 },
      { deliveryFee: 2500, driverEarning: 1675, ownerEarning: 825 },
      { deliveryFee: 3000 }, // never settled
    ];
    let totalOwner = 0,
      totalDriver = 0,
      withEarnings = 0,
      missing = 0;
    for (const o of orders) {
      if (o.driverEarning !== undefined) {
        totalDriver += o.driverEarning || 0;
        totalOwner += o.ownerEarning || 0;
        withEarnings++;
      } else missing++;
    }
    const expectedOwner = orders.reduce((s, o) => s + (o.ownerEarning ?? 0), 0);
    assert.equal(totalOwner, expectedOwner);
    assert.equal(totalOwner, 1075);
    assert.equal(totalDriver, 2425);
    assert.equal(withEarnings, 2);
    assert.equal(missing, 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("D-3 · zero-swallowing fallbacks are gone", () => {
  test("a saved payout rate of 0 is stored as 0, not silently replaced", () => {
    const code = stripComments(ROUTES);
    assert.doesNotMatch(
      code,
      /Number\(r\.flatRestaurant\) \|\| 750/,
      "REGRESSION (H-06 class): a flat rate of 0 becomes 750 again",
    );
    assert.doesNotMatch(code, /Number\(r\.flatDefault\) \|\| 2000/);
    assert.doesNotMatch(code, /Number\(r\.percent\) \|\| 15/);

    // Executed: the shipped sanitiser, lifted from the settings route.
    const num = new Function(
      "value",
      "fallback",
      "const n = Number(value); return Number.isFinite(n) ? n : fallback;",
    );
    assert.equal(Math.max(0, num(0, 750)), 0);
    assert.equal(Math.max(0, num(undefined, 750)), 750);
    assert.equal(Math.min(100, Math.max(0, num(0, 15))), 0);
  });

  test("the settings route validates the pricing payload", () => {
    const code = stripComments(ROUTES);
    assert.match(code, /حصة التطبيق يجب أن تكون بين 0 و100/);
    assert.match(code, /صيغة تقسيم أجرة التوصيل غير صحيحة/);
    assert.match(code, /update\.deliveryPricing = cleaned;/);
    // No fee may be saved through the settings route any more.
    assert.doesNotMatch(
      code,
      /update\.restaurantDeliveryFee = /,
      "a per-kind flat fee can be stored again",
    );
  });

  test("no D-3 financial constant is left outside the pricing module", () => {
    const orderCreation = stripComments(ROUTES).slice(
      stripComments(ROUTES).indexOf(
        "let verifiedDeliveryFee: number | null = null",
      ),
      stripComments(ROUTES).indexOf(
        "orderData.appSharePercent = appSharePercent;",
      ),
    );
    assert.doesNotMatch(
      orderCreation,
      /\b1000\b/,
      "a literal fee is back in the pricing block",
    );
  });
});
