/**
 * H-53 — a reorder must be built from the live products, not the old receipt.
 *
 * OrdersScreen rebuilt the cart out of the order document: `price: item.price`
 * (what the customer paid then), `inStock: true` asserted rather than checked,
 * and the line's variant/addons dropped although the order carries them. The
 * server re-prices every line against the live product and rejects the order when
 * the client's figure is off by more than 1 IQD — so a reorder of anything whose
 * price had moved died in the cart on "أسعار بعض المنتجات تغيّرت", naming no
 * product and offering no way out. A delisted or out-of-stock product reached the
 * cart the same way and failed the same way.
 *
 * Two layers are executed here, no reimplementation of either:
 *   • the REAL planReorder() from client/lib/reorder.ts, and
 *   • the REAL handleReorder/fetchCurrentProducts lifted out of OrdersScreen.tsx
 *     and run against a fake fetch/Alert/cart, so the screen's own flow is what
 *     the scenarios exercise.
 * The price-mismatch rule the server applies is lifted from server/routes.ts and
 * evaluated, so "the server would accept this" is checked with the server's own
 * comparison rather than an assumed tolerance.
 *
 * Run:  node --test tests/unit/h53-reorder-live-products.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import {
  planReorder,
  isProductAvailable,
  EXCLUSION_TEXT,
} from "../../client/lib/reorder.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const read = (p) => readFileSync(join(root, p), "utf8");

const SCREEN = read("client/screens/OrdersScreen.tsx");
const ROUTES = read("server/routes.ts");

// ── the server's own price-mismatch rule, lifted and executed ────────────────
const serverRejectsPrice = (() => {
  const m = ROUTES.match(
    /if \(Math\.abs\(\(Number\(it\.price\) \|\| 0\) - realPrice\) > (\d+)\)/,
  );
  assert.ok(m, "the price-mismatch check moved in server/routes.ts");
  const tolerance = Number(m[1]);
  return (clientPrice, realPrice) =>
    Math.abs((Number(clientPrice) || 0) - realPrice) > tolerance;
})();

// ── the screen's own flow, lifted and executed ───────────────────────────────
// Lifted by AST rather than by brace matching: H-82 wrapped these two in
// `useCallback(fn, deps)`, and counting braces from `const name = ` stops at the
// arrow body and drops the `, [deps])` tail. The function itself is unchanged —
// this unwraps the memo call and takes the same arrow it always took, so the tests
// below still drive the REAL handler. Memoisation is H-82's subject, not this
// file's.
const screenSf = ts.createSourceFile(
  "OrdersScreen.tsx",
  SCREEN,
  ts.ScriptTarget.ES2022,
  true,
  ts.ScriptKind.TSX,
);

function liftArrow(name) {
  let decl = null;
  const walk = (n) => {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.name.text === name
    )
      decl = n;
    ts.forEachChild(n, walk);
  };
  walk(screenSf);
  if (!decl) return "";

  let init = decl.initializer;
  if (
    ts.isCallExpression(init) &&
    ts.isIdentifier(init.expression) &&
    init.expression.text === "useCallback"
  ) {
    init = init.arguments[0];
  }
  return `const ${name} = ${init.getText(screenSf)};`;
}

const SCREEN_JS = ts.transpileModule(
  `${liftArrow("fetchCurrentProducts")}\n${liftArrow("handleReorder")}\nreturn handleReorder;`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

/**
 * Drive OrdersScreen.handleReorder for one order against one live catalogue.
 * `confirm` decides which button a shown dialog "receives".
 */
async function runScreenReorder(
  order,
  products,
  { confirm = true, fetchFails = false } = {},
) {
  const seen = { cart: null, navigated: null, alerts: [], urls: [] };

  const env = {
    order,
    isReordering: null,
    setIsReordering: () => {},
    getApiUrl: () => "https://onwayiq.com",
    fetch: async (url) => {
      seen.urls.push(String(url));
      if (fetchFails) return { ok: false, json: async () => ({}) };
      // /api/stores/:id/products answers { store, products }, /api/products an array.
      const body = String(url).includes("/api/stores/")
        ? { products }
        : products;
      return { ok: true, json: async () => body };
    },
    Alert: {
      alert: (title, message, buttons) => {
        seen.alerts.push({ title, message, buttons });
        if (!buttons) return;
        const btn = confirm
          ? buttons.find((b) => b.text === "متابعة")
          : buttons.find((b) => b.style === "cancel");
        btn?.onPress?.();
      },
    },
    planReorder,
    EXCLUSION_TEXT,
    replaceCart: (items) => {
      seen.cart = items;
    },
    navigation: {
      navigate: (screen) => {
        seen.navigated = screen;
      },
    },
  };

  const keys = Object.keys(env);
  const handleReorder = new Function(...keys, SCREEN_JS)(
    ...keys.map((k) => env[k]),
  );
  await handleReorder(order);
  return seen;
}

// ── fixtures ────────────────────────────────────────────────────────────────
const VENDOR = "vendor-1";
const order = (items) => ({ id: "o-1", vendorId: VENDOR, items });
const line = (over = {}) => ({
  productId: "p-1",
  name: "برغر",
  price: 10000,
  quantity: 2,
  image: "old.jpg",
  ...over,
});
const live = (over = {}) => ({
  id: "p-1",
  name: "برغر",
  price: 10000,
  imageUrl: "new.jpg",
  description: "لحم",
  stock: 5,
  vendorId: VENDOR,
  storeName: "مطعم الضلوعية",
  ...over,
});

const unitPrice = (cartItem) => cartItem.product.price;

// ═════════════════════════════════════════════════════════════════════════════
describe("H-53 · A — unchanged product reorders cleanly", () => {
  test("it lands in the cart at the live price and quantity", async () => {
    const r = await runScreenReorder(order([line()]), [live()]);
    assert.equal(r.cart?.length, 1);
    assert.equal(unitPrice(r.cart[0]), 10000);
    assert.equal(r.cart[0].quantity, 2);
    assert.equal(r.navigated, "Cart");
  });

  test("no dialog is shown when nothing changed", async () => {
    const r = await runScreenReorder(order([line()]), [live()]);
    assert.deepEqual(r.alerts, []);
  });

  test("it takes the store's live catalogue, not the order document", async () => {
    const r = await runScreenReorder(order([line()]), [live()]);
    assert.ok(
      r.urls.some((u) => u.includes(`/api/stores/${VENDOR}/products`)),
      `no live product fetch happened (urls: ${r.urls.join(", ") || "none"})`,
    );
  });

  test("live name and image replace the historical ones", async () => {
    const r = await runScreenReorder(
      order([line({ name: "برغر قديم", image: "old.jpg" })]),
      [live({ name: "برغر كلاسيك", imageUrl: "new.jpg" })],
    );
    assert.equal(r.cart[0].product.name, "برغر كلاسيك");
    assert.equal(r.cart[0].product.image, "new.jpg");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-53 · B — a changed price is never replayed", () => {
  test("the cart carries the CURRENT price, not the paid one", async () => {
    const r = await runScreenReorder(order([line({ price: 10000 })]), [
      live({ price: 13500 }),
    ]);
    assert.equal(
      unitPrice(r.cart[0]),
      13500,
      "the historical price reached the cart — the server would reject this order",
    );
    assert.notEqual(unitPrice(r.cart[0]), 10000);
  });

  test("the server's own rule would ACCEPT what the cart now holds", async () => {
    const r = await runScreenReorder(order([line({ price: 10000 })]), [
      live({ price: 13500 }),
    ]);
    assert.equal(
      serverRejectsPrice(unitPrice(r.cart[0]), 13500),
      false,
      "the order would still fail with أسعار بعض المنتجات تغيّرت",
    );
  });

  test("…and would REJECT what the old flow sent, which is the finding", () => {
    // The pre-fix screen put item.price (10000) in the cart while the live price is 13500.
    assert.equal(serverRejectsPrice(10000, 13500), true);
  });

  test("the customer is told which product moved, and by how much", async () => {
    const r = await runScreenReorder(order([line({ price: 10000 })]), [
      live({ price: 13500 }),
    ]);
    assert.equal(r.alerts.length, 1);
    assert.match(r.alerts[0].message, /10000/);
    assert.match(r.alerts[0].message, /13500/);
    assert.match(r.alerts[0].message, /برغر/);
  });

  test("the cart is only replaced after the customer continues", async () => {
    const declined = await runScreenReorder(
      order([line({ price: 10000 })]),
      [live({ price: 13500 })],
      { confirm: false },
    );
    assert.equal(declined.cart, null, "the cart was replaced without consent");
    assert.equal(declined.navigated, null);
  });

  test("a price move within the server's tolerance is not flagged", async () => {
    const plan = planReorder(order([line({ price: 10000 })]), [
      live({ price: 10000 }),
    ]);
    assert.deepEqual(plan.priceChanges, []);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-53 · C — an out-of-stock product never enters the cart", () => {
  for (const [label, over] of [
    ["stock: 0", { stock: 0 }],
    ["inStock: false", { inStock: false, stock: undefined }],
  ]) {
    test(`${label} → excluded and named`, async () => {
      const r = await runScreenReorder(
        order([line(), line({ productId: "p-2", name: "بيتزا" })]),
        [live(over), live({ id: "p-2", name: "بيتزا" })],
      );
      const ids = r.cart.map((i) => i.product.id);
      assert.deepEqual(ids, ["p-2"], "an unavailable product reached the cart");
      assert.match(r.alerts[0].message, /برغر/);
      assert.match(
        r.alerts[0].message,
        new RegExp(EXCLUSION_TEXT.out_of_stock),
      );
    });
  }

  test("availability follows the app's own rule", () => {
    assert.equal(isProductAvailable({ id: "x", stock: 3 }), true);
    assert.equal(isProductAvailable({ id: "x", stock: 0 }), false);
    assert.equal(isProductAvailable({ id: "x", inStock: false }), false);
    assert.equal(
      isProductAvailable({ id: "x", inStock: false, stock: 9 }),
      false,
    );
    assert.equal(isProductAvailable({ id: "x" }), true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-53 · D/E — lines with options are handled explicitly", () => {
  for (const [label, over] of [
    ["a selected variant", { selectedVariantId: "v-large" }],
    ["a variant name only", { variantName: "كبير" }],
    ["addons", { selectedAddons: [{ id: "a-1", name: "جبن", price: 500 }] }],
  ]) {
    test(`${label} → excluded, and the stale ids are NOT sent`, async () => {
      const r = await runScreenReorder(order([line(over)]), [live()]);
      assert.equal(
        r.cart,
        null,
        "a line whose options cannot be verified was added anyway",
      );
      assert.match(
        r.alerts[0].message,
        new RegExp(EXCLUSION_TEXT.needs_options),
      );
    });
  }

  test("no historical variant or addon id survives into the cart", async () => {
    const plan = planReorder(
      order([
        line({
          selectedVariantId: "v-gone",
          selectedAddons: [{ id: "a-gone", name: "x", price: 1 }],
        }),
        line({ productId: "p-2", name: "عصير" }),
      ]),
      [live(), live({ id: "p-2", name: "عصير" })],
    );
    for (const item of plan.items) {
      assert.equal(item.selectedVariant, undefined);
      assert.equal(item.selectedAddons, undefined);
    }
    assert.equal(plan.items.length, 1);
    assert.equal(plan.excluded[0].reason, "needs_options");
  });

  test("a plain line beside an option line still reorders", async () => {
    const r = await runScreenReorder(
      order([
        line({ selectedVariantId: "v-1" }),
        line({ productId: "p-2", name: "عصير" }),
      ]),
      [live(), live({ id: "p-2", name: "عصير" })],
    );
    assert.deepEqual(
      r.cart.map((i) => i.product.id),
      ["p-2"],
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-53 · F — a deleted product neither crashes nor slips through", () => {
  test("it is excluded with a reason", async () => {
    const r = await runScreenReorder(
      order([line({ productId: "gone", name: "منتج محذوف" })]),
      [live()],
    );
    assert.equal(r.cart, null);
    assert.match(r.alerts[0].message, /منتج محذوف/);
    assert.match(r.alerts[0].message, new RegExp(EXCLUSION_TEXT.missing));
  });

  test("an empty catalogue does not throw", async () => {
    const r = await runScreenReorder(order([line()]), []);
    assert.equal(r.cart, null);
    assert.equal(r.alerts.length, 1);
  });

  test("a failed fetch leaves the cart alone and says so", async () => {
    const r = await runScreenReorder(order([line()]), [live()], {
      fetchFails: true,
    });
    assert.equal(r.cart, null);
    assert.equal(r.navigated, null);
    assert.equal(r.alerts.length, 1);
    assert.match(r.alerts[0].title, /تعذّر/);
  });

  test("malformed order items do not throw", () => {
    for (const bad of [
      [],
      [{}],
      [{ productId: "p-1" }],
      [{ productId: "p-1", quantity: -3 }],
    ]) {
      assert.doesNotThrow(() =>
        planReorder({ items: bad, vendorId: VENDOR }, [live()]),
      );
    }
    const plan = planReorder(
      { items: [{ productId: "p-1", quantity: -3 }], vendorId: VENDOR },
      [live()],
    );
    assert.equal(
      plan.items[0].quantity,
      1,
      "a negative quantity survived into the cart",
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-53 · G — a mixed reorder partially succeeds, and explains itself", () => {
  const mixed = order([
    line({ productId: "ok", name: "سليم", price: 5000 }),
    line({ productId: "moved", name: "تغيّر سعره", price: 8000 }),
    line({ productId: "empty", name: "نفد" }),
    line({ productId: "gone", name: "محذوف" }),
    line({ productId: "opts", name: "بخيارات", selectedVariantId: "v-1" }),
  ]);
  const catalogue = [
    live({ id: "ok", name: "سليم", price: 5000 }),
    live({ id: "moved", name: "تغيّر سعره", price: 9500 }),
    live({ id: "empty", name: "نفد", stock: 0 }),
    live({ id: "opts", name: "بخيارات" }),
  ];

  test("the good lines still make it", async () => {
    const r = await runScreenReorder(mixed, catalogue);
    assert.deepEqual(r.cart.map((i) => i.product.id).sort(), ["moved", "ok"]);
  });

  test("the whole operation does not fail because some lines did", async () => {
    const r = await runScreenReorder(mixed, catalogue);
    assert.equal(r.navigated, "Cart");
  });

  test("every excluded line is named with its own reason", async () => {
    const r = await runScreenReorder(mixed, catalogue);
    const msg = r.alerts[0].message;
    assert.match(msg, /نفد/);
    assert.match(msg, /محذوف/);
    assert.match(msg, /بخيارات/);
    assert.match(msg, new RegExp(EXCLUSION_TEXT.out_of_stock));
    assert.match(msg, new RegExp(EXCLUSION_TEXT.missing));
    assert.match(msg, new RegExp(EXCLUSION_TEXT.needs_options));
  });

  test("the price move is reported too", async () => {
    const r = await runScreenReorder(mixed, catalogue);
    assert.match(r.alerts[0].message, /8000/);
    assert.match(r.alerts[0].message, /9500/);
  });

  test("every line that made it would pass the server's price check", async () => {
    const r = await runScreenReorder(mixed, catalogue);
    for (const item of r.cart) {
      const liveP = catalogue.find((p) => p.id === item.product.id);
      assert.equal(
        serverRejectsPrice(unitPrice(item), liveP.price),
        false,
        `${item.product.id} would be rejected by the server`,
      );
    }
  });

  test("declining leaves the previous cart untouched", async () => {
    const r = await runScreenReorder(mixed, catalogue, { confirm: false });
    assert.equal(r.cart, null);
    assert.equal(r.navigated, null);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-53 · the historical shortcuts are gone from the screen", () => {
  const code = SCREEN.replace(/\/\/[^\n]*/g, "").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );

  test("no line is built with an asserted inStock", () => {
    assert.doesNotMatch(
      code,
      /inStock:\s*true/,
      "the screen asserts availability again instead of checking it",
    );
  });

  test("the historical price is not read into a cart product", () => {
    assert.doesNotMatch(
      code,
      /price:\s*item\.price/,
      "the paid price is being replayed again",
    );
  });

  test("the screen delegates to the shared planner", () => {
    assert.match(SCREEN, /from "@\/lib\/reorder"/);
    assert.match(
      code,
      /planReorder\(order, await fetchCurrentProducts\(order\)\)/,
    );
  });

  test("the server still verifies price and stock — the client is not the only guard", () => {
    assert.match(ROUTES, /priceMismatchProductIds\.push\(it\.productId\)/);
    assert.match(
      ROUTES,
      /outOfStockNames\.push\(it\.name \|\| it\.productId\)/,
    );
    assert.match(ROUTES, /unknownProductIds\.push\(it\.productId\)/);
  });
});
