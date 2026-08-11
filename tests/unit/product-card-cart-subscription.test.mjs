/**
 * ProductCard cart-subscription tests (audit finding H-41).
 *
 * The finding: "ProductCard is wrapped in React.memo but its CartContext
 * subscription bypasses it. Adding one item re-renders EVERY grid card (100+),
 * and each card re-runs a linear search in the cart and favourites plus four
 * animated styles — a visible 300–500ms freeze on every + press."
 *
 * Measured, that splits into one true claim and one false attribution:
 *
 *   TRUE  — every mounted card really does re-render for one press. useCart()
 *           subscribes to a context whose value is memoised on [items, ...], so
 *           a new items array changes the value identity and React.memo, which
 *           only compares props, cannot stop it.
 *
 *   FALSE — the linear searches are not where the time goes. Benchmarked at
 *           ~0.06ms for a 200-card grid over a 25-line cart: about 0.02% of the
 *           reported freeze. The cost is React reconciling N cards, each
 *           re-registering four useAnimatedStyle worklets.
 *
 * So the fix that would matter is a memoised presentational split, and that is
 * deliberately NOT done — it moves Reanimated shared values and the measureInWindow
 * ref across a component boundary, and this repository has no React Native render
 * testing to prove the animations survive. These tests pin what IS true: the
 * duplicate scan is gone, the derivation still answers correctly, and the
 * structural trap is documented rather than mistaken for solved.
 *
 * Run:  node --test tests/unit/product-card-cart-subscription.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { stripComments } from "./_source.mjs";
// C-18: ProductCard now derives its cart line through getCartKey (the real,
// dependency-free helper), so the lifted body needs it in scope.
import { getCartKey } from "../../client/context/cartKey.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const require = createRequire(import.meta.url);
const ts = require("typescript");

const SRC = readFileSync(join(root, "client/components/ProductCard.tsx"), "utf8");
const CLEAN = stripComments(SRC);
const CART = stripComments(readFileSync(join(root, "client/context/CartContext.tsx"), "utf8"));
const FAVS = stripComments(readFileSync(join(root, "client/context/FavoritesContext.tsx"), "utf8"));

/**
 * Lift the three derivation lines out of the shipped component and run them.
 * Taking the real text means the test breaks if the logic drifts, rather than
 * quietly testing a copy.
 */
const derive = (() => {
  // C-18 moved the identity onto a cart key computed one line above cartLine, so
  // the lift starts there — otherwise `cartKey` is undefined in the slice.
  const at = CLEAN.indexOf("const cartKey = getCartKey({ product });");
  assert.ok(at > 0, "the cart derivation was renamed — this test needs updating");
  const end = CLEAN.indexOf("const isFav =", at);
  const tail = CLEAN.indexOf("\n", end);
  const body = CLEAN.slice(at, tail);
  const js = ts.transpileModule(
    `export function derive(items, isFavorite, product) {\n${body}\n` +
    `  return { isInCart, cartQuantity, isFav };\n}`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
  ).outputText;
  const exports = {};
  // eslint-disable-next-line no-new-func
  new Function("exports", "getCartKey", js)(exports, getCartKey);
  return exports.derive;
})();

const product = (id) => ({ id, name: `منتج ${id}`, vendorId: "v-1" });
const line = (id, quantity) => ({ product: product(id), quantity });

describe("H-41 · the derivation still answers correctly after the merge", () => {
  const favs = ["p-2"];
  const isFavorite = (id) => favs.includes(id);

  test("a product in the cart reports its real quantity", () => {
    const items = [line("p-1", 3), line("p-2", 1)];
    assert.deepEqual(derive(items, isFavorite, product("p-1")),
      { isInCart: true, cartQuantity: 3, isFav: false });
  });

  test("a product not in the cart reports zero, not undefined", () => {
    const items = [line("p-1", 3)];
    assert.deepEqual(derive(items, isFavorite, product("p-9")),
      { isInCart: false, cartQuantity: 0, isFav: false });
  });

  test("an empty cart is handled", () => {
    assert.deepEqual(derive([], isFavorite, product("p-1")),
      { isInCart: false, cartQuantity: 0, isFav: false });
  });

  test("favourite state is independent of cart state", () => {
    assert.deepEqual(derive([], isFavorite, product("p-2")),
      { isInCart: false, cartQuantity: 0, isFav: true });
  });

  test("a zero-quantity line still reports quantity 0", () => {
    // `|| 0` and `?? 0` differ only here, and 0 is the right answer either way.
    const items = [line("p-1", 0)];
    const r = derive(items, isFavorite, product("p-1"));
    assert.equal(r.cartQuantity, 0);
    assert.equal(r.isInCart, true, "the line exists, so the card is 'in cart'");
  });

  test("the first matching line wins, as find() has always done", () => {
    const items = [line("p-1", 2), line("p-1", 9)];
    assert.equal(derive(items, isFavorite, product("p-1")).cartQuantity, 2);
  });
});

describe("H-41 · the cart is walked once, not twice", () => {
  test("exactly one traversal per card", () => {
    let traversals = 0;
    const counting = [line("p-1", 1), line("p-2", 1)];
    // Count how many times the component's derivation iterates the cart.
    const proxied = new Proxy(counting, {
      get(target, prop, recv) {
        if (prop === "find" || prop === "some" || prop === "filter") traversals += 1;
        return Reflect.get(target, prop, recv);
      },
    });
    derive(proxied, () => false, product("p-1"));
    assert.equal(traversals, 1,
      `the cart was walked ${traversals} times for one card — the duplicate scan is back`);
  });

  test("the shipped source no longer holds the some()+find() pair", () => {
    assert.doesNotMatch(CLEAN, /items\.some\(\(item\) => item\.product\.id === product\.id\)/,
      "the redundant some() scan reappeared");
    assert.match(CLEAN, /const cartLine = items\.find\(/,
      "the single-scan derivation was replaced");
  });
});

describe("H-41 · the conditions that made the trap dangerous still hold", () => {
  // These are the premises the split was built to survive. If any of them changes,
  // the split may be solving a problem that no longer exists in that shape — or,
  // worse, be silently defeated. The behavioural proof lives in
  // tests/unit/product-card-memo-holds.test.mjs.
  test("the connected layer still subscribes to the cart context", () => {
    assert.match(CLEAN, /const \{[^}]*items[^}]*\} = useCart\(\);/,
      "the cart subscription changed shape — re-measure the finding");
  });

  test("both layers are memoised", () => {
    assert.match(CLEAN, /React\.memo\(ProductCardComponent\)/,
      "the outer memo disappeared");
    assert.match(CLEAN, /React\.memo\(ProductCardViewComponent\)/,
      "the presentational memo disappeared — cart changes reach the JSX again");
  });

  test("CartContext's value changes identity whenever items change", () => {
    // This is WHY a single-layer memo could never help: a new items array means a
    // new context value, and memo compares props, not context.
    assert.match(CART, /const value = useMemo\(/, "CartContext stopped memoising");
    const at = CART.indexOf("const value = useMemo(");
    const deps = CART.slice(at, at + 900);
    assert.match(deps, /\[\s*items,/,
      "items left the dependency list — re-measure whether consumers still re-render");
  });

  test("addToCart is still rebuilt on every cart change", () => {
    // The reason the wrapper routes handlers through a ref instead of a useCallback
    // dependency list. If this ever becomes stable, the ref is no longer required —
    // but it stays harmless, so this test only records the fact.
    const at = CART.indexOf("const addToCart = useCallback(");
    assert.ok(at > 0, "addToCart is no longer a useCallback");
    const tail = CART.slice(at, CART.indexOf("\n  );", at));
    assert.match(tail, /\[items\],?\s*$/,
      "addToCart's dependencies changed — re-check whether the latest-ref is still needed");
  });

  test("isFavorite is a linear scan bound to the favourites array", () => {
    assert.match(FAVS, /favorites\.some\(\(p\) => p\.id === productId\)/,
      "the favourites lookup changed — the cost model in the notes is stale");
  });

  test("the split is explained where someone will read it", () => {
    // Checked on the RAW source: these are comments, which CLEAN has stripped.
    const flat = SRC.replace(/\n\s*\/?\*?\s*/g, " ");
    assert.match(flat, /Everything the card DRAWS, with none of the context/,
      "the note explaining the presentational layer's contract was removed");
    assert.match(flat, /cart-connected shell/,
      "the note explaining why the wrapper still re-renders was removed");
  });
});

describe("H-41 · the scan cost is negligible — the finding's attribution was wrong", () => {
  test("a full 200-card grid scan stays far under one frame", () => {
    const items = Array.from({ length: 25 }, (_, i) => line(`p-${i}`, 1 + (i % 3)));
    const cards = Array.from({ length: 200 }, (_, i) => product(`p-${i * 3}`));
    const favs = new Set(cards.slice(0, 30).map((c) => c.id));
    const isFavorite = (id) => favs.has(id);

    for (let r = 0; r < 100; r += 1) for (const c of cards) derive(items, isFavorite, c);
    const t0 = process.hrtime.bigint();
    for (let r = 0; r < 500; r += 1) for (const c of cards) derive(items, isFavorite, c);
    const perPass = Number(process.hrtime.bigint() - t0) / 1e6 / 500;

    assert.ok(perPass < 16,
      `a grid pass costs ${perPass.toFixed(3)}ms — over one 60fps frame, so the ` +
      "finding's attribution to the linear searches would deserve revisiting");
  });
});
