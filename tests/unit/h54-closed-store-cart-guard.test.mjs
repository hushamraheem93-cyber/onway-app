/**
 * H-54 — a closed store must not be able to fill a cart.
 *
 * The finding said the "vacation" banner showed while the add button stayed live.
 * Half of that is wrong: GET /api/stores/:id/products never returned isOpen,
 * isVacation or isBusy, so `store.isVacation` in StoreProductsScreen was always
 * undefined — the banner could not render at all. The customer got NO warning
 * anywhere, filled a cart and an entire checkout form, and met the closure only as
 * a 400 from POST /api/orders (routes.ts, which rejects isVacation and isBusy).
 *
 * Nothing here is a text match on the fix. The tests execute:
 *   • the REAL getStoreClosure/isStoreClosed from client/lib/storeStatus.ts;
 *   • the REAL handleAdd / handleIncrease / handleDecrease / handleProductPress
 *     lifted out of StoreProductsScreen.tsx and run against a fake cart, so a
 *     guard that only lived in a `disabled` prop would not pass;
 *   • the REAL handleAdd / handleIncrease lifted out of ProductDetailScreen.tsx,
 *     the one screen reachable from there;
 *   • the REAL store objects the two endpoints build, lifted out of
 *     server/vendor.ts, so "the client can see the closure" is checked against
 *     what the server actually sends.
 *
 * Run:  node --test tests/unit/h54-closed-store-cart-guard.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import {
  getStoreClosure,
  isStoreClosed,
  CLOSURE_TITLE,
  CLOSURE_MESSAGE,
} from "../../client/lib/storeStatus.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const read = (p) => readFileSync(join(root, p), "utf8");

const STORE_SCREEN = read("client/screens/StoreProductsScreen.tsx");
const DETAIL_SCREEN = read("client/screens/ProductDetailScreen.tsx");
const VENDOR = read("server/vendor.ts");
const ROUTES = read("server/routes.ts");

// ── lifting ─────────────────────────────────────────────────────────────────
function braceBlock(src, start) {
  const open = src.indexOf("{", start);
  let d = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") d++;
    else if (src[i] === "}" && --d === 0) return src.slice(start, i + 1);
  }
  throw new Error("unbalanced braces");
}
/**
 * Lift `const NAME = …`. A declaration whose value is a block-bodied arrow is
 * brace-matched; a plain expression declaration ends at its own semicolon — the
 * naive brace match would swallow whatever block came next.
 */
const liftArrow = (src, name) => {
  const at = src.indexOf(`const ${name} = `);
  if (at === -1) return "";
  const semi = src.indexOf(";", at);
  const brace = src.indexOf("{", at);
  if (brace === -1 || semi < brace) return src.slice(at, semi + 1);
  return braceBlock(src, at) + ";";
};

/**
 * StoreProductsScreen's cart handlers, executed. `store` is whatever the endpoint
 * would have returned; the fake cart records every mutation attempt.
 */
function storeScreenHandlers(store) {
  const calls = { added: [], quantities: [], alerts: [], navigated: null };
  const names = [
    "closure", "storeClosed", "rejectBecauseClosed",
    "handleAdd", "handleIncrease", "handleDecrease", "handleProductPress",
  ];
  const body = names.map((n) => liftArrow(STORE_SCREEN, n)).filter(Boolean).join("\n");
  const js = ts.transpileModule(
    `${body}\nreturn { handleAdd, handleIncrease, handleDecrease, handleProductPress };`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;

  const env = {
    store,
    getStoreClosure,
    Haptics: { impactAsync: () => {}, notificationAsync: () => {}, ImpactFeedbackStyle: {}, NotificationFeedbackType: {} },
    Alert: { alert: (title, message) => calls.alerts.push({ title, message }) },
    CLOSURE_TITLE, CLOSURE_MESSAGE,
    addToCart: (p) => calls.added.push(p.id),
    updateQuantity: (id, q) => calls.quantities.push([id, q]),
    toCartProduct: (p) => ({ id: p.id, name: p.name, price: p.price }),
    getQuantity: () => 1,
    navigation: { navigate: (screen, params) => { calls.navigated = { screen, params }; } },
  };
  const keys = Object.keys(env);
  const api = new Function(...keys, js)(...keys.map((k) => env[k]));
  return { ...api, calls };
}

/** ProductDetailScreen's cart handlers, executed. */
function detailScreenHandlers(storeClosed) {
  const calls = { added: 0, quantities: [], alerts: [] };
  const body = ["rejectBecauseClosed", "handleAdd", "handleIncrease", "handleDecrease"]
    .map((n) => liftArrow(DETAIL_SCREEN, n)).filter(Boolean).join("\n");
  const js = ts.transpileModule(
    `${body}\nreturn { handleAdd, handleIncrease, handleDecrease };`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const env = {
    storeClosed,
    Haptics: { impactAsync: () => {}, notificationAsync: () => {}, ImpactFeedbackStyle: {}, NotificationFeedbackType: {} },
    Alert: { alert: (title, message) => calls.alerts.push({ title, message }) },
    CLOSURE_TITLE, CLOSURE_MESSAGE,
    addToCart: () => { calls.added += 1; },
    updateQuantity: (k, q) => calls.quantities.push([k, q]),
    cartProduct: { id: "p-1" },
    selectedVariant: undefined,
    selectedAddons: [],
    currentCartKey: "p-1",
    quantity: 1,
  };
  const keys = Object.keys(env);
  const api = new Function(...keys, js)(...keys.map((k) => env[k]));
  return { ...api, calls };
}

/** The store object GET /api/stores/:id/products builds, executed. */
function storeDetailPayload(vendorDoc) {
  const at = VENDOR.indexOf("    const store = {");
  assert.notEqual(at, -1, "the store object moved in server/vendor.ts");
  const js = ts.transpileModule(`${braceBlock(VENDOR, at + 4)}\nreturn store;`
    .replace("const store = {", "const store = {"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function("storeData", `const store = ${braceBlock(VENDOR, VENDOR.indexOf("{", at))}; return store;`)(vendorDoc);
}

const PRODUCT = { id: "p-1", name: "برغر", price: 10000, stock: 5, vendorId: "v-1" };
const OPEN = { id: "v-1", storeName: "متجر", isOpen: true };

// ═════════════════════════════════════════════════════════════════════════════
describe("H-54 · the API now tells the client the store is closed", () => {
  test("GET /api/stores/:id/products returns the three flags", () => {
    const s = storeDetailPayload({ id: "v-1", storeName: "م", isVacation: true });
    assert.equal(s.isVacation, true);
    assert.equal("isBusy" in s, true);
    assert.equal("isOpen" in s, true);
  });

  test("a vendor doc with no flags still reads as open", () => {
    const s = storeDetailPayload({ id: "v-1", storeName: "م" });
    assert.equal(s.isOpen, true);
    assert.equal(s.isVacation, false);
    assert.equal(s.isBusy, false);
    assert.equal(isStoreClosed(s), false, "an ordinary store became closed");
  });

  test("GET /api/stores carries the two flags the server rejects on", () => {
    const at = VENDOR.indexOf("isOpen: v.isOpen ?? true,");
    const near = VENDOR.slice(at, at + 400);
    assert.match(near, /isVacation: v\.isVacation === true/);
    assert.match(near, /isBusy: v\.isBusy === true/);
  });

  test("the client predicate matches the server's rejection rules", () => {
    // routes.ts rejects on isVacation then isBusy, in that order.
    const gate = ROUTES.slice(ROUTES.indexOf("Vendor availability check"), ROUTES.indexOf("Vendor availability check") + 900);
    assert.match(gate, /if \(vAvail\.isVacation\)/);
    assert.match(gate, /if \(vAvail\.isBusy\)/);
    assert.equal(getStoreClosure({ isVacation: true, isBusy: true }), "vacation");
    assert.equal(getStoreClosure({ isBusy: true }), "busy");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-54 · A — an open store is untouched", () => {
  test("add works", () => {
    const h = storeScreenHandlers(OPEN);
    h.handleAdd(PRODUCT);
    assert.deepEqual(h.calls.added, ["p-1"]);
    assert.deepEqual(h.calls.alerts, []);
  });

  test("increase works", () => {
    const h = storeScreenHandlers(OPEN);
    h.handleIncrease(PRODUCT);
    assert.deepEqual(h.calls.quantities, [["p-1", 2]]);
  });

  for (const [label, store] of [
    ["isOpen omitted", { id: "v-1" }],
    ["all flags false", { id: "v-1", isOpen: true, isVacation: false, isBusy: false }],
    ["no store loaded yet", undefined],
  ]) {
    test(`${label} → still addable`, () => {
      const h = storeScreenHandlers(store);
      h.handleAdd(PRODUCT);
      assert.deepEqual(h.calls.added, ["p-1"]);
    });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-54 · B/C — closed and vacation block every add path", () => {
  const CLOSURES = [
    ["vacation", { id: "v-1", isVacation: true }],
    ["busy", { id: "v-1", isBusy: true }],
    ["closed", { id: "v-1", isOpen: false }],
  ];

  for (const [label, store] of CLOSURES) {
    test(`${label}: handleAdd adds nothing and says why`, () => {
      const h = storeScreenHandlers(store);
      h.handleAdd(PRODUCT);
      assert.deepEqual(h.calls.added, [], "a product entered the cart from a closed store");
      assert.equal(h.calls.alerts.length, 1);
      assert.equal(h.calls.alerts[0].message, CLOSURE_MESSAGE[label]);
    });

    test(`${label}: handleIncrease cannot grow the cart either`, () => {
      const h = storeScreenHandlers(store);
      h.handleIncrease(PRODUCT);
      assert.deepEqual(h.calls.quantities, [], "the quantity was increased anyway");
    });

    test(`${label}: handleDecrease STILL works — a cart must remain emptiable`, () => {
      const h = storeScreenHandlers(store);
      h.handleDecrease(PRODUCT);
      assert.deepEqual(h.calls.quantities, [["p-1", 0]]);
    });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-54 · D — the guard is in the handler, not the button", () => {
  test("calling the callback directly is still refused", () => {
    // Nothing here renders a button; the handler is invoked straight from the
    // lifted source, so a `disabled` prop cannot be what stops it.
    const h = storeScreenHandlers({ id: "v-1", isVacation: true });
    h.handleAdd(PRODUCT);
    h.handleAdd(PRODUCT);
    h.handleIncrease(PRODUCT);
    assert.deepEqual(h.calls.added, []);
    assert.deepEqual(h.calls.quantities, []);
  });

  test("the product-detail route is the only other add path, and carries the closure", () => {
    const navigations = [
      ...STORE_SCREEN.matchAll(/navigation\.navigate\("ProductDetail"[^)]*\)/g),
    ].map((m) => m[0]);
    assert.equal(navigations.length, 1, "a second route into ProductDetail appeared");
    assert.match(navigations[0], /storeClosed/);

    const h = storeScreenHandlers({ id: "v-1", isBusy: true });
    h.handleProductPress(PRODUCT);
    assert.equal(h.calls.navigated.params.storeClosed, true,
      "the detail screen would not know the store is closed");
  });

  test("ProductDetailScreen refuses to add when the store is closed", () => {
    const h = detailScreenHandlers(true);
    h.handleAdd();
    h.handleIncrease();
    assert.equal(h.calls.added, 0, "the detail screen bypassed the closed-store guard");
    assert.deepEqual(h.calls.quantities, []);
    assert.equal(h.calls.alerts.length, 2);
  });

  test("ProductDetailScreen is unchanged for an open store", () => {
    const h = detailScreenHandlers(false);
    h.handleAdd();
    h.handleIncrease();
    assert.equal(h.calls.added, 1);
    assert.deepEqual(h.calls.quantities, [["p-1", 2]]);
    assert.deepEqual(h.calls.alerts, []);
  });

  test("no other screen navigates into ProductDetail", () => {
    for (const f of ["client/screens/HomeScreen.tsx", "client/screens/SearchScreen.tsx",
                     "client/screens/ProductsScreen.tsx", "client/screens/OrdersScreen.tsx"]) {
      assert.doesNotMatch(read(f), /navigate\("ProductDetail"/,
        `${f} opens ProductDetail without a closure flag`);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-54 · E — an existing cart is never silently discarded", () => {
  const CART = read("client/screens/CartScreen.tsx");
  const CHECKOUT = read("client/screens/CheckoutScreen.tsx");

  test("CartScreen blocks checkout when the cart's store has closed", () => {
    const at = CART.indexOf("const handleCheckout");
    const body = braceBlock(CART, at);
    assert.match(body, /if \(cartVendorClosure\)/);
    assert.match(body, /return;/);
  });

  test("…and does NOT clear the cart to do it", () => {
    const at = CART.indexOf("const handleCheckout");
    assert.doesNotMatch(braceBlock(CART, at), /clearCart\(\)/,
      "the cart is being emptied when the store closes");
  });

  test("the customer is told the cart is kept", () => {
    assert.match(CART, /سلتك محفوظة/);
  });

  test("CheckoutScreen refuses to submit, before any request goes out", () => {
    const at = CHECKOUT.indexOf("const handleSubmit");
    const body = braceBlock(CHECKOUT, at);
    const closureAt = body.indexOf("checkoutClosure");
    const submitAt = body.indexOf("submitOrderPayload");
    assert.ok(closureAt !== -1, "the checkout gate is gone");
    assert.ok(closureAt < submitAt, "the gate runs after the order is already sent");
  });

  test("closure is derived from the live store list, not a stale copy", () => {
    assert.match(CART, /getStoreClosure\(\s*cartVendorId \? allStores\.find/);
    assert.match(CHECKOUT, /getStoreClosure\(cartVendorData \?\? null\)/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-54 · F — reopening restores adding, with no restart", () => {
  test("the same handlers add again once the flags clear", () => {
    const closed = storeScreenHandlers({ id: "v-1", isVacation: true });
    closed.handleAdd(PRODUCT);
    assert.deepEqual(closed.calls.added, []);

    // The screen re-derives the closure from the query's store object on every
    // render, so a refetch that clears the flag is all it takes.
    const reopened = storeScreenHandlers({ id: "v-1", isVacation: false, isOpen: true });
    reopened.handleAdd(PRODUCT);
    assert.deepEqual(reopened.calls.added, ["p-1"]);
  });

  test("the closure is computed from the query result, not held in state", () => {
    assert.match(STORE_SCREEN, /const closure = getStoreClosure\(store\);/);
    assert.doesNotMatch(STORE_SCREEN, /useState[^\n]*storeClosed/,
      "the closure was frozen into state and would survive a reopen");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-54 · G — the server stays the final authority", () => {
  test("POST /api/orders still rejects both flags", () => {
    assert.match(ROUTES, /if \(vAvail\.isVacation\) \{\s*return res\.status\(400\)/);
    assert.match(ROUTES, /if \(vAvail\.isBusy\) \{\s*return res\.status\(400\)/);
  });

  test("the client fix does not bypass or weaken that check", () => {
    const gate = ROUTES.slice(ROUTES.indexOf("Vendor availability check"));
    assert.doesNotMatch(gate.slice(0, 900), /\/\/\s*(skip|disabled)/i);
  });

  test("a rejection after the store closes mid-flow keeps the cart", () => {
    const CHECKOUT = read("client/screens/CheckoutScreen.tsx");
    const at = CHECKOUT.indexOf("const submitOrderPayload");
    const body = braceBlock(CHECKOUT, at);
    // clearCart() must only be reachable on the success path.
    const clearAt = body.indexOf("clearCart()");
    const catchAt = body.indexOf("catch");
    assert.ok(clearAt !== -1 && clearAt < catchAt,
      "the cart is cleared on a path that a server rejection can reach");
    assert.match(body, /setError\(\{/, "the server's reason is not surfaced");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-54 · H — closing one store does not affect another", () => {
  test("store B still accepts adds while store A is on vacation", () => {
    const a = storeScreenHandlers({ id: "v-A", isVacation: true });
    a.handleAdd({ ...PRODUCT, id: "a-1" });
    assert.deepEqual(a.calls.added, []);

    const b = storeScreenHandlers({ id: "v-B", isOpen: true });
    b.handleAdd({ ...PRODUCT, id: "b-1" });
    assert.deepEqual(b.calls.added, ["b-1"], "an unrelated store was blocked too");
  });

  test("the cart gate keys on the cart's own vendor", () => {
    const CART = read("client/screens/CartScreen.tsx");
    assert.match(CART, /allStores\.find\(\(s: any\) => s\.id === cartVendorId\)/);
  });

  test("closure is per-store data, never a global flag", () => {
    assert.equal(getStoreClosure({ id: "v-A", isVacation: true }), "vacation");
    assert.equal(getStoreClosure({ id: "v-B" }), null);
  });
});
