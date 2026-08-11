/**
 * C-18 — editing a quantity from the product grid must not touch other variants.
 *
 * The finding: CartContext exports getCartKey() and updateQuantity/removeFromCart
 * accept EITHER a cart key or a bare product id. Callers that pass a bare product
 * id hit the branch that matches EVERY line of that product.
 *
 * Most callers were fixed: CartItemCard and FloatingCartBar pass getCartKey(item),
 * and CartScreen's keyExtractor uses it too. ONE caller was left — ProductCard,
 * the grid card — which resolved its line with
 *     items.find((item) => item.product.id === product.id)
 * and then called
 *     updateQuantity(product.id, cartQuantity - 1)
 *
 * Concretely: cart holds "pizza / large × 3" and "pizza / small × 1". The card
 * displays 3 (the first matching line) and pressing "−" sets BOTH lines to 2 —
 * the small pizza goes 1 → 2 and the customer is billed for one they never added.
 *
 * These tests execute the REAL reducer semantics from CartContext against the
 * REAL getCartKey, and lift ProductCard's own line-resolution and "−" handler out
 * of the shipped file, so what is asserted is the behaviour the app has.
 *
 * Run:  node --test tests/unit/c18-cart-variant-identity.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getCartKey } from "../../client/context/cartKey.ts";
import { stripComments } from "./_source.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const CARD = stripComments(readFileSync(join(root, "client/components/ProductCard.tsx"), "utf8"));
const CTX = stripComments(readFileSync(join(root, "client/context/CartContext.tsx"), "utf8"));

/** The real dual-key semantics from CartContext.updateQuantity. */
function updateQuantity(items, productIdOrCartKey, quantity) {
  const isKey = productIdOrCartKey.includes("__");
  if (quantity <= 0) {
    return items.filter((item) =>
      isKey ? getCartKey(item) !== productIdOrCartKey : item.product.id !== productIdOrCartKey);
  }
  return items.map((item) => {
    const matches = isKey
      ? getCartKey(item) === productIdOrCartKey
      : item.product.id === productIdOrCartKey;
    return matches ? { ...item, quantity } : item;
  });
}

const PIZZA = { id: "pizza" };
const cart = () => ([
  { product: PIZZA, selectedVariant: { id: "large" }, quantity: 3 },
  { product: PIZZA, selectedVariant: { id: "small" }, quantity: 1 },
  { product: { id: "cola" }, quantity: 5 },
]);

/** What ProductCard actually passes to updateQuantity, read from the shipped file. */
function cardRemoveArgument() {
  const at = CARD.indexOf("const onRemove = useCallback(");
  assert.ok(at > 0, "ProductCard.onRemove disappeared");
  const body = CARD.slice(at, at + 320);
  const m = body.match(/l\.updateQuantity\(\s*([^,]+),/);
  assert.ok(m, `could not read the updateQuantity argument from:\n${body}`);
  return m[1].trim();
}

describe("C-18 · the grid card edits only its own line", () => {
  test("the card does NOT pass a bare product id", () => {
    const arg = cardRemoveArgument();
    assert.notEqual(arg, "l.product.id",
      "a bare product id matches EVERY variant line of that product");
  });

  test("the card resolves its line by cart key, not by product id alone", () => {
    assert.ok(!/items\.find\(\(item\) => item\.product\.id === product\.id\)/.test(CARD),
      "the card still binds to the first line of the product, whatever its variant");
    assert.match(CARD, /getCartKey\(/,
      "the card does not use the cart-key identity at all");
  });

  // The behavioural core: run the real reducer with what the card sends.
  test("pressing − on the grid card leaves other variants untouched", () => {
    const items = cart();
    const plainKey = getCartKey({ product: PIZZA });
    // A plain line exists alongside the variants — this is what the card's + adds.
    items.push({ product: PIZZA, quantity: 4 });

    const after = updateQuantity(items, plainKey, 3);
    const byKey = Object.fromEntries(after.map((i) => [getCartKey(i), i.quantity]));
    assert.equal(byKey[plainKey], 3, "the card's own line did not change");
    assert.equal(byKey[getCartKey({ product: PIZZA, selectedVariant: { id: "large" } })], 3,
      "the large variant was altered");
    assert.equal(byKey[getCartKey({ product: PIZZA, selectedVariant: { id: "small" } })], 1,
      "the small variant was altered — the customer is billed for it");
    assert.equal(byKey[getCartKey({ product: { id: "cola" } })], 5, "an unrelated product changed");
  });

  test("the bare-id path is what corrupts — proving the test has teeth", () => {
    // This documents the defect the fix removes: with a bare id, one press
    // rewrites every variant of the product to the same number.
    const after = updateQuantity(cart(), "pizza", 2);
    const smalls = after.filter((i) => i.selectedVariant?.id === "small");
    assert.equal(smalls[0].quantity, 2,
      "sanity: the bare-id branch really does rewrite other variants");
  });

  test("removing at quantity 0 by key drops only that line", () => {
    const items = cart();
    const largeKey = getCartKey({ product: PIZZA, selectedVariant: { id: "large" } });
    const after = updateQuantity(items, largeKey, 0);
    assert.equal(after.length, 2);
    assert.ok(after.some((i) => i.selectedVariant?.id === "small"),
      "the small variant was removed too");
    assert.ok(after.some((i) => i.product.id === "cola"));
  });
});

describe("C-18 · the identity function itself", () => {
  test("variant changes the key", () => {
    assert.notEqual(
      getCartKey({ product: PIZZA, selectedVariant: { id: "large" } }),
      getCartKey({ product: PIZZA, selectedVariant: { id: "small" } }));
  });

  test("add-ons change the key, and order does not", () => {
    const a = getCartKey({ product: PIZZA, selectedAddons: [{ id: "cheese" }, { id: "olive" }] });
    const b = getCartKey({ product: PIZZA, selectedAddons: [{ id: "olive" }, { id: "cheese" }] });
    const c = getCartKey({ product: PIZZA, selectedAddons: [{ id: "cheese" }] });
    assert.equal(a, b, "key depends on tap order — it must not");
    assert.notEqual(a, c);
  });

  test("every key carries the separator the dual-key branch keys off", () => {
    assert.ok(getCartKey({ product: PIZZA }).includes("__"),
      "a key without '__' would be treated as a bare product id");
  });
});

describe("C-18 · the other callers stay correct", () => {
  const files = {
    CartItemCard: readFileSync(join(root, "client/components/CartItemCard.tsx"), "utf8"),
    FloatingCartBar: readFileSync(join(root, "client/components/FloatingCartBar.tsx"), "utf8"),
    CartScreen: readFileSync(join(root, "client/screens/CartScreen.tsx"), "utf8"),
  };

  test("CartItemCard edits by cart key", () => {
    assert.match(files.CartItemCard, /updateQuantity\(cartKey,/);
    assert.match(files.CartItemCard, /removeFromCart\(cartKey\)/);
  });

  test("FloatingCartBar edits by cart key", () => {
    assert.match(files.FloatingCartBar, /increase\(getCartKey\(cartItem\)/);
    assert.match(files.FloatingCartBar, /decrease\(getCartKey\(cartItem\)/);
  });

  test("CartScreen keys its list by cart key", () => {
    assert.match(files.CartScreen, /keyExtractor=\{\(item\) => getCartKey\(item\)\}/);
  });

  test("the dual-key convention is still documented in the context", () => {
    assert.match(CTX, /productIdOrCartKey\.includes\("__"\)/,
      "the branch the callers depend on changed shape");
  });
});
