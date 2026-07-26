/**
 * Regression guards for the two production-blocking Medium findings.
 *
 *   M6 — the promo dedup index named `promoUsage`, a collection the code has never
 *        used; every query goes to `promoUsageHistory`. The index was inert.
 *   M8 — no index existed for the FIFO repair query on `settlementPayments`, so it
 *        threw FAILED_PRECONDITION on every call, was swallowed by its own
 *        best-effort catch, and never ran once.
 *
 * Both failures are invisible at runtime: a missing index does not break the build,
 * does not fail a typecheck, and (for M8) does not even surface an error to a user.
 * The only thing that can catch them is a check that reads the queries out of the
 * source and confronts them with the index file — which is what this does.
 *
 * Run:  npm run test:unit
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, "../../", p), "utf8");

const INDEXES = JSON.parse(read("firestore.indexes.json"));
const SERVER_SOURCES = [
  "server/routes.ts",
  "server/firebase.ts",
  "server/settlement.ts",
  "server/vendor.ts",
]
  .map((p) => read(p))
  .join("\n");

/** Collection names the server actually reads or writes, including via constants. */
function collectionsUsedByCode() {
  const used = new Set();
  // .collection("literal")
  for (const m of SERVER_SOURCES.matchAll(
    /\.collection\(\s*"([A-Za-z_][A-Za-z0-9_]*)"\s*\)/g,
  )) {
    used.add(m[1]);
  }
  // .collection(CONST) where CONST = "name"  — settlement.ts routes everything through these
  const constants = new Map();
  for (const m of SERVER_SOURCES.matchAll(
    /const\s+([A-Z_][A-Z0-9_]*)\s*=\s*"([A-Za-z_][A-Za-z0-9_]*)"\s*;/g,
  )) {
    constants.set(m[1], m[2]);
  }
  for (const m of SERVER_SOURCES.matchAll(
    /\.collection\(\s*([A-Z_][A-Z0-9_]*)\s*\)/g,
  )) {
    const resolved = constants.get(m[1]);
    if (resolved) used.add(resolved);
  }
  return used;
}

/** All declared indexes for a collection, each as a list of {fieldPath, order}. */
function indexesFor(collection) {
  return INDEXES.indexes
    .filter((i) => i.collectionGroup === collection)
    .map((i) => i.fields);
}

/**
 * Does any declared index on `collection` cover a query with these equality fields
 * and this orderBy? Firestore needs every equality field plus the ordered field, in
 * the declared order, with a matching direction.
 */
function hasIndexFor(collection, { equality = [], orderBy = null } = {}) {
  return indexesFor(collection).some((fields) => {
    const names = fields.map((f) => f.fieldPath);
    if (!equality.every((e) => names.includes(e))) return false;
    if (!orderBy) return fields.length === equality.length;
    const last = fields[fields.length - 1];
    return last.fieldPath === orderBy.field && last.order === orderBy.direction;
  });
}

// ── M6 ──────────────────────────────────────────────────────────────────────
describe("M6 — the promo dedup index must name the collection the code queries", () => {
  test("the code queries promoUsageHistory, not promoUsage", () => {
    // Establishes the premise the index has to match. If the code is ever renamed,
    // this fails first and points at the real cause instead of the index.
    assert.match(SERVER_SOURCES, /\.collection\("promoUsageHistory"\)/);
    assert.doesNotMatch(
      SERVER_SOURCES,
      /\.collection\("promoUsage"\)/,
      "no code path uses `promoUsage`; an index for it protects nothing",
    );
  });

  test("promoUsageHistory has the userId + promoCode index", () => {
    assert.ok(
      hasIndexFor("promoUsageHistory", { equality: ["userId", "promoCode"] }),
      "REGRESSION: checkPromoUsage() filters on userId AND promoCode — without this index it throws FAILED_PRECONDITION, the catch returns false, and a single-use coupon becomes infinitely reusable",
    );
  });

  test("the dead promoUsage index is gone", () => {
    assert.deepEqual(
      indexesFor("promoUsage"),
      [],
      "REGRESSION: an index naming a collection the code never touches is inert and hides the fact that the real query is unindexed",
    );
  });
});

// ── M8 ──────────────────────────────────────────────────────────────────────
describe("M8 — the FIFO repair query must be indexed", () => {
  test("the repair query still has the shape this index is built for", () => {
    const SETTLEMENT = read("server/settlement.ts");
    const fn = SETTLEMENT.slice(
      SETTLEMENT.indexOf("async function repairPendingFIFO"),
    );
    const body = fn.slice(0, fn.indexOf("\n}"));
    assert.match(body, /\.where\("accountKey", "==", key\)/);
    assert.match(body, /\.where\("fifoApplied", "==", false\)/);
    assert.match(body, /\.orderBy\("createdAt", "desc"\)/);
  });

  test("settlementPayments has accountKey + fifoApplied + createdAt DESC", () => {
    assert.ok(
      hasIndexFor("settlementPayments", {
        equality: ["accountKey", "fifoApplied"],
        orderBy: { field: "createdAt", direction: "DESCENDING" },
      }),
      "REGRESSION: without this index repairPendingFIFO throws FAILED_PRECONDITION on every call. Its own catch swallows it, so the pass NEVER runs and a payment interrupted between the ledger commit and the FIFO step stays fifoApplied:false forever — the balance is right but the per-order settlement records never close",
    );
  });

  test("the createdAt direction matches the query", () => {
    // A DESC orderBy against an ASC index is still FAILED_PRECONDITION.
    const idx = indexesFor("settlementPayments").find((f) =>
      f.some((x) => x.fieldPath === "createdAt"),
    );
    assert.ok(idx, "no settlementPayments index declares createdAt");
    assert.equal(
      idx[idx.length - 1].order,
      "DESCENDING",
      "the query orders by createdAt desc; an ASCENDING index does not satisfy it",
    );
  });
});

// ── The class both findings belong to ───────────────────────────────────────
describe("firestore.indexes.json — every index must serve a real query", () => {
  test("no index names a collection the code never touches", () => {
    const used = collectionsUsedByCode();
    const orphans = [
      ...new Set(INDEXES.indexes.map((i) => i.collectionGroup)),
    ].filter((c) => !used.has(c));
    assert.deepEqual(
      orphans,
      [],
      `REGRESSION: ${orphans.join(", ")} — an index for an unused collection reads as coverage while the real query stays unindexed. This is exactly how M6 survived.`,
    );
  });

  test("the file is valid and wired into firebase.json", () => {
    assert.ok(Array.isArray(INDEXES.indexes) && INDEXES.indexes.length > 0);
    const firebaseJson = JSON.parse(read("firebase.json"));
    assert.equal(
      firebaseJson.firestore?.indexes,
      "firestore.indexes.json",
      "the file must be the one `firebase deploy --only firestore:indexes` actually publishes",
    );
  });

  test("every index declares a queryScope and at least two fields", () => {
    // A single-field index is created automatically; declaring one signals the
    // author misread which query needed covering.
    for (const idx of INDEXES.indexes) {
      assert.equal(
        idx.queryScope,
        "COLLECTION",
        `${idx.collectionGroup} is missing queryScope`,
      );
      assert.ok(
        idx.fields.length >= 2,
        `${idx.collectionGroup} declares a single-field index, which Firestore already provides`,
      );
    }
  });
});
