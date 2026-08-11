/**
 * ProductCard memo-effectiveness tests (audit finding H-41, the real fix).
 *
 * ProductCard used to be one component that both subscribed to CartContext and
 * drew the card. React.memo around it could not help: memo compares props, and a
 * context change bypasses props entirely, so one "+" press re-rendered every
 * mounted card — measured at 100 renders for a 100-card grid where 1 is needed.
 *
 * It is now two layers:
 *
 *   ProductCardComponent   — subscribes to cart / favourites / cart-animation,
 *                            derives isInCart + cartQuantity + isFav, and hands
 *                            them down. Still re-renders on every cart change,
 *                            which is cheap and unavoidable.
 *   ProductCardView (memo) — owns the Reanimated shared values, the animated
 *                            styles, the cardRef that measureInWindow() reads,
 *                            and all the JSX. Subscribes to nothing but the theme.
 *
 * The split only pays off if EVERY prop crossing that boundary keeps its identity
 * for the cards that did not change. Two context callbacks actively work against
 * that — CartContext builds addToCart with useCallback(..., [items]) and
 * FavoritesContext derives toggleFavorite from isFavorite keyed on [favorites] —
 * so both change identity on exactly the events being absorbed. The wrapper
 * therefore routes them through a ref refreshed each render and hands down
 * callbacks created once.
 *
 * These tests execute the REAL ProductCardComponent, lifted from the shipped file
 * and transpiled, against a small React model that implements useRef/useCallback
 * and React.memo's shallow prop comparison. They count how many times the inner
 * component would render. Nothing is asserted from the source text alone.
 *
 * Run:  node --test tests/unit/product-card-memo-holds.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { stripComments } from "./_source.mjs";
import { getCartKey } from "../../client/context/cartKey.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const ts = createRequire(import.meta.url)("typescript");
const SRC = readFileSync(join(root, "client/components/ProductCard.tsx"), "utf8");
const CLEAN = stripComments(SRC);

// ─── lift the real wrapper ────────────────────────────────────────────────────
const wrapperSource = (() => {
  const at = CLEAN.indexOf("function ProductCardComponent(");
  assert.ok(at > 0, "ProductCardComponent was renamed — this test needs updating");
  const open = CLEAN.indexOf("{", CLEAN.indexOf(")", at));
  let depth = 0;
  for (let i = open; i < CLEAN.length; i += 1) {
    if (CLEAN[i] === "{") depth += 1;
    else if (CLEAN[i] === "}") {
      depth -= 1;
      if (depth === 0) return CLEAN.slice(at, i + 1);
    }
  }
  throw new Error("unbalanced ProductCardComponent");
})();

/** Compile the shipped wrapper into a callable, with every dependency injected. */
function compileWrapper() {
  const js = ts.transpileModule(
    `${wrapperSource}\nexports.ProductCardComponent = ProductCardComponent;`,
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.React,
      },
    },
  ).outputText;
  return (deps) => {
    const exports = {};
    // C-18: getCartKey is supplied centrally so every call site gets it.
    const full = { getCartKey, ...deps };
    const names = Object.keys(full);
    // eslint-disable-next-line no-new-func
    new Function("exports", ...names, js)(exports, ...names.map((n) => full[n]));
    return exports.ProductCardComponent;
  };
}
const build = compileWrapper();

// ─── a small React model: hooks per instance + memo's shallow compare ─────────
function createHost() {
  const instances = new Map();
  let current = null;

  const React = {
    createElement: (type, props) => ({ type, props }),
  };
  const useRef = (initial) => {
    const s = current.slots;
    const i = current.cursor++;
    if (s.length <= i) s[i] = { current: initial };
    return s[i];
  };
  const useCallback = (fn, deps) => {
    const s = current.slots;
    const i = current.cursor++;
    const slot = (s[i] ??= {});
    const same =
      slot.deps && slot.deps.length === deps.length &&
      slot.deps.every((d, k) => Object.is(d, deps[k]));
    if (!same) { slot.fn = fn; slot.deps = deps; }
    return slot.fn;
  };

  /** Render one card instance; returns the element the wrapper produced. */
  function render(id, Component, props) {
    const inst = instances.get(id) ?? { slots: [], lastProps: null, innerRenders: 0 };
    instances.set(id, inst);
    current = { slots: inst.slots, cursor: 0 };
    const el = Component(props);
    current = null;

    // React.memo on ProductCardView: shallow-compare the props it receives.
    const prev = inst.lastProps;
    const next = el.props;
    const bailOut =
      prev !== null &&
      Object.keys(next).length === Object.keys(prev).length &&
      Object.keys(next).every((k) => Object.is(next[k], prev[k]));
    if (!bailOut) inst.innerRenders += 1;
    inst.lastProps = next;
    return { el, bailedOut: bailOut };
  }

  return { React, useRef, useCallback, render, instances };
}

/** A cart context that mirrors the real one's identity behaviour. */
function makeCart(initialItems) {
  let items = initialItems;
  // CartContext: addToCart is useCallback(..., [items]) → new identity per change.
  let addToCart = () => {};
  const updateQuantity = () => {};        // real one is useCallback(..., [])
  return {
    useCart: () => ({ items, addToCart, updateQuantity }),
    push(line) {
      items = [...items, line];           // new array, as setItems produces
      addToCart = () => {};               // new identity, as [items] forces
    },
    setQuantity(productId, quantity) {
      items = items.map((l) =>
        l.product.id === productId ? { ...l, quantity } : l,
      );
      addToCart = () => {};
    },
  };
}

/** A favourites context whose isFavorite identity changes with the array. */
function makeFavourites(initial) {
  let favourites = initial;
  let isFavorite = (id) => favourites.includes(id);
  let toggleFavorite = () => {};
  return {
    useFavorites: () => ({ isFavorite, toggleFavorite }),
    toggle(id) {
      favourites = favourites.includes(id)
        ? favourites.filter((f) => f !== id)
        : [...favourites, id];
      isFavorite = (x) => favourites.includes(x);   // [favorites] → new identity
      toggleFavorite = () => {};
    },
  };
}

const product = (id) => ({ id, name: `منتج ${id}`, image: `img-${id}`, price: 1000 });

/**
 * Mount `n` cards, run `mutate`, re-render them all, and report how many inner
 * (memoised) components actually re-rendered.
 */
function measure({ n, mutate, initialItems = [], initialFavs = [] }) {
  const host = createHost();
  const cart = makeCart(initialItems);
  const favs = makeFavourites(initialFavs);
  let flying = 0;
  const Component = build({
    React: host.React,
    useRef: host.useRef,
    useCallback: host.useCallback,
    useCart: cart.useCart,
    useFavorites: favs.useFavorites,
    useCartAnimation: () => ({ triggerAnimation: () => { flying += 1; } }),
    resolveImageUrl: (u) => u,
    ProductCardView: "ProductCardView",
  });

  const cards = Array.from({ length: n }, (_, i) => product(`p-${i}`));
  for (const c of cards) host.render(c.id, Component, { product: c });
  const mountRenders = [...host.instances.values()].reduce((s, i) => s + i.innerRenders, 0);

  mutate(cart, favs, cards);

  for (const c of cards) host.render(c.id, Component, { product: c });
  const total = [...host.instances.values()].reduce((s, i) => s + i.innerRenders, 0);
  return { host, mountRenders, innerRerenders: total - mountRenders, flying, Component, cards };
}

// ─────────────────────────────────────────────────────────────────────────────
describe("H-41 · the model itself behaves like React.memo", () => {
  test("identical props bail out, changed props do not", () => {
    const host = createHost();
    const Fixed = () => host.React.createElement("View", { a: 1, b: "x" });
    assert.equal(host.render("k", Fixed, {}).bailedOut, false, "first render must not bail");
    assert.equal(host.render("k", Fixed, {}).bailedOut, true, "identical props must bail");

    let v = 1;
    const Changing = () => host.React.createElement("View", { a: v });
    host.render("j", Changing, {});
    v = 2;
    assert.equal(host.render("j", Changing, {}).bailedOut, false, "changed props must not bail");
  });
});

describe("H-41 · one press re-renders one card, not the grid", () => {
  for (const n of [20, 50, 100]) {
    test(`${n} cards: adding an item re-renders exactly 1 inner card`, () => {
      const r = measure({
        n,
        initialItems: [],
        mutate: (cart) => cart.push({ product: product("p-0"), quantity: 1 }),
      });
      assert.equal(r.mountRenders, n, "every card should render once on mount");
      assert.equal(r.innerRerenders, 1,
        `${r.innerRerenders} of ${n} cards re-rendered — the memo is not holding`);
    });
  }

  test("the wrapper still re-runs for every card — that is the cheap half", () => {
    const r = measure({
      n: 50,
      mutate: (cart) => cart.push({ product: product("p-0"), quantity: 1 }),
    });
    // Every instance kept hook slots, i.e. the wrapper body ran for all 50.
    assert.equal(r.host.instances.size, 50);
    assert.equal(r.innerRerenders, 1);
  });

  test("changing the quantity of one card re-renders only that card", () => {
    const r = measure({
      n: 100,
      initialItems: [{ product: product("p-7"), quantity: 1 }],
      mutate: (cart) => cart.setQuantity("p-7", 2),
    });
    assert.equal(r.innerRerenders, 1,
      `${r.innerRerenders} cards re-rendered for a single quantity change`);
  });

  test("toggling one favourite re-renders only that card", () => {
    const r = measure({
      n: 100,
      initialFavs: [],
      mutate: (_cart, favs) => favs.toggle("p-3"),
    });
    assert.equal(r.innerRerenders, 1,
      "the favourites context identity leaked into every card's props");
  });

  test("an unrelated cart change re-renders no card at all", () => {
    // A product nobody on screen shows: no card's own values move.
    const r = measure({
      n: 100,
      mutate: (cart) => cart.push({ product: product("off-screen"), quantity: 1 }),
    });
    assert.equal(r.innerRerenders, 0,
      "cards re-rendered for a cart change that did not touch any of them");
  });
});

describe("H-41 · the control: the harness DOES detect the old design", () => {
  // The shape ProductCard had before the split — one component that both reads the
  // cart and draws the card. Its element props are rebuilt every render (style
  // arrays, inline handlers), so nothing can bail out. This is a model of the old
  // code, not the old code itself; its only job is to show that the numbers above
  // come from the split working, not from a harness that always reports 1.
  function makeUnsplit(host, useCart, useFavorites) {
    return function UnsplitCard({ product: p }) {
      const { items } = useCart();
      const { isFavorite } = useFavorites();
      const line = items.find((i) => i.product.id === p.id);
      // A fresh style array and fresh handlers on every render, as JSX produces.
      return host.React.createElement("AnimatedPressable", {
        product: p,
        style: [{ card: true }],
        onPress: () => {},
        isInCart: line !== undefined,
        cartQuantity: line?.quantity || 0,
        isFav: isFavorite(p.id),
      });
    };
  }

  for (const n of [20, 100]) {
    test(`${n} cards under the OLD shape: all ${n} re-render`, () => {
      const host = createHost();
      const cart = makeCart([]);
      const favs = makeFavourites([]);
      const Unsplit = makeUnsplit(host, cart.useCart, favs.useFavorites);
      const cards = Array.from({ length: n }, (_, i) => product(`p-${i}`));

      for (const c of cards) host.render(c.id, Unsplit, { product: c });
      const mounted = [...host.instances.values()].reduce((s, i) => s + i.innerRenders, 0);
      cart.push({ product: product("p-0"), quantity: 1 });
      for (const c of cards) host.render(c.id, Unsplit, { product: c });
      const after = [...host.instances.values()].reduce((s, i) => s + i.innerRenders, 0);

      assert.equal(mounted, n);
      assert.equal(after - mounted, n,
        "the harness failed to detect the old design's fan-out, so the numbers " +
        "measured for the new one prove nothing");
    });
  }

  test("side by side: the split turns N re-renders into 1", () => {
    const n = 100;
    const host = createHost();
    const cart = makeCart([]);
    const favs = makeFavourites([]);
    const Unsplit = makeUnsplit(host, cart.useCart, favs.useFavorites);
    const cards = Array.from({ length: n }, (_, i) => product(`p-${i}`));
    for (const c of cards) host.render(c.id, Unsplit, { product: c });
    const base = [...host.instances.values()].reduce((s, i) => s + i.innerRenders, 0);
    cart.push({ product: product("p-0"), quantity: 1 });
    for (const c of cards) host.render(c.id, Unsplit, { product: c });
    const before = [...host.instances.values()].reduce((s, i) => s + i.innerRenders, 0) - base;

    const after = measure({
      n,
      mutate: (c) => c.push({ product: product("p-0"), quantity: 1 }),
    }).innerRerenders;

    assert.equal(before, n);
    assert.equal(after, 1);
    assert.ok(after < before / 50, `before=${before} after=${after}`);
  });
});

describe("H-41 · the handlers stay stable and still do the right work", () => {
  test("all four callbacks keep their identity across a cart change", () => {
    const host = createHost();
    const cart = makeCart([]);
    const favs = makeFavourites([]);
    const Component = build({
      React: host.React, useRef: host.useRef, useCallback: host.useCallback,
      useCart: cart.useCart, useFavorites: favs.useFavorites,
      useCartAnimation: () => ({ triggerAnimation: () => {} }),
      resolveImageUrl: (u) => u, ProductCardView: "ProductCardView",
    });
    const p = product("p-1");
    const first = host.render(p.id, Component, { product: p }).el.props;
    cart.push({ product: product("p-9"), quantity: 1 });
    favs.toggle("p-9");
    const second = host.render(p.id, Component, { product: p }).el.props;

    for (const key of ["onAdd", "onRemove", "onToggleFavorite", "onFlyToCart"]) {
      assert.ok(typeof first[key] === "function", `${key} is not passed down`);
      assert.equal(first[key], second[key],
        `${key} changed identity — every card would re-render`);
    }
  });

  test("onAdd adds THIS product through the newest context function", () => {
    const host = createHost();
    const added = [];
    let items = [];
    let addToCart = (p) => added.push(["stale", p.id]);
    const Component = build({
      React: host.React, useRef: host.useRef, useCallback: host.useCallback,
      useCart: () => ({ items, addToCart, updateQuantity: () => {} }),
      useFavorites: () => ({ isFavorite: () => false, toggleFavorite: () => {} }),
      useCartAnimation: () => ({ triggerAnimation: () => {} }),
      resolveImageUrl: (u) => u, ProductCardView: "ProductCardView",
    });
    const p = product("p-5");
    const el1 = host.render(p.id, Component, { product: p }).el;
    // The context hands out a NEW addToCart, as [items] guarantees it will.
    items = [...items];
    addToCart = (prod) => added.push(["fresh", prod.id]);
    host.render(p.id, Component, { product: p });

    el1.props.onAdd(); // the handle captured BEFORE the swap
    assert.deepEqual(added, [["fresh", "p-5"]],
      "the stable handler called a stale addToCart — the ref is not being refreshed");
  });

  test("onRemove decrements from the CURRENT quantity", () => {
    const host = createHost();
    const calls = [];
    let items = [{ product: product("p-2"), quantity: 1 }];
    const Component = build({
      React: host.React, useRef: host.useRef, useCallback: host.useCallback,
      useCart: () => ({
        items,
        addToCart: () => {},
        updateQuantity: (id, q) => calls.push([id, q]),
      }),
      useFavorites: () => ({ isFavorite: () => false, toggleFavorite: () => {} }),
      useCartAnimation: () => ({ triggerAnimation: () => {} }),
      resolveImageUrl: (u) => u, ProductCardView: "ProductCardView",
    });
    const p = product("p-2");
    const el = host.render(p.id, Component, { product: p }).el;
    items = [{ product: product("p-2"), quantity: 4 }];
    host.render(p.id, Component, { product: p });

    el.props.onRemove();
    // C-18: the first argument is the CART KEY of this card's own line, not the
    // bare product id — a bare id rewrites every variant of the product.
    assert.deepEqual(calls, [["p-2__base", 3]],
      "onRemove used a stale quantity or the wrong line identity");
  });

  test("onFlyToCart resolves this product's image and forwards the coordinates", () => {
    const host = createHost();
    const fired = [];
    const Component = build({
      React: host.React, useRef: host.useRef, useCallback: host.useCallback,
      useCart: () => ({ items: [], addToCart: () => {}, updateQuantity: () => {} }),
      useFavorites: () => ({ isFavorite: () => false, toggleFavorite: () => {} }),
      useCartAnimation: () => ({ triggerAnimation: (...a) => fired.push(a) }),
      resolveImageUrl: (u) => `resolved:${u}`,
      ProductCardView: "ProductCardView",
    });
    const p = product("p-8");
    const el = host.render(p.id, Component, { product: p }).el;
    el.props.onFlyToCart(120, 340);
    assert.deepEqual(fired, [["resolved:img-p-8", 120, 340]],
      "the fly-to-cart animation lost its image, or its coordinates");
  });

  test("the derived props carry the right values", () => {
    const host = createHost();
    const Component = build({
      React: host.React, useRef: host.useRef, useCallback: host.useCallback,
      useCart: () => ({
        items: [{ product: product("p-1"), quantity: 3 }],
        addToCart: () => {}, updateQuantity: () => {},
      }),
      useFavorites: () => ({ isFavorite: (id) => id === "p-1", toggleFavorite: () => {} }),
      useCartAnimation: () => ({ triggerAnimation: () => {} }),
      resolveImageUrl: (u) => u, ProductCardView: "ProductCardView",
    });
    const p = product("p-1");
    const props = host.render(p.id, Component, { product: p, width: 160 }).el.props;
    assert.equal(props.isInCart, true);
    assert.equal(props.cartQuantity, 3);
    assert.equal(props.isFav, true);
    assert.equal(props.width, 160, "width is no longer forwarded");
    assert.equal(props.product, p, "the product object identity was not forwarded");
  });
});

describe("H-41 · the animation layer stayed where it must", () => {
  const viewBody = (() => {
    const at = CLEAN.indexOf("function ProductCardViewComponent(");
    assert.ok(at > 0, "the presentational component disappeared");
    const open = CLEAN.indexOf("{", CLEAN.indexOf(")", at));
    let depth = 0;
    for (let i = open; i < CLEAN.length; i += 1) {
      if (CLEAN[i] === "{") depth += 1;
      else if (CLEAN[i] === "}") { depth -= 1; if (depth === 0) return CLEAN.slice(at, i + 1); }
    }
    throw new Error("unbalanced view");
  })();

  test("the ref and its measurement live with the JSX that owns them", () => {
    assert.match(viewBody, /const cardRef = useRef<View>\(null\)/,
      "cardRef left the component that renders ref={cardRef}");
    assert.match(viewBody, /cardRef\.current\.measureInWindow\(/);
    assert.match(viewBody, /<View ref=\{cardRef\}/,
      "the ref is no longer attached to the measured View");
  });

  test("all four shared values and animated styles are in the memoised layer", () => {
    assert.equal((viewBody.match(/useSharedValue\(1\)/g) ?? []).length, 4,
      "a Reanimated shared value moved out of the presentational component");
    assert.equal((viewBody.match(/useAnimatedStyle\(/g) ?? []).length, 4,
      "an animated style moved out of the presentational component");
  });

  test("the RTL mirroring of the fly-to-cart origin is unchanged", () => {
    assert.match(viewBody, /I18nManager\.isRTL\s*\?\s*SCREEN_WIDTH - x - width \/ 2\s*:\s*x \+ width \/ 2/,
      "the RTL start point of the fly-to-cart animation changed");
  });

  test("addToCart is still called outside the measure callback", () => {
    // It must fire whether or not the ref was ready, exactly as before.
    const measureAt = viewBody.indexOf("measureInWindow(");
    const closeAt = viewBody.indexOf("});", measureAt);
    const addAt = viewBody.indexOf("onAdd();");
    assert.ok(addAt > closeAt,
      "adding to the cart moved inside the measurement callback — it would be " +
      "skipped whenever the ref is not yet attached");
  });

  test("the presentational layer subscribes to no data context", () => {
    for (const hook of ["useCart(", "useFavorites(", "useCartAnimation("]) {
      assert.ok(!viewBody.includes(hook),
        `${hook}) is back inside the memoised component — the memo is bypassed again`);
    }
    assert.match(viewBody, /useTheme\(\)/, "the theme subscription was dropped");
  });
});
