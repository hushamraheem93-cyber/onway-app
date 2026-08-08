/**
 * Cart identity tests (audit finding C-18).
 *
 * getCartKey() is the identity of a cart line. Two lines must be distinct when the
 * product, the variant, OR the chosen add-ons differ — otherwise editing one line
 * silently edits another, and React sees duplicate list keys.
 *
 * The key is pure logic, so it is verified directly against the source of truth
 * (the exported helper), plus a guard that no cart control addresses a row by the
 * bare product id — the branch that matches EVERY variant of that product.
 *
 * Run:  node --test tests/unit/cart-key.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Imported from the pure module (CartContext re-exports it); CartContext itself
// pulls in react-native, which the Node test runner cannot load.
import { getCartKey } from "../../client/context/cartKey.ts";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, "../../", p), "utf8");

const product = (id = "p1") => ({ id, name: "بيتزا", price: 10000 });
const variant = (id, priceAdjustment = 0) => ({ id, name: id, priceAdjustment });
const addon = (id, price = 1000) => ({ id, name: id, price });

describe("C-18 — cart key distinguishes every variant", () => {
  test("a product with no variant gets a stable 'base' key", () => {
    const k1 = getCartKey({ product: product() });
    const k2 = getCartKey({ product: product() });
    assert.equal(k1, k2, "key must be stable across calls");
    assert.equal(k1, "p1__base");
  });

  test("Variant A and Variant B are different lines", () => {
    const red = getCartKey({ product: product(), selectedVariant: variant("red") });
    const blue = getCartKey({ product: product(), selectedVariant: variant("blue") });
    assert.notEqual(red, blue, "different variants must not collide");
  });

  test("the same variant twice is the same line (so quantity merges)", () => {
    const a = getCartKey({ product: product(), selectedVariant: variant("red") });
    const b = getCartKey({ product: product(), selectedVariant: variant("red") });
    assert.equal(a, b);
  });

  test("a variant line never collides with the no-variant line", () => {
    const base = getCartKey({ product: product() });
    const red = getCartKey({ product: product(), selectedVariant: variant("red") });
    assert.notEqual(base, red);
  });

  test("different products never collide even with the same variant id", () => {
    const a = getCartKey({ product: product("p1"), selectedVariant: variant("large") });
    const b = getCartKey({ product: product("p2"), selectedVariant: variant("large") });
    assert.notEqual(a, b);
  });

  test("a product with several variants yields as many distinct lines", () => {
    const keys = ["small", "medium", "large"].map((v) =>
      getCartKey({ product: product(), selectedVariant: variant(v) }),
    );
    assert.equal(new Set(keys).size, 3, "every variant must own a line");
  });
});

describe("C-18 — add-ons are part of cart identity", () => {
  test("different add-on choices are different lines", () => {
    const cheese = getCartKey({ product: product(), selectedAddons: [addon("cheese")] });
    const olives = getCartKey({ product: product(), selectedAddons: [addon("olives")] });
    assert.notEqual(cheese, olives, "extra cheese must not be billed as olives");
  });

  test("add-ons distinguish a line from the plain product", () => {
    const plain = getCartKey({ product: product() });
    const withCheese = getCartKey({ product: product(), selectedAddons: [addon("cheese")] });
    assert.notEqual(plain, withCheese);
  });

  test("key does not depend on the ORDER add-ons were tapped in", () => {
    const ab = getCartKey({ product: product(), selectedAddons: [addon("a"), addon("b")] });
    const ba = getCartKey({ product: product(), selectedAddons: [addon("b"), addon("a")] });
    assert.equal(ab, ba, "key must be order-independent and therefore stable");
  });

  test("an empty add-on list behaves exactly like no add-ons (cart persistence)", () => {
    // A cart rehydrated from AsyncStorage may carry [] where the original had
    // undefined; both must resolve to the same line or the saved cart splits in two.
    assert.equal(
      getCartKey({ product: product(), selectedAddons: [] }),
      getCartKey({ product: product() }),
    );
  });

  test("variant + add-ons combine into one distinct identity", () => {
    const base = { product: product(), selectedVariant: variant("large") };
    const withCheese = { ...base, selectedAddons: [addon("cheese")] };
    assert.notEqual(getCartKey(base), getCartKey(withCheese));
  });

  test("the key contains no array index or other unstable value", () => {
    // Same logical line built from freshly-allocated objects must key identically.
    const k1 = getCartKey({
      product: product(),
      selectedVariant: variant("large", 500),
      selectedAddons: [addon("cheese", 1000), addon("olives", 250)],
    });
    const k2 = getCartKey({
      product: product(),
      selectedVariant: variant("large", 500),
      selectedAddons: [addon("olives", 250), addon("cheese", 1000)],
    });
    assert.equal(k1, k2);
  });
});

describe("C-18 — cart row controls address a line, not a product", () => {
  const cartControls = [
    ["client/components/CartItemCard.tsx", "cart row +/− and delete"],
    ["client/components/FloatingCartBar.tsx", "floating cart bar +/−"],
  ];

  for (const [file, label] of cartControls) {
    test(`${label} never passes a bare product id`, () => {
      const src = read(file);
      assert.doesNotMatch(
        src,
        /(updateQuantity|removeFromCart|increase|decrease)\(\s*(item|cartItem)\.product\.id/,
        `REGRESSION: ${file} addresses the cart by product id, which matches EVERY variant of that product`,
      );
      assert.match(src, /getCartKey/, `${file} must resolve rows through getCartKey`);
    });
  }

  test("the cart list uses the cart key as its React key", () => {
    const src = read("client/screens/CartScreen.tsx");
    assert.match(
      src,
      /keyExtractor=\{\(item\) => getCartKey\(item\)\}/,
      "REGRESSION: duplicate React keys when one product is in the cart under two variants",
    );
  });

  test("addToCart derives its merge key from getCartKey", () => {
    const src = read("client/context/CartContext.tsx");
    assert.match(
      src,
      /const key = getCartKey\(\{ product, selectedVariant, selectedAddons \}\)/,
      "REGRESSION: hand-built merge key drifts from getCartKey and re-merges distinct add-on choices",
    );
  });
});
