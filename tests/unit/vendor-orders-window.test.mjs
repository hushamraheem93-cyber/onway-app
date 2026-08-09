/**
 * Vendor order list window tests (audit finding H-22).
 *
 * GET /api/vendor/orders fetched the store's orders with .limit(200) and no .orderBy().
 * Firestore answers an unordered limit in DOCUMENT ID order, and order ids come from
 * .add() — 20 random characters, not time-sortable. So the window was neither the
 * oldest nor the newest 200 orders; it was 200 arbitrary ones, and the SAME 200 on
 * every load. Past 200 lifetime orders a store's chance of seeing a new order fell to
 * roughly 200/N, silently: the handler sorts the result in memory before returning it,
 * so a wrong SET arrived looking perfectly ordered.
 *
 * The fix adds .orderBy("createdAt", "desc"). The composite index it needs was already
 * deployed and unused.
 *
 * Run:  node --test tests/unit/vendor-orders-window.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, "../../", p), "utf8");
const VENDOR = read("server/vendor.ts");
const FIREBASE = read("server/firebase.ts");
const INDEXES = JSON.parse(read("firestore.indexes.json"));

function code(src) {
  return src
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*"));
    })
    .join("\n");
}

/** GET /api/vendor/orders handler, source text. */
const ROUTE = (() => {
  const from = VENDOR.indexOf('router.get("/api/vendor/orders", requireVendor');
  assert.ok(from > -1, "the vendor orders route is gone");
  const to = VENDOR.indexOf("// ── GET /api/vendor/stats", from);
  assert.ok(to > from, "could not find the end of the route");
  return VENDOR.slice(from, to);
})();

describe("H-22 — the vendor's own orders are fetched newest-first", () => {
  test("the vendorId query is ordered", () => {
    assert.match(
      code(ROUTE),
      /\.where\("vendorId", "==", vid\)\s*\n\s*\.orderBy\("createdAt", "desc"\)\s*\n\s*\.limit\(200\)/,
      "REGRESSION: the store's order list is a random 200-document window again",
    );
  });

  test("the limit itself is unchanged", () => {
    assert.match(code(ROUTE), /\.limit\(200\)/);
  });

  test("the item-level ownership scan is still ordered and bounded", () => {
    assert.match(
      code(ROUTE),
      /\.orderBy\("createdAt", "desc"\)\s*\n\s*\.limit\(300\)/,
      "the second pass lost its ordering or its bound",
    );
  });

  test("no query on orders in this route has a limit without an order", () => {
    // The generic form of the defect: any .limit() that is not preceded by an
    // .orderBy() in the same chain is a random window, whatever it queries.
    const chains = [...code(ROUTE).matchAll(/db\s*\n?\s*\.?collection\("orders"\)([\s\S]{0,300}?)\.get\(\)/g)];
    assert.ok(chains.length >= 2, `expected the route's orders queries, found ${chains.length}`);
    for (const [, chain] of chains) {
      if (!/\.limit\(/.test(chain)) continue;
      assert.match(chain, /\.orderBy\(/, `a bounded query has no ordering: ${chain.trim().slice(0, 120)}`);
    }
  });
});

describe("H-22 — the ordering is safe to apply", () => {
  test("exactly one place creates orders", () => {
    // orderBy silently drops documents that lack the field, so a second writer that
    // forgot createdAt would make orders vanish from the list entirely.
    const writers = [...FIREBASE.matchAll(/collection\("orders"\)\.(add|doc\([^)]*\)\.(set|create))/g)];
    assert.equal(writers.length, 1, `${writers.length} places create order documents`);
  });

  test("createOrder always stamps createdAt", () => {
    assert.match(
      FIREBASE,
      /const orderDoc: FirestoreOrder = \{ \.\.\.data, createdAt: now, updatedAt: now \};/,
      "createdAt is no longer guaranteed — ordering would drop documents",
    );
    assert.match(FIREBASE, /export async function createOrder\(data: Omit<FirestoreOrder, "createdAt" \| "updatedAt">\)/);
  });

  test("the composite index the query needs is deployed", () => {
    const wanted = [["vendorId", "ASCENDING"], ["createdAt", "DESCENDING"]];
    const found = (INDEXES.indexes ?? []).some(
      (i) =>
        i.collectionGroup === "orders" &&
        (i.fields ?? []).length === wanted.length &&
        wanted.every(([path, order], n) => i.fields[n].fieldPath === path && i.fields[n].order === order),
    );
    assert.ok(found, "orders (vendorId ASC, createdAt DESC) is missing — the query would fail at runtime");
  });
});

describe("H-22 — the response shape is unchanged", () => {
  test("the in-memory sort and the 100 cap are still there", () => {
    assert.match(code(ROUTE), /\.sort\(\(a: any, b: any\) => b\.createdAt\.localeCompare\(a\.createdAt\)\)/);
    assert.match(code(ROUTE), /\.slice\(0, 100\)/);
  });

  test("the response body is unchanged", () => {
    assert.match(code(ROUTE), /res\.json\(\{ orders: serialized, total: serialized\.length \}\)/);
  });

  test("both ownership paths are still merged", () => {
    assert.match(code(ROUTE), /const ordersMap = new Map<string, any>\(\);/);
    assert.match(code(ROUTE), /if \(ordersMap\.has\(doc\.id\)\) continue;/);
    assert.match(code(ROUTE), /vendorProductIds\.has\(item\.productId\)/);
  });

  test("vendor item filtering and subtotal are untouched", () => {
    assert.match(code(ROUTE), /if \(vendorItems\.length === 0 && o\.vendorId === vid\) \{/);
    assert.match(code(ROUTE), /const vendorSubtotal = vendorItems\.reduce\(/);
  });
});

describe("H-22 — why an unordered limit is a random window", () => {
  // Models the two Firestore behaviours the finding turns on, so the reasoning behind
  // the fix is pinned and not just the line of code.
  const byDocId = (docs, n) => [...docs].sort((a, b) => (a.id < b.id ? -1 : 1)).slice(0, n);
  const byNewest = (docs, n) => [...docs].sort((a, b) => b.createdAt - a.createdAt).slice(0, n);

  // 500 orders: ids unrelated to time, exactly like .add() produces.
  const shuffledIds = ["m", "b", "z", "a", "q", "f", "t", "c", "y", "d"];
  const docs = shuffledIds.map((id, i) => ({ id, createdAt: i }));

  test("an unordered limit returns a set unrelated to recency", () => {
    const window = byDocId(docs, 3).map((d) => d.createdAt).sort((a, b) => a - b);
    assert.deepEqual(window, [3, 1, 7].sort((a, b) => a - b));
    assert.ok(!window.includes(9), "the newest document is not in the window");
  });

  test("an ordered limit returns the newest", () => {
    assert.deepEqual(byNewest(docs, 3).map((d) => d.createdAt), [9, 8, 7]);
  });

  test("sorting afterwards does not repair the wrong set", () => {
    // This is what made the defect invisible: the handler's final sort produces a
    // perfectly ordered list out of documents that should never have been fetched.
    const sortedButWrong = byDocId(docs, 3).sort((a, b) => b.createdAt - a.createdAt);
    assert.ok(
      sortedButWrong.every((d, i) => i === 0 || sortedButWrong[i - 1].createdAt >= d.createdAt),
      "the output is ordered",
    );
    assert.notDeepEqual(
      sortedButWrong.map((d) => d.createdAt),
      byNewest(docs, 3).map((d) => d.createdAt),
      "yet it is not the newest three",
    );
  });

  test("the miss rate grows with the store's lifetime order count", () => {
    // Chance a given new order falls inside a fixed 200-document window.
    const visible = (lifetime) => Math.min(1, 200 / lifetime);
    assert.equal(visible(200), 1);
    assert.equal(visible(400), 0.5);
    assert.equal(visible(1000), 0.2);
  });
});
