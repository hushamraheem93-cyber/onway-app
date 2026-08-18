/**
 * C-06 / C-07 — the courier-pickup and international-shopping requests.
 *
 * Both screens are shipped, linked from the category grid, and produced ZERO
 * successful orders. Three gates rejected them, and the audit named only the
 * first two:
 *
 *   1. no Authorization header → 401 (fixed before this round)
 *   2. `productId: "courier-pickup"` / `international-<site>` resolve to nothing
 *      in the catalogue → unknownProductIds → 400 «منتج غير موجود أو غير متاح»
 *   3. region "خدمات المندوب" / "التسوق الدولي" is not an active delivery area,
 *      and H-02 refuses any order whose region resolves to none → 400
 *
 * The fix is `server/serviceOrders.ts`: a narrow resolver that runs BEFORE the
 * catalogue loop, only for an order tagged as one of the two services, and returns
 * server-decided money. The real module is transpiled and executed here — this is
 * not a source scan.
 *
 * What the tests are really guarding is that the exception stayed narrow: it must
 * not become a way to get an arbitrary productId, an arbitrary price, or free
 * delivery past the checks that H-02 and H-05 exist to enforce.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "../..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

// ── the shipped module, executed ─────────────────────────────────────────────
const SRC = read("server/serviceOrders.ts");
const SVC = (() => {
  const js = ts.transpileModule(SRC.replace(/\bexport\s+/g, ""), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function(
    `${js}\nreturn { resolveServiceOrder, isServiceOrderType, isServiceProductId,
      parseDeclaredValue, SERVICE_ORDER_TYPES, INTERNATIONAL_SITES,
      MAX_DECLARED_VALUE, SERVICE_REQUEST_DELIVERY_FEE };`,
  )();
})();

const ROUTES = read("server/routes.ts");

// `over` is applied FIRST so a caller's partial detail object merges into the
// valid defaults instead of replacing them — otherwise every override would also
// silently drop the required fields and the test would pass for the wrong reason.
const courier = (over = {}) => ({
  orderType: "courier-pickup",
  items: [
    { productId: "courier-pickup", name: "x", price: 25000, quantity: 1 },
  ],
  ...over,
  courierDetails: {
    courierPhone: "07******123",
    pickupLocation: "سوق الضلوعية",
    declaredValue: 25000,
    ...(over.courierDetails ?? {}),
  },
});
const intl = (over = {}) => ({
  orderType: "international-shopping",
  items: [
    { productId: "international-shein", name: "x", price: 0, quantity: 2 },
  ],
  ...over,
  internationalDetails: {
    site: "shein",
    productLink: "https://example.invalid/item/1",
    productDetails: "قميص أزرق مقاس M",
    ...(over.internationalDetails ?? {}),
  },
});

describe("C-06/C-07 (A) — the request the screens send is now accepted", () => {
  test("a courier pickup resolves", () => {
    const r = SVC.resolveServiceOrder(courier());
    assert.equal(r.ok, true, r.ok ? "" : r.error);
    assert.equal(r.value.type, "courier-pickup");
    assert.equal(r.value.line.productId, "courier-pickup");
  });

  test("an international request resolves", () => {
    const r = SVC.resolveServiceOrder(intl());
    assert.equal(r.ok, true, r.ok ? "" : r.error);
    assert.equal(r.value.type, "international-shopping");
    assert.equal(r.value.line.productId, "international-shein");
  });

  test("the two synthetic ids the audit named are exactly the ones handled", () => {
    assert.equal(SVC.isServiceProductId("courier-pickup"), true);
    assert.equal(SVC.isServiceProductId("international-shein"), true);
    assert.equal(SVC.isServiceProductId("p-1"), false);
    assert.equal(SVC.isServiceProductId(""), false);
    assert.equal(SVC.isServiceProductId(null), false);
  });
});

describe("C-06/C-07 (B) — the client cannot dictate money", () => {
  test("item.price is ignored; the declared value comes from the details", () => {
    const r = SVC.resolveServiceOrder(
      courier({
        items: [{ productId: "courier-pickup", price: 999_999, quantity: 1 }],
        courierDetails: { declaredValue: 25000 },
      }),
    );
    assert.equal(r.ok, true);
    assert.equal(
      r.value.declaredValue,
      25000,
      "the item price leaked into the total",
    );
  });

  test("an international request is always zero until it is quoted", () => {
    const r = SVC.resolveServiceOrder(
      intl({
        items: [
          { productId: "international-shein", price: 750_000, quantity: 1 },
        ],
      }),
    );
    assert.equal(r.ok, true);
    assert.equal(r.value.declaredValue, 0);
  });

  test("the delivery fee is the server's, never the request's", () => {
    for (const req of [courier({ deliveryFee: 0 }), intl({ deliveryFee: 0 })]) {
      const r = SVC.resolveServiceOrder(req);
      assert.equal(r.ok, true);
      assert.equal(r.value.deliveryFee, SVC.SERVICE_REQUEST_DELIVERY_FEE);
      assert.ok(
        r.value.deliveryFee > 0,
        "H-02: a service order must not ship free",
      );
    }
  });

  test("a declared value above the cap is refused, not clamped", () => {
    const r = SVC.resolveServiceOrder(
      courier({
        courierDetails: { declaredValue: SVC.MAX_DECLARED_VALUE + 1 },
      }),
    );
    assert.equal(r.ok, false);
  });

  test("junk declared values never become a number", () => {
    for (const v of [null, undefined, "", "abc", NaN, Infinity, -1, {}, []]) {
      assert.equal(
        SVC.parseDeclaredValue(v),
        null,
        `accepted ${JSON.stringify(v)}`,
      );
    }
    assert.equal(SVC.parseDeclaredValue("25000"), 25000);
    assert.equal(SVC.parseDeclaredValue(25000.7), 25001);
  });
});

describe("C-06/C-07 (C) — the exception cannot be widened", () => {
  test("a service tag with a real product line is refused", () => {
    const r = SVC.resolveServiceOrder(
      courier({ items: [{ productId: "v1", price: 3000, quantity: 1 }] }),
    );
    assert.equal(
      r.ok,
      false,
      "an arbitrary productId rode in on a service tag",
    );
  });

  test("a service tag carrying more than one line is refused", () => {
    const r = SVC.resolveServiceOrder(
      courier({
        items: [
          { productId: "courier-pickup", quantity: 1 },
          { productId: "v1", price: 500000, quantity: 1 },
        ],
      }),
    );
    assert.equal(r.ok, false, "a product was smuggled beside the exempt line");
  });

  test("an international line must name the same site as its details", () => {
    const r = SVC.resolveServiceOrder(
      intl({ items: [{ productId: "international-alibaba", quantity: 1 }] }),
    );
    assert.equal(
      r.ok,
      false,
      "the stored line and the quoted request disagreed",
    );
  });

  test("an unlisted site is refused", () => {
    for (const site of ["evil", "", "shein/../x", "SHEIN"]) {
      const r = SVC.resolveServiceOrder(
        intl({
          items: [{ productId: `international-${site}`, quantity: 1 }],
          internationalDetails: { site },
        }),
      );
      assert.equal(r.ok, false, `site "${site}" was accepted`);
    }
    assert.deepEqual(
      [...SVC.INTERNATIONAL_SITES],
      ["shein", "aliexpress", "alibaba"],
    );
  });

  test("a non-service order type is not this module's business", () => {
    for (const t of [
      "delivery",
      "restaurant",
      "",
      null,
      undefined,
      "courier",
    ]) {
      assert.equal(
        SVC.isServiceOrderType(t),
        false,
        `${t} treated as a service`,
      );
    }
    assert.deepEqual(
      [...SVC.SERVICE_ORDER_TYPES],
      ["courier-pickup", "international-shopping"],
    );
  });

  test("missing service details are refused rather than defaulted", () => {
    assert.equal(
      SVC.resolveServiceOrder({ ...courier(), courierDetails: {} }).ok,
      false,
    );
    assert.equal(
      SVC.resolveServiceOrder({
        ...intl(),
        internationalDetails: { site: "shein" },
      }).ok,
      false,
    );
  });
});

describe("C-06/C-07 (D) — what gets stored is rebuilt, not copied", () => {
  test("only known detail keys survive", () => {
    const r = SVC.resolveServiceOrder(
      courier({
        courierDetails: {
          courierPhone: "07******123",
          pickupLocation: "سوق",
          declaredValue: 1000,
          isAdmin: true,
          __proto__: { polluted: true },
          huge: "x".repeat(10_000),
        },
      }),
    );
    assert.equal(r.ok, true);
    assert.deepEqual(Object.keys(r.value.details).sort(), [
      "courierPhone",
      "declaredValue",
      "notes",
      "pickupLocation",
    ]);
    assert.equal(r.value.details.isAdmin, undefined);
    assert.equal(r.value.details.huge, undefined);
  });

  test("long free text is bounded", () => {
    const r = SVC.resolveServiceOrder(
      intl({
        internationalDetails: {
          site: "shein",
          productLink: "https://x.invalid/" + "a".repeat(9000),
          productDetails: "b".repeat(9000),
        },
      }),
    );
    assert.equal(r.ok, true);
    assert.ok(r.value.details.productLink.length <= 2000);
    assert.ok(r.value.details.productDetails.length <= 2000);
  });

  test("quantity is bounded and never fractional", () => {
    const mk = (q) =>
      SVC.resolveServiceOrder(
        intl({ items: [{ productId: "international-shein", quantity: q }] }),
      );
    assert.equal(mk(2).value.line.quantity, 2);
    assert.equal(mk(1e9).value.line.quantity, 99);
    assert.equal(mk(2.9).value.line.quantity, 2);
    assert.equal(mk(0).value.line.quantity, 1);
    assert.equal(mk("abc").value.line.quantity, 1);
  });
});

describe("C-06/C-07 (E) — the order route wiring", () => {
  test("the resolver runs only for a service order type", () => {
    assert.match(
      ROUTES,
      /isServiceOrderType\(normalizedOrderType\)\s*\?\s*resolveServiceOrder\(/,
      "the resolver must be gated on the order tag",
    );
  });

  test("the catalogue loop is skipped for a service order, not disabled", () => {
    // `items` still drives the loop for every ordinary order.
    assert.match(
      ROUTES,
      /for \(const it of service \? \[\] : \(items as any\[\]\)\)/,
    );
  });

  test("the unknown-product rejection is still in place for everyone else", () => {
    assert.match(
      ROUTES,
      /if \(unknownProductIds\.length > 0\) \{\s*return res\.status\(400\)/,
      "C-06's exception must not have removed the catalogue check",
    );
  });

  test("H-02's refusal still applies to non-service orders", () => {
    assert.match(ROUTES, /if \(verifiedDeliveryFee === null\) \{/);
    assert.match(ROUTES, /منطقة التوصيل غير مدعومة/);
  });

  test("the service delivery fee comes from the resolver, not the body", () => {
    assert.match(ROUTES, /verifiedDeliveryFee = service\.deliveryFee;/);
    assert.doesNotMatch(
      ROUTES,
      /verifiedDeliveryFee\s*=\s*Number\(deliveryFee\)/,
      "H-02 regression: the body's deliveryFee is being read again",
    );
  });

  test("the stored details are the resolver's object, not the request body", () => {
    assert.match(ROUTES, /orderData\.courierDetails = service\.details;/);
    assert.match(ROUTES, /orderData\.internationalDetails = service\.details;/);
    assert.doesNotMatch(
      ROUTES,
      /orderData\.courierDetails = courierDetails;/,
      "the raw client object is being persisted again",
    );
  });
});

describe("C-06/C-07 (F) — the screens", () => {
  const COURIER = read("client/screens/CourierPickupScreen.tsx");
  const INTL = read("client/screens/InternationalShoppingScreen.tsx");

  test("both attach the customer token", () => {
    for (const [n, s] of [
      ["courier", COURIER],
      ["international", INTL],
    ]) {
      assert.match(
        s,
        /Authorization: `Bearer \$\{customerToken\}`/,
        `${n} sends no token`,
      );
    }
  });

  test("the courier screen sends the details object the server validates", () => {
    assert.match(COURIER, /courierDetails: \{/);
    assert.match(COURIER, /courierPhone,/);
    assert.match(COURIER, /pickupLocation: courierLocation,/);
    assert.match(COURIER, /declaredValue: Number\(orderPrice\) \|\| 0,/);
  });

  test("both surface the server's real error instead of the generic one", () => {
    for (const [n, s] of [
      ["courier", COURIER],
      ["international", INTL],
    ]) {
      assert.match(
        s,
        /body && typeof body\.error === "string"/,
        `${n} still swallows the server error`,
      );
    }
  });

  test("the site ids the screen offers are the ones the server allows", () => {
    const ids = [...INTL.matchAll(/^\s+id: "([a-z0-9-]+)"/gm)].map((m) => m[1]);
    assert.deepEqual(ids, [...SVC.INTERNATIONAL_SITES]);
  });
});
