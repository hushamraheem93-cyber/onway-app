/**
 * H-66 — the stored order lines are the client's raw array.
 *
 * Original finding (audit report, HIGH section):
 *   "عناصر الطلب المحفوظة هي مصفوفة العميل الخام — الأسعار والأسماء التي يرسلها
 *    العميل تُخزَّن وتُعرَض للمتجر والسائق والإدارة رغم صحة الإجمالي" — routes.ts
 *
 * Re-verified against the code before changing anything. Two of the report's
 * three claims held; one had already been fixed by a later round and is recorded
 * here rather than "fixed" again:
 *
 *   CONFIRMED  `orderData.items = capOrderItemImages(items)` stored the request's
 *              own array. `capOrderItemImages` only blanks oversized inline
 *              images — it does not rebuild a line.
 *   CONFIRMED  the stored `quantity` was the raw client value while the subtotal
 *              used `sanitizeQuantity`, so a line could be priced as 1 and stored
 *              (and picked, and delivered) as 99 — or as `-5`, or `1e999`.
 *   OUTDATED   the report says the `[FRAUD_CHECK]` price comparison "warns but
 *              does not reject". It does reject now: a per-line price differing
 *              from the catalogue by more than 1 IQD returns 400. So the exploit
 *              is not "charge 0" — the total was always safe. It is that the
 *              NAME, the quantity, the variant label and the add-on list shown to
 *              the store, the driver, the admin and the printed receipt were
 *              whatever the caller typed.
 *
 * The fix rebuilds every stored line from the catalogue document the price was
 * verified against. These tests run the real shipped helper — lifted out of
 * server/orderValidation.ts and transpiled, never reimplemented here — and read
 * the route's own source to prove the rebuild is actually wired into the write.
 *
 * Run:  node --test tests/unit/h66-stored-order-items.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { stripComments } from "./_source.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const read = (p) => readFileSync(join(root, p), "utf8");

const ROUTES = read("server/routes.ts");
const VALIDATION_SRC = read("server/orderValidation.ts");

/**
 * Load the real module. `orderValidation.ts` is dependency-free by design — the
 * file's own header says it exists so these helpers can be unit-tested directly —
 * so transpiling and evaluating it runs the shipped code, not a copy of it.
 */
const { buildStoredOrderItem, sanitizeQuantity, capOrderItemImages, MAX_ITEM_QUANTITY } =
  await (async () => {
    const js = ts.transpileModule(VALIDATION_SRC, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const url = `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
    return import(url);
  })();

/** A catalogue-resolved line, as the route builds it. */
const line = (over = {}) => ({
  productId: "p1",
  name: "برغر دجاج",
  unitPrice: 7000,
  quantity: 2,
  image: "https://firebasestorage.googleapis.com/x.jpg",
  ...over,
});

// ─────────────────────────────────────────────────────────────────────────────
describe("H-66 · the shape of the problem, re-measured", () => {
  test("the helper the fix depends on is exported and dependency-free", () => {
    assert.equal(typeof buildStoredOrderItem, "function");
    // If this file ever imports firebase or express it stops being unit-testable,
    // and these tests would silently start exercising a stub instead.
    assert.doesNotMatch(stripComments(VALIDATION_SRC), /^import /m,
      "orderValidation.ts gained an import — it is meant to stay pure");
  });

  test("the price check does reject, so the total was never the exposure", () => {
    // Recorded because the original report says otherwise. The finding is real;
    // this specific sentence in it is not, and the fix should not be justified by
    // a claim that no longer matches the code.
    const body = ROUTES.slice(ROUTES.indexOf('app.post("/api/orders"'));
    const at = body.indexOf("[FRAUD_CHECK]");
    assert.ok(at > 0, "the price-mismatch check disappeared");
    const after = body.slice(at, at + 400);
    assert.match(after, /return res\.status\(400\)/,
      "the price mismatch went back to warning without rejecting");
  });
});

describe("H-66 · a stored line is built from the catalogue, not the request", () => {
  test("the name comes from the resolved product", () => {
    // The exploit in the report: a real productId with a made-up name.
    const stored = buildStoredOrderItem(line({ name: "برغر دجاج" }));
    assert.equal(stored.name, "برغر دجاج");
    // The helper takes only the resolved values — there is no channel for the
    // client's own name to reach it, which is the point of the signature.
    assert.deepEqual(Object.keys(stored).sort(),
      ["image", "name", "price", "productId", "quantity"].sort());
  });

  test("the price is the verified unit price", () => {
    assert.equal(buildStoredOrderItem(line({ unitPrice: 7000 })).price, 7000);
  });

  test("a non-finite resolved price cannot be stored", () => {
    // Defence in depth: the route already rejects unusable catalogue prices, but a
    // NaN reaching a stored line would poison every later sum that reads it.
    for (const bad of [NaN, Infinity, -Infinity, "abc", undefined, null]) {
      assert.equal(buildStoredOrderItem(line({ unitPrice: bad })).price, 0,
        `${String(bad)} survived into a stored line`);
    }
  });

  test("the stored quantity is the same one the line was priced with", () => {
    // This is the half of H-66 that was not cosmetic: the two used to disagree.
    for (const raw of [-5, 0, 0.5, "3", 1e999, NaN, undefined, "abc"]) {
      const stored = buildStoredOrderItem(line({ quantity: raw }));
      assert.equal(stored.quantity, sanitizeQuantity(raw),
        `stored quantity for ${String(raw)} does not match the priced quantity`);
      assert.ok(Number.isInteger(stored.quantity) && stored.quantity >= 1);
      assert.ok(stored.quantity <= MAX_ITEM_QUANTITY);
    }
  });

  test("a name that is not text becomes empty rather than an object", () => {
    for (const bad of [undefined, null, 42, { toString: () => "x" }, ["x"]]) {
      assert.equal(buildStoredOrderItem(line({ name: bad })).name, "");
    }
  });
});

describe("H-66 · variants and add-ons describe what was charged", () => {
  test("a variant is stored only when the catalogue matched one", () => {
    const withVariant = buildStoredOrderItem(line({
      variant: { id: "v1", name: "كبير", priceAdjustment: 1500 },
    }));
    assert.equal(withVariant.selectedVariantId, "v1");
    assert.equal(withVariant.variantName, "كبير");
    assert.equal(withVariant.variantPriceAdjustment, 1500);

    // No match ⇒ nothing was added to the price, so nothing is described.
    for (const none of [null, undefined, { id: "" }]) {
      const stored = buildStoredOrderItem(line({ variant: none }));
      assert.ok(!("selectedVariantId" in stored), "an unmatched variant was stored");
      assert.ok(!("variantName" in stored));
    }
  });

  test("add-ons are stored with the catalogue's own names and prices", () => {
    const stored = buildStoredOrderItem(line({
      addons: [
        { id: "a1", name: "جبن إضافي", price: 500 },
        { id: "a2", name: "صوص", price: 250 },
      ],
    }));
    assert.deepEqual(stored.selectedAddons, [
      { id: "a1", name: "جبن إضافي", price: 500 },
      { id: "a2", name: "صوص", price: 250 },
    ]);
  });

  test("an add-on with no id is dropped, not persisted with a claimed price", () => {
    const stored = buildStoredOrderItem(line({
      addons: [{ id: "", name: "مجاني", price: 0 }, { id: "a1", name: "جبن", price: 500 }],
    }));
    assert.deepEqual(stored.selectedAddons, [{ id: "a1", name: "جبن", price: 500 }]);
  });

  test("an empty add-on list adds no key at all", () => {
    for (const none of [[], undefined, null, "not an array"]) {
      const stored = buildStoredOrderItem(line({ addons: none }));
      assert.ok(!("selectedAddons" in stored),
        `${JSON.stringify(none)} produced a selectedAddons key`);
    }
  });
});

describe("H-66 · the stored document stays writable and readable", () => {
  test("no key is ever undefined — Firestore rejects such a document", () => {
    // An order that fails to write is a failed checkout, so this is not academic.
    const stored = buildStoredOrderItem({
      productId: "p1", name: undefined, unitPrice: 1000, quantity: undefined,
      image: undefined, restaurant: undefined, variant: undefined, addons: undefined,
    });
    for (const [k, v] of Object.entries(stored)) {
      assert.notEqual(v, undefined, `${k} is undefined and would fail the write`);
    }
    assert.deepEqual(JSON.parse(JSON.stringify(stored)), stored);
  });

  test("the shape matches what readers already expect", () => {
    // firebase.ts declares the stored line; every consumer reads through it.
    const declared = read("server/firebase.ts").match(
      /items: \{([^}]*)\}\[\];/,
    )?.[1];
    assert.ok(declared, "the FirestoreOrder.items declaration moved");
    const stored = buildStoredOrderItem(line());
    for (const field of ["productId", "name", "price", "quantity"]) {
      assert.ok(declared.includes(field), `${field} left the declared shape`);
      assert.ok(field in stored, `${field} is missing from a stored line`);
    }
  });

  test("the image cap still applies to the rebuilt lines", () => {
    // capOrderItemImages runs after the rebuild, so the 1MB guard is unaffected.
    const big = "d".repeat(400_000);
    const lines = [1, 2, 3].map((n) =>
      buildStoredOrderItem(line({ productId: `p${n}`, image: big })));
    const capped = capOrderItemImages(lines);
    assert.equal(capped[0].image, big);
    assert.equal(capped[2].image, "", "the third image was not dropped");
  });

  test("an absent image is omitted rather than stored as undefined", () => {
    const stored = buildStoredOrderItem(line({ image: undefined }));
    assert.ok(!("image" in stored));
  });
});

describe("H-66 · the rebuild is wired into the only write path", () => {
  const CODE = stripComments(ROUTES);

  test("the order write stores the rebuilt lines, not the request array", () => {
    assert.match(CODE, /items: capOrderItemImages\(verifiedItems\)/,
      "the order document is not being written from the rebuilt lines");
    assert.doesNotMatch(CODE, /items: capOrderItemImages\(items\)/,
      "REGRESSION: the client's raw array is stored again");
    assert.match(CODE, /const verifiedItems = resolvedLines\.map\(buildStoredOrderItem\)/,
      "the rebuild step disappeared");
  });

  test("POST /api/orders is still the only path that writes order items", () => {
    // If a second writer appears it needs the same treatment; this fails loudly.
    const writers = [...CODE.matchAll(/items: capOrderItemImages\(/g)].length;
    assert.equal(writers, 1, "a second order-item write path appeared");
    for (const f of ["server/vendor.ts", "server/firebase.ts"]) {
      assert.doesNotMatch(stripComments(read(f)), /capOrderItemImages\(/,
        `${f} started writing order items`);
    }
  });

  test("every resolved line carries a catalogue name and price", () => {
    // The route must populate the resolver from the SAME document it priced from.
    // Both branches — the legacy product cache and vendorProducts — are checked.
    const at = CODE.indexOf("const resolvedLines");
    assert.ok(at > 0, "the resolver array is gone");
    const loop = CODE.slice(at, CODE.indexOf("if (unknownProductIds.length > 0)", at));
    assert.match(loop, /resolvedName = legacyProduct\.name/,
      "the legacy branch stopped resolving the catalogue name");
    assert.match(loop, /resolvedName = vp\.name/,
      "the vendorProducts branch stopped resolving the catalogue name");
    assert.match(loop, /resolvedLines\.push\(\{/, "lines are no longer collected");
    assert.match(loop, /unitPrice: realPrice/,
      "the stored price is no longer the verified price");
  });

  test("the payout base is computed from the same verified lines", () => {
    // restaurantSubtotal feeds vendorCommissionBase(). Reading it from a
    // per-productId map meant two lines of the same product with different add-ons
    // were both valued at whichever price was computed last — disagreeing with the
    // subtotal the customer was charged.
    assert.match(CODE, /for \(const it of verifiedItems\)/,
      "the restaurant scan went back to walking the request array");
    assert.match(CODE, /restaurantSubtotal \+= it\.price \* it\.quantity/,
      "the payout base is no longer derived from the verified lines");
  });

  test("nothing about the order's own money changed", () => {
    // H-66 is about what is STORED for people to read. The pricing itself is
    // untouched, and these are the values that decide what is charged and paid.
    for (const marker of [
      /verifiedSubtotal \+= realPrice \* quantity/,
      /const quantity = sanitizeQuantity\(it\.quantity\)/,
      /total: verifiedTotal/,
      /deliveryFee: verifiedDeliveryFee/,
      /orderData\.serviceFee = verifiedServiceFee/,
      /orderData\.orderKind = orderKind/,
      /orderData\.appSharePercent = appSharePercent/,
    ]) {
      assert.match(CODE, marker, "an order pricing rule moved with the item rebuild");
    }
  });
});
