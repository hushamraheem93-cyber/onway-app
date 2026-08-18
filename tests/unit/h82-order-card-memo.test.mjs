/**
 * H-82 — the order cards re-rendered on every poll because React.memo could never
 * bail out.
 *
 * Measured on HEAD before the fix, by lifting the real handler and renderItem
 * declarations out of OrdersScreen.tsx, running two consecutive renders of the
 * component body and applying React.memo's actual default comparison (Object.is,
 * per prop) to the props OrderCard received — for the SAME order object:
 *
 *     stable   order
 *     CHANGED  onPress
 *     CHANGED  onStorePress
 *     CHANGED  onRate
 *     CHANGED  onReorder
 *     props with a new identity per render: 4/5
 *
 * Four inline functions, exactly as reported. But the probe also showed the other
 * half of the mechanism: OrderContext did `setOrders(data)` with the raw payload of
 * a fetch that runs every ten seconds, so `order` ITSELF was a new object on every
 * poll. Fixing only the callbacks would have left React.memo just as unable to
 * skip a render, and the change would have measured as nothing. Both are fixed:
 *
 *   • the callbacks are `useCallback`s with their real dependencies, and the two
 *     that needed the row's order now take it as an argument instead of closing
 *     over it (client/components/OrderCard.tsx);
 *   • an unchanged order keeps its object across a poll
 *     (client/lib/orderIdentity.ts, used by OrderContext.refreshOrders).
 *
 * Everything below runs the real code: the handlers and renderItem are lifted from
 * the .tsx by AST and executed against a hook runtime that implements useCallback's
 * actual dependency rule, and reconcileOrders is the shipped module.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, "../../", p), "utf8");

const SCREEN = read("client/screens/OrdersScreen.tsx");
const CARD = read("client/components/OrderCard.tsx");
const CTX = read("client/context/OrderContext.tsx");
const IDENTITY = read("client/lib/orderIdentity.ts");

const screenSf = ts.createSourceFile(
  "OrdersScreen.tsx",
  SCREEN,
  ts.ScriptTarget.ES2022,
  true,
  ts.ScriptKind.TSX,
);

// ── lift the real declarations ───────────────────────────────────────────────
function declStatement(name) {
  let out = null;
  const walk = (n) => {
    if (
      ts.isVariableStatement(n) &&
      n.declarationList.declarations.some(
        (d) => ts.isIdentifier(d.name) && d.name.text === name,
      )
    ) {
      out = n;
      return;
    }
    ts.forEachChild(n, walk);
  };
  walk(screenSf);
  assert.ok(out, `declaration \`${name}\` not found in OrdersScreen.tsx`);
  return out;
}

const HANDLERS = [
  "handleRate",
  "fetchCurrentProducts",
  "handleReorder",
  "handleOpenOrder",
  "handleStorePress",
  "renderItem",
];

const oneRender = (() => {
  const body = HANDLERS.map((n) => declStatement(n).getText(screenSf)).join(
    "\n",
  );
  const src = `
function oneRender(env) {
  const { customerToken, refreshOrders, navigation, replaceCart, isReordering,
          setIsReordering, planReorder, EXCLUSION_TEXT, getApiUrl, Alert,
          fetch, OrderCard, useCallback, useMemo } = env;
${body}
  return { ${HANDLERS.join(", ")} };
}
return oneRender;
`;
  const js = ts.transpileModule(src, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React,
      jsxFactory: "h",
    },
  }).outputText;
  const h = (type, props) => ({ type, props: props || {} });
  return new Function("h", js)(h);
})();

// ── the shipped identity module ──────────────────────────────────────────────
const { reconcileOrders, jsonEqual } = (() => {
  const js = ts.transpileModule(IDENTITY.replace(/\bexport\s+/g, ""), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function(`${js}\nreturn { reconcileOrders, jsonEqual };`)();
})();

// ── React's real hook rules, and a control that has none ─────────────────────
const sameDeps = (a, b) =>
  !!a && !!b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));

/**
 * A component instance. `memoizing: false` is the negative control: identical
 * hook call sites, no dependency memoisation — what the code did before the fix.
 */
function instance({ memoizing = true } = {}) {
  const slots = [];
  let cursor = 0;
  const hook = (compute) => (fn, deps) => {
    const i = cursor++;
    const prev = slots[i];
    if (memoizing && prev && sameDeps(prev.deps, deps)) return prev.value;
    const value = compute(fn);
    slots[i] = { value, deps };
    return value;
  };
  return (env) => {
    cursor = 0;
    return oneRender({
      ...env,
      useCallback: hook((fn) => fn),
      useMemo: hook((fn) => fn()),
    });
  };
}

const baseEnv = () => ({
  customerToken: "tok",
  refreshOrders: () => {},
  navigation: { navigate: () => {} },
  replaceCart: () => {},
  isReordering: null,
  setIsReordering: () => {},
  planReorder: () => ({ items: [], excluded: [], priceChanges: [] }),
  EXCLUSION_TEXT: {},
  getApiUrl: () => "http://example.invalid",
  Alert: { alert: () => {} },
  fetch: async () => ({ ok: true, json: async () => [] }),
  OrderCard: "OrderCard",
});

const mkOrder = (id, extra = {}) => ({
  id,
  status: "delivered",
  vendorId: "v-1",
  vendorName: "متجر الضلوعية",
  items: [
    { productId: "p-1", name: "خبز", price: 1000, quantity: 1, image: "x" },
  ],
  total: 12_000,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...extra,
});

/** React.memo's default comparison. */
function memoWouldSkip(prevProps, nextProps) {
  const keys = new Set([...Object.keys(prevProps), ...Object.keys(nextProps)]);
  for (const k of keys)
    if (!Object.is(prevProps[k], nextProps[k])) return false;
  return true;
}
const propsFor = (renderItem, order) => renderItem({ item: order }).props;

// ═══════════════════════════════════════════════════════════════════════════
describe("H-82 (A) — the memo boundary is still there", () => {
  test("OrderCard is exported through React.memo", () => {
    assert.match(
      CARD,
      /export const OrderCard = React\.memo\(OrderCardComponent\);/,
      "removing the memo would make every fix below pointless",
    );
  });

  test("no custom comparator was slipped in to fake a bail-out", () => {
    // A hand-written `areEqual` that ignores a prop would hide real changes —
    // a stale card is worse than a re-rendered one.
    assert.doesNotMatch(CARD, /React\.memo\(\s*OrderCardComponent\s*,/);
  });

  test("the row's navigation handlers take the order instead of closing over it", () => {
    assert.match(CARD, /onPress\?: \(order: Order\) => void;/);
    assert.match(CARD, /onStorePress\?: \(order: Order\) => void;/);
  });
});

describe("H-82 (B) — every prop the card receives is stable across a render", () => {
  test("two renders of the same component produce identical props", () => {
    const render = instance();
    const env = baseEnv();
    const order = mkOrder("o-1");

    const a = propsFor(render(env).renderItem, order);
    const b = propsFor(render(env).renderItem, order);

    const churned = Object.keys({ ...a, ...b }).filter(
      (k) => !Object.is(a[k], b[k]),
    );
    assert.deepEqual(
      churned,
      [],
      `props with a new identity: ${churned.join(", ")}`,
    );
    assert.ok(memoWouldSkip(a, b), "React.memo would still re-render the card");
  });

  test("all four reported props are present and are the ones being checked", () => {
    const render = instance();
    const props = propsFor(render(baseEnv()).renderItem, mkOrder("o-1"));
    for (const k of ["onPress", "onStorePress", "onRate", "onReorder"]) {
      assert.equal(
        typeof props[k],
        "function",
        `${k} is not being passed at all`,
      );
    }
    assert.equal(props.order.id, "o-1");
  });

  test("ten renders keep one identity per handler", () => {
    const render = instance();
    const env = baseEnv();
    const seen = {
      onPress: new Set(),
      onStorePress: new Set(),
      onRate: new Set(),
      onReorder: new Set(),
    };
    for (let i = 0; i < 10; i++) {
      const p = propsFor(render(env).renderItem, mkOrder("o-1"));
      for (const k of Object.keys(seen)) seen[k].add(p[k]);
    }
    for (const [k, s] of Object.entries(seen)) {
      assert.equal(
        s.size,
        1,
        `${k} produced ${s.size} identities across 10 renders`,
      );
    }
  });

  test("negative control: without dependency memoisation the same code churns 4 props", () => {
    // Proves the harness can see the defect — it is not passing because it is blind.
    const render = instance({ memoizing: false });
    const env = baseEnv();
    const order = mkOrder("o-1");
    const a = propsFor(render(env).renderItem, order);
    const b = propsFor(render(env).renderItem, order);
    const churned = Object.keys({ ...a, ...b }).filter(
      (k) => !Object.is(a[k], b[k]),
    );
    assert.deepEqual(churned.sort(), [
      "onPress",
      "onRate",
      "onReorder",
      "onStorePress",
    ]);
    assert.equal(memoWouldSkip(a, b), false);
  });
});

describe("H-82 (C) — the handlers still change when their inputs change", () => {
  test("a new customer token produces a new handleRate", () => {
    const render = instance();
    const first = render({ ...baseEnv(), customerToken: "old" }).handleRate;
    const second = render({ ...baseEnv(), customerToken: "new" }).handleRate;
    assert.notEqual(
      first,
      second,
      "a frozen handleRate would keep sending the previous token",
    );
  });

  test("handleReorder tracks the in-flight guard", () => {
    const render = instance();
    const idle = render({ ...baseEnv(), isReordering: null }).handleReorder;
    const busy = render({ ...baseEnv(), isReordering: "o-1" }).handleReorder;
    assert.notEqual(
      idle,
      busy,
      "a stale guard would allow a second reorder to start",
    );
  });

  test("handleRate's dependency array is the real one, read from the source", () => {
    const init =
      declStatement("handleRate").declarationList.declarations[0].initializer;
    assert.equal(init.expression.getText(screenSf), "useCallback");
    assert.deepEqual(
      init.arguments[1].elements.map((e) => e.getText(screenSf)),
      ["customerToken", "refreshOrders"],
    );
  });

  test("handleReorder's dependency array still contains the guard", () => {
    const init =
      declStatement("handleReorder").declarationList.declarations[0]
        .initializer;
    const deps = init.arguments[1].elements.map((e) => e.getText(screenSf));
    assert.ok(
      deps.includes("isReordering"),
      "dropping isReordering from the deps would stabilise the callback by breaking it",
    );
  });

  test("renderItem is memoised on the handlers it uses", () => {
    const init =
      declStatement("renderItem").declarationList.declarations[0].initializer;
    assert.equal(init.expression.getText(screenSf), "useCallback");
    const deps = init.arguments[1].elements
      .map((e) => e.getText(screenSf))
      .sort();
    assert.deepEqual(deps, [
      "handleOpenOrder",
      "handleRate",
      "handleReorder",
      "handleStorePress",
    ]);
  });
});

describe("H-82 (D) — the handlers act on the order that was tapped", () => {
  test("onPress navigates to the row's own order, not a captured one", () => {
    const render = instance();
    const navigated = [];
    const env = {
      ...baseEnv(),
      navigation: { navigate: (r, p) => navigated.push([r, p]) },
    };
    const { renderItem } = render(env);

    // ONE handler identity, used by three different rows.
    const rows = ["o-1", "o-2", "o-3"].map((id) =>
      propsFor(renderItem, mkOrder(id)),
    );
    assert.equal(new Set(rows.map((r) => r.onPress)).size, 1);

    rows.forEach((r, i) => r.onPress(mkOrder(`o-${i + 1}`)));
    assert.deepEqual(navigated, [
      ["OrderTracking", { orderId: "o-1" }],
      ["OrderTracking", { orderId: "o-2" }],
      ["OrderTracking", { orderId: "o-3" }],
    ]);
  });

  test("onStorePress resolves the store name from the order it is given", () => {
    const render = instance();
    const navigated = [];
    const env = {
      ...baseEnv(),
      navigation: { navigate: (r, p) => navigated.push([r, p]) },
    };
    const { handleStorePress } = render(env);

    handleStorePress(
      mkOrder("o-1", { vendorId: "v-9", vendorName: "سوق النخيل" }),
    );
    // vendorName absent → falls back to a line's restaurant, then to "المتجر".
    handleStorePress(
      mkOrder("o-2", {
        vendorId: "v-8",
        vendorName: undefined,
        items: [
          {
            productId: "p",
            name: "n",
            price: 1,
            quantity: 1,
            image: "",
            restaurant: "مطعم دجلة",
          },
        ],
      }),
    );
    handleStorePress(
      mkOrder("o-3", { vendorId: "v-7", vendorName: undefined, items: [] }),
    );

    assert.deepEqual(navigated, [
      ["StoreProducts", { storeId: "v-9", storeName: "سوق النخيل" }],
      ["StoreProducts", { storeId: "v-8", storeName: "مطعم دجلة" }],
      ["StoreProducts", { storeId: "v-7", storeName: "المتجر" }],
    ]);
  });

  test("a row with no vendor still gets no store handler", () => {
    const render = instance();
    const props = propsFor(
      render(baseEnv()).renderItem,
      mkOrder("o-1", { vendorId: undefined }),
    );
    assert.equal(props.onStorePress, undefined);
  });

  test("only a delivered order gets a reorder handler", () => {
    const render = instance();
    const { renderItem } = render(baseEnv());
    assert.equal(
      typeof propsFor(renderItem, mkOrder("a")).onReorder,
      "function",
    );
    assert.equal(
      propsFor(renderItem, mkOrder("b", { status: "in_delivery" })).onReorder,
      undefined,
    );
  });
});

describe("H-82 (E) — an unchanged order survives a poll as the same object", () => {
  test("OrderContext reconciles instead of installing the raw payload", () => {
    assert.match(
      CTX,
      /setOrders\(\(prev\) => reconcileOrders\(prev, data\)\)/,
      "the poll is back to replacing every order object",
    );
    assert.match(
      CTX,
      /import \{ reconcileOrders \} from "@\/lib\/orderIdentity"/,
    );
  });

  test("a quiet poll changes neither the array nor any element", () => {
    const prev = [mkOrder("a"), mkOrder("b"), mkOrder("c")];
    const payload = JSON.parse(JSON.stringify(prev)); // what response.json() returns
    const next = reconcileOrders(prev, payload);
    assert.equal(
      next,
      prev,
      "the array identity changed, re-rendering the whole list",
    );
  });

  test("only the order that actually changed gets a new identity", () => {
    const prev = [mkOrder("a"), mkOrder("b"), mkOrder("c")];
    const payload = JSON.parse(JSON.stringify(prev));
    payload[1].status = "cancelled";

    const next = reconcileOrders(prev, payload);
    assert.notEqual(next, prev);
    assert.equal(next[0], prev[0]);
    assert.notEqual(next[1], prev[1]);
    assert.equal(next[1].status, "cancelled", "the server's value must win");
    assert.equal(next[2], prev[2]);
  });

  test("a change nested inside items is detected", () => {
    const prev = [mkOrder("a")];
    const payload = JSON.parse(JSON.stringify(prev));
    payload[0].items[0].quantity = 2;
    const next = reconcileOrders(prev, payload);
    assert.notEqual(
      next[0],
      prev[0],
      "a nested change was treated as no change — stale card",
    );
    assert.equal(next[0].items[0].quantity, 2);
  });

  test("length, order and membership always follow the server", () => {
    const prev = [mkOrder("a"), mkOrder("b")];

    const removed = reconcileOrders(prev, [
      JSON.parse(JSON.stringify(prev[1])),
    ]);
    assert.deepEqual(
      removed.map((o) => o.id),
      ["b"],
    );
    assert.equal(
      removed[0],
      prev[1],
      "the surviving order should keep its identity",
    );

    const added = reconcileOrders(prev, [
      ...JSON.parse(JSON.stringify(prev)),
      mkOrder("c"),
    ]);
    assert.deepEqual(
      added.map((o) => o.id),
      ["a", "b", "c"],
    );

    const reordered = reconcileOrders(
      prev,
      JSON.parse(JSON.stringify([prev[1], prev[0]])),
    );
    assert.deepEqual(
      reordered.map((o) => o.id),
      ["b", "a"],
    );
    assert.notEqual(
      reordered,
      prev,
      "a reorder is a change and must produce a new array",
    );
    assert.equal(
      reordered[0],
      prev[1],
      "…but the orders themselves are unchanged",
    );
  });

  test("an empty payload empties the list", () => {
    assert.deepEqual(reconcileOrders([mkOrder("a")], []), []);
  });
});

describe("H-82 (F) — jsonEqual is exact", () => {
  const cases = [
    [true, {}, {}],
    [true, { a: 1 }, { a: 1 }],
    [true, [1, [2, { b: null }]], [1, [2, { b: null }]]],
    [false, { a: 1 }, { a: "1" }],
    [false, { a: 1 }, { a: 1, b: undefined }],
    [false, { a: 1, b: 2 }, { a: 1 }],
    [false, [1, 2], [2, 1]],
    [false, [1, 2], [1, 2, 3]],
    [false, null, {}],
    [false, {}, null],
    [false, 0, "0"],
    [false, { a: { b: 1 } }, { a: { b: 2 } }],
    [true, { a: undefined }, { a: undefined }],
  ];
  for (const [expected, a, b] of cases) {
    test(`${JSON.stringify(a)} vs ${JSON.stringify(b)} → ${expected}`, () => {
      assert.equal(jsonEqual(a, b), expected);
      assert.equal(jsonEqual(b, a), expected, "comparison must be symmetric");
    });
  }

  test("NaN equals itself, so a numeric field never churns", () => {
    assert.equal(jsonEqual({ n: NaN }, { n: NaN }), true);
  });
});

describe("H-82 (G) — regression: forty cards through one ten-second poll", () => {
  /**
   * The reported scale: about forty orders on screen, refreshed every ten seconds.
   * This drives the whole path — reconcile the payload, re-render the screen,
   * rebuild each row's props, apply React.memo's comparison — and counts the cards
   * that would actually re-render.
   */
  function poll({ changedIds = [], memoizing = true } = {}) {
    const render = instance({ memoizing });
    const env = baseEnv();

    let orders = Array.from({ length: 40 }, (_, i) => mkOrder(`o-${i}`));
    let renderItem = render(env).renderItem;
    const before = orders.map((o) => propsFor(renderItem, o));

    // The poll: a fresh payload off the wire, with the named orders changed.
    const payload = JSON.parse(JSON.stringify(orders));
    for (const id of changedIds) {
      payload[orders.findIndex((o) => o.id === id)].status = "cancelled";
    }
    orders = reconcileOrders(orders, payload);

    // isLoading flips, so the screen re-renders.
    renderItem = render(env).renderItem;
    const after = orders.map((o) => propsFor(renderItem, o));

    return before.filter((p, i) => !memoWouldSkip(p, after[i])).length;
  }

  test("nothing changed → not one card re-renders", () => {
    assert.equal(
      poll(),
      0,
      "cards still re-render on a poll that carried no news",
    );
  });

  test("one order changed → exactly one card re-renders", () => {
    assert.equal(poll({ changedIds: ["o-17"] }), 1);
  });

  test("three orders changed → exactly three cards re-render", () => {
    assert.equal(poll({ changedIds: ["o-0", "o-17", "o-39"] }), 3);
  });

  test("negative control: without the fix all forty re-render on a quiet poll", () => {
    assert.equal(poll({ memoizing: false }), 40);
  });
});

describe("H-82 (H) — the list's own props do not force the cells to rebuild", () => {
  test("data is memoised on the orders and the query", () => {
    const init =
      declStatement("filteredOrders").declarationList.declarations[0]
        .initializer;
    assert.equal(init.expression.getText(screenSf), "useMemo");
    assert.deepEqual(
      init.arguments[1].elements.map((e) => e.getText(screenSf)),
      ["orders", "searchQuery"],
    );
  });

  test("no object or array literal is passed inline to the FlatList", () => {
    // A fresh style object or colours array re-renders the list on every render.
    const list = SCREEN.slice(
      SCREEN.indexOf("<FlatList"),
      SCREEN.indexOf("</View>", SCREEN.indexOf("<FlatList")),
    );
    for (const prop of [
      "contentContainerStyle",
      "scrollIndicatorInsets",
      "refreshControl",
      "style",
    ]) {
      const m = list.match(new RegExp(`${prop}=\\{([^\\n]*)`));
      assert.ok(m, `${prop} is no longer set on the list`);
      assert.doesNotMatch(
        m[1],
        /^\s*\{\s*[a-zA-Z"']|^\s*\[/,
        `${prop} is an inline literal again`,
      );
    }
  });

  test("the RefreshControl colours array lives at module scope", () => {
    assert.match(SCREEN, /^const REFRESH_COLORS = \[AppColors\.primary\];$/m);
  });

  test("keyExtractor still keys rows by order id", () => {
    // H-27 depends on this: a stable key is what keeps a card mounted across
    // refreshes rather than reused for a different order.
    assert.match(SCREEN, /keyExtractor=\{\(item\) => item\.id\}/);
  });
});
