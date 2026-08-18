/**
 * H-81 — SmartSuggestions re-scanned the catalogue and reshuffled it in the render
 * body.
 *
 * The defect, measured on HEAD before the fix by lifting the real
 * `getSuggestedProducts` out of SmartSuggestions.tsx and calling it six times with
 * one unchanged cart:
 *
 *     render 1: dairy-eggs-2,meat-poultry-6,beverages-2,meat-poultry-5,…
 *     render 2: meat-poultry-6,beverages-2,meat-poultry-2,beverages-4,…
 *     render 3: meat-poultry-2,dairy-eggs-5,dairy-eggs-2,beverages-5,…
 *     …
 *     distinct orderings across 6 renders: 6
 *
 * `PRODUCTS.filter(...).sort(() => Math.random() - 0.5)` ran straight from the
 * component body, so the whole 105-product catalogue was walked on every render
 * and the answer was different every time. The strip re-renders whenever the cart
 * changes, and the cart changes the moment the customer taps "+" on the strip — so
 * the row reordered under their finger and the tap landed on a different product.
 *
 * Nothing here reimplements the component. `computeSuggestedProducts` is lifted
 * out of the real .tsx by AST and executed; the wiring assertions read the real
 * syntax tree, so a comment mentioning Math.random cannot satisfy them and
 * removing the useMemo cannot hide behind one.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
const PATH = join(here, "../../client/components/SmartSuggestions.tsx");
const SRC = readFileSync(PATH, "utf8");
const sf = ts.createSourceFile(
  "SmartSuggestions.tsx",
  SRC,
  ts.ScriptTarget.ES2022,
  true,
  ts.ScriptKind.TSX,
);

// ── AST helpers ──────────────────────────────────────────────────────────────
function walk(node, visit) {
  visit(node);
  ts.forEachChild(node, (c) => walk(c, visit));
}

function findFunctionDeclaration(name) {
  let out = null;
  walk(sf, (n) => {
    if (ts.isFunctionDeclaration(n) && n.name?.text === name) out = n;
  });
  return out;
}

function findVariableDeclaration(name) {
  let out = null;
  walk(sf, (n) => {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.name.text === name
    )
      out = n;
  });
  return out;
}

/** Every `x.y(...)` / `x(...)` callee text in the file — comments are not nodes. */
function calleeTexts() {
  const out = [];
  walk(sf, (n) => {
    if (ts.isCallExpression(n)) out.push(n.expression.getText(sf));
  });
  return out;
}

// ── lift the real function and run it ────────────────────────────────────────
const compute = (() => {
  const cat = findVariableDeclaration("CATEGORY_SUGGESTIONS");
  const limit = findVariableDeclaration("SUGGESTION_LIMIT");
  const fn = findFunctionDeclaration("computeSuggestedProducts");
  assert.ok(cat, "CATEGORY_SUGGESTIONS not found");
  assert.ok(limit, "SUGGESTION_LIMIT not found");
  assert.ok(
    fn,
    "computeSuggestedProducts not found — the fix's entry point is gone",
  );

  const src = [
    `const CATEGORY_SUGGESTIONS = ${cat.initializer.getText(sf)};`,
    `const SUGGESTION_LIMIT = ${limit.initializer.getText(sf)};`,
    fn.getText(sf).replace(/^export\s+/, ""),
    "return computeSuggestedProducts;",
  ].join("\n");

  const js = ts.transpileModule(src, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  // PRODUCTS is the default parameter; every test passes its own catalogue, so the
  // binding only has to exist.
  return new Function("PRODUCTS", js)([]);
})();

// ── a catalogue big enough for an ordering to be visible ─────────────────────
const CATS = ["dairy-eggs", "meat-poultry", "beverages", "snacks-sweets"];
function catalogue({ perCat = 6, outOfStock = [] } = {}) {
  const out = [];
  for (const cat of CATS) {
    for (let i = 1; i <= perCat; i++) {
      const id = `${cat}-${i}`;
      out.push({
        id,
        categoryId: cat,
        name: `${cat} ${i}`,
        price: 1000 + i,
        image: "x.png",
        inStock: !outOfStock.includes(id),
      });
    }
  }
  return out;
}
const line = (id, categoryId) => ({ product: { id, categoryId }, quantity: 1 });
const ids = (list) => list.map((p) => p.id);

describe("H-81 (A) — the shuffle is gone from the render path", () => {
  test("Math.random is not called anywhere in the component", () => {
    const calls = calleeTexts().filter((t) => /(^|\.)Math\.random$/.test(t));
    assert.deepEqual(
      calls,
      [],
      "a random sort key makes the strip a different strip on every render",
    );
  });

  test("no sort comparator ignores both of its operands", () => {
    // `() => Math.random() - 0.5` and `() => 0.5 - Math.random()` alike: a
    // comparator that reads neither side is not comparing anything.
    const bad = [];
    walk(sf, (n) => {
      if (
        !ts.isCallExpression(n) ||
        !ts.isPropertyAccessExpression(n.expression) ||
        n.expression.name.text !== "sort"
      )
        return;
      const cmp = n.arguments[0];
      if (!cmp || (!ts.isArrowFunction(cmp) && !ts.isFunctionExpression(cmp)))
        return;
      if (cmp.parameters.length === 0) bad.push(cmp.getText(sf));
    });
    assert.deepEqual(
      bad,
      [],
      "a nullary sort comparator cannot be a real ordering",
    );
  });

  test("the computation is a module-level exported function, not a render-body arrow", () => {
    const fn = findFunctionDeclaration("computeSuggestedProducts");
    assert.equal(
      fn.parent.kind,
      ts.SyntaxKind.SourceFile,
      "must live at module scope",
    );
    assert.ok(
      fn.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword),
      "must be exported so it can be tested as itself",
    );
  });

  test("the component reaches it through useMemo keyed on the cart", () => {
    const decl = findVariableDeclaration("suggestedProducts");
    assert.ok(decl, "suggestedProducts is gone");
    const init = decl.initializer;
    assert.ok(
      ts.isCallExpression(init) && init.expression.getText(sf) === "useMemo",
      "the catalogue scan is back in the render body",
    );
    const deps = init.arguments[1];
    assert.ok(
      ts.isArrayLiteralExpression(deps),
      "useMemo needs a dependency array",
    );
    assert.deepEqual(
      deps.elements.map((e) => e.getText(sf)),
      ["cartItems"],
      "the cart is the only thing the result depends on",
    );
  });
});

describe("H-81 (B) — the same cart always yields the same strip", () => {
  const cart = [line("fv-1", "fruits-vegetables")];

  test("20 consecutive calls return one identical ordering", () => {
    const cat = catalogue();
    const runs = new Set();
    for (let i = 0; i < 20; i++) runs.add(ids(compute(cart, cat)).join(","));
    assert.equal(
      runs.size,
      1,
      `20 renders produced ${runs.size} orderings:\n  ${[...runs].join("\n  ")}`,
    );
  });

  test("a fresh catalogue array with equal contents yields the same ordering", () => {
    // The order must come from the products, not from where they sit in memory.
    assert.equal(
      ids(compute(cart, catalogue())).join(","),
      ids(compute(cart, catalogue())).join(","),
    );
  });

  test("the strip is ordered by product id, ascending", () => {
    // The documented rule. Stated as a test so the ordering cannot quietly become
    // something derived from the cart or from the moment.
    const got = ids(compute(cart, catalogue()));
    assert.deepEqual(got, [...got].sort());
  });

  test("different carts surface different strips", () => {
    const cat = catalogue();
    const a = ids(compute([line("fv-1", "fruits-vegetables")], cat)).join(",");
    const b = ids(compute([line("b-1", "baby")], cat)).join(",");
    assert.notEqual(a, b, "variety across carts must survive the fix");
  });
});

describe("H-81 (C) — the catalogue is read, never written", () => {
  test("neither the array nor any product is mutated", () => {
    const cat = catalogue();
    const orderBefore = ids(cat).join(",");
    const snapshot = JSON.stringify(cat);

    for (let i = 0; i < 10; i++)
      compute([line("fv-1", "fruits-vegetables")], cat);

    assert.equal(
      ids(cat).join(","),
      orderBefore,
      "the shared catalogue was reordered",
    );
    assert.equal(
      JSON.stringify(cat),
      snapshot,
      "a product object was modified",
    );
  });

  test("a frozen catalogue is accepted", () => {
    const cat = catalogue().map((p) => Object.freeze(p));
    Object.freeze(cat);
    assert.doesNotThrow(() =>
      compute([line("fv-1", "fruits-vegetables")], cat),
    );
  });
});

describe("H-81 (D) — the selection rules are unchanged", () => {
  const cat = catalogue();

  test("an empty cart suggests nothing", () => {
    assert.deepEqual(compute([], cat), []);
  });

  test("only categories related to the cart's categories are offered", () => {
    // fruits-vegetables → dairy-eggs, meat-poultry, beverages (not snacks-sweets).
    const got = compute([line("fv-1", "fruits-vegetables")], cat, 100);
    const cats = new Set(got.map((p) => p.categoryId));
    assert.deepEqual(
      [...cats].sort(),
      ["beverages", "dairy-eggs", "meat-poultry"],
      "the CATEGORY_SUGGESTIONS map is no longer being honoured",
    );
  });

  test("products already in the cart are excluded", () => {
    const inCart = "dairy-eggs-3";
    const got = compute(
      [line("fv-1", "fruits-vegetables"), line(inCart, "dairy-eggs")],
      cat,
      100,
    );
    assert.ok(
      !ids(got).includes(inCart),
      "a product in the cart was suggested again",
    );
  });

  test("out-of-stock products are excluded", () => {
    const got = compute(
      [line("fv-1", "fruits-vegetables")],
      catalogue({ outOfStock: ["beverages-1", "beverages-2"] }),
      100,
    );
    assert.ok(!ids(got).includes("beverages-1"));
    assert.ok(!ids(got).includes("beverages-2"));
  });

  test("at most eight are shown, and the cap is the source's own constant", () => {
    const wide = catalogue({ perCat: 40 });
    assert.equal(compute([line("fv-1", "fruits-vegetables")], wide).length, 8);
    const limit = findVariableDeclaration("SUGGESTION_LIMIT");
    assert.equal(limit.initializer.getText(sf), "8", "the visible cap moved");
  });

  test("a category with no entry in the map contributes nothing", () => {
    assert.deepEqual(compute([line("x-1", "not-a-category")], cat, 100), []);
  });
});

describe("H-81 (E) — regression: the strip holds still while the customer uses it", () => {
  /**
   * The exact sequence that made the defect visible: look at the strip, tap "+",
   * look again, tap again. Every survivor must stay in the same relative order —
   * otherwise the second tap lands on a product that slid into the first one's
   * place.
   */
  test("render → add → render → add → render keeps every survivor in place", () => {
    const cat = catalogue();
    let cart = [line("fv-1", "fruits-vegetables")];

    const seen = [];
    for (let round = 0; round < 3; round++) {
      const strip = ids(compute(cart, cat));
      seen.push(strip);
      if (round < 2) {
        // The customer taps the first card.
        const picked = strip[0];
        const product = cat.find((p) => p.id === picked);
        cart = [...cart, line(product.id, product.categoryId)];
      }
    }

    for (let i = 1; i < seen.length; i++) {
      const survivors = seen[i - 1].filter((id) => seen[i].includes(id));
      const nowOrder = seen[i].filter((id) => survivors.includes(id));
      assert.deepEqual(
        nowOrder,
        survivors,
        `round ${i}: the remaining suggestions were reordered by an unrelated cart change`,
      );
    }
  });

  test("adding an unrelated product does not move the surviving suggestions", () => {
    const cat = catalogue();
    const before = ids(compute([line("fv-1", "fruits-vegetables")], cat));
    const after = ids(
      compute(
        [line("fv-1", "fruits-vegetables"), line("fv-2", "fruits-vegetables")],
        cat,
      ),
    );
    assert.deepEqual(
      after,
      before,
      "a second item in the same category reshuffled the strip",
    );
  });

  test("removing one suggestion from the catalogue leaves the rest in order", () => {
    const cat = catalogue();
    const full = ids(compute([line("fv-1", "fruits-vegetables")], cat, 100));
    const gone = full[3];
    const pruned = cat.filter((p) => p.id !== gone);
    const after = ids(
      compute([line("fv-1", "fruits-vegetables")], pruned, 100),
    );
    assert.deepEqual(
      after,
      full.filter((id) => id !== gone),
    );
  });
});

describe("H-81 (F) — the ordering is a total order", () => {
  test("no two distinct products tie", () => {
    // A tie would let the engine's sort implementation choose, reintroducing
    // instability by the back door.
    const cat = catalogue({ perCat: 25 });
    const order = ids(
      compute([line("fv-1", "fruits-vegetables")], cat, 10_000),
    );
    assert.equal(new Set(order).size, order.length);

    const reversed = ids(
      compute([line("fv-1", "fruits-vegetables")], [...cat].reverse(), 10_000),
    );
    assert.deepEqual(
      reversed,
      order,
      "the result depended on the input order — not a total order",
    );
  });
});
