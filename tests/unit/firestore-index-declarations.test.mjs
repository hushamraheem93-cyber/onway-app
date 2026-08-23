/**
 * The index file must describe the queries the server actually runs.
 *
 * Two ways this drifted, and both cost something real.
 *
 * `/api/admin/financial-reports` gained an `orderBy("createdAt","desc")` when M-03
 * was closed — correct, but it made the query need a composite index. The index was
 * added to firestore.indexes.json and then only the RULES were deployed
 * (`--only firestore:rules`), so the query has been answering FAILED_PRECONDITION in
 * production ever since. Declaring an index is not deploying it.
 *
 * In the other direction, two indexes existed in Firestore that this file never
 * mentioned, both serving `/api/admin/owner-earnings`. `firebase deploy --only
 * firestore:indexes` offers to delete every index absent from the file, so running
 * the fix for the first problem would have caused the second — an undeclared index
 * is a financial endpoint one confirmation prompt away from breaking.
 *
 * These tests pin the declarations against the queries in server/routes.ts. They
 * cannot prove an index is DEPLOYED — only a live check does that, and that is why
 * the deploy step has its own verification.
 *
 * Run:  node --test tests/unit/firestore-index-declarations.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments } from "./_source.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");

const INDEXES = JSON.parse(readFileSync(join(root, "firestore.indexes.json"), "utf8"));
const ROUTES = stripComments(readFileSync(join(root, "server/routes.ts"), "utf8"));

/** One comparable line per declared index. */
const signature = (collectionGroup, fields) =>
  `${collectionGroup}: ` +
  fields.map((f) => `${f.fieldPath} ${f.order || f.arrayConfig}`).join(" , ");

const declared = new Set(
  INDEXES.indexes.map((i) => signature(i.collectionGroup, i.fields)),
);

/** The body of one route handler, so an assertion cannot match a neighbour. */
function handler(path) {
  const at = ROUTES.indexOf(`app.get("${path}"`);
  assert.notEqual(at, -1, `route moved or renamed: ${path}`);
  const next = ROUTES.indexOf("\n  app.", at + 10);
  return ROUTES.slice(at, next === -1 ? ROUTES.length : next);
}

// ─────────────────────────────────────────────────────────────────────────────
describe("Firestore indexes · the file is well formed", () => {
  test("it parses and every entry has a collection group and fields", () => {
    assert.ok(Array.isArray(INDEXES.indexes));
    for (const i of INDEXES.indexes) {
      assert.ok(i.collectionGroup, "an index has no collectionGroup");
      assert.equal(i.queryScope, "COLLECTION");
      assert.ok(Array.isArray(i.fields) && i.fields.length >= 2, `${i.collectionGroup}: an index needs at least two fields`);
      for (const f of i.fields) {
        assert.ok(f.fieldPath, "a field has no fieldPath");
        assert.ok(f.order || f.arrayConfig, `${f.fieldPath} has neither order nor arrayConfig`);
      }
    }
  });

  test("no index is declared twice", () => {
    const all = INDEXES.indexes.map((i) => signature(i.collectionGroup, i.fields));
    assert.equal(
      all.length,
      new Set(all).size,
      `duplicate declarations: ${all.filter((s, k) => all.indexOf(s) !== k).join(" | ")}`,
    );
  });
});

describe("Firestore indexes · every financial query has its index declared", () => {
  test("financial-reports: delivered orders ordered by date", () => {
    const body = handler("/api/admin/financial-reports");
    assert.match(body, /where\("status", "==", "delivered"\)/);
    assert.match(body, /orderBy\("createdAt", "desc"\)/);
    assert.ok(
      declared.has("orders: status ASCENDING , createdAt DESCENDING"),
      "an equality filter plus an orderBy on another field needs a composite index, and it is not declared",
    );
  });

  test("owner-earnings: the sum aggregate over delivered orders", () => {
    const body = handler("/api/admin/owner-earnings");
    assert.match(body, /where\("status", "==", "delivered"\)/);
    for (const field of ["deliveryFee", "driverEarning", "ownerEarning"]) {
      assert.match(body, new RegExp(`AggregateField\\.sum\\("${field}"\\)`), `${field} is no longer summed`);
    }
    assert.ok(
      declared.has(
        "orders: status ASCENDING , deliveryFee ASCENDING , driverEarning ASCENDING , ownerEarning ASCENDING",
      ),
      "the aggregate's index is undeclared — a firestore:indexes deploy would delete it and break owner-earnings",
    );
  });

  test("owner-earnings: the counted subset with an earning recorded", () => {
    const body = handler("/api/admin/owner-earnings");
    assert.match(body, /where\("driverEarning", "!=", null\)/);
    assert.ok(
      declared.has("orders: status ASCENDING , driverEarning ASCENDING"),
      "the inequality's index is undeclared — a firestore:indexes deploy would delete it",
    );
  });
});

describe("Firestore indexes · what the audit already relies on stays declared", () => {
  // Each of these backs a query an earlier finding was closed with. Losing the
  // declaration would not fail any other test, and the endpoint would only break
  // once someone deployed indexes.
  const required = [
    ["orders: vendorId ASCENDING , status ASCENDING , createdAt DESCENDING", "vendor order history"],
    ["orders: vendorIds CONTAINS , createdAt DESCENDING", "multi-vendor order lookup"],
    ["settlementPayments: accountKey ASCENDING , fifoApplied ASCENDING , createdAt DESCENDING", "H-24 FIFO settlement window"],
    ["settlements: accountKey ASCENDING , status ASCENDING , createdAt ASCENDING", "settlement state machine"],
    ["settlementRequests: status ASCENDING , createdAt DESCENDING", "settlement request queue"],
    ["settlementLedger: accountType ASCENDING , updatedAt DESCENDING", "ledger listing"],
  ];

  for (const [sig, why] of required) {
    test(`${why}`, () => {
      assert.ok(declared.has(sig), `missing declaration: ${sig}`);
    });
  }
});
