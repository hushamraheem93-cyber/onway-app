/**
 * Vendor order scoping tests (audit finding H-34).
 *
 * Three vendor endpoints could not query their own orders. A modern order carries a
 * top-level `vendorId`; a marketplace order carries the vendor only inside
 * `items[].productId`, which no where() can reach. So all three read the newest N
 * orders PLATFORM-WIDE — 300, 2000 and 1000 — and filtered them in JavaScript.
 *
 * That is a cost problem (40 stores polling every 30s ≈ 160k document reads/minute)
 * and, worse, a correctness problem: once the platform passes N orders in the
 * window, a store's real orders fall out of it and its revenue silently shrinks
 * month after month.
 *
 * The fix adds one additive field, `vendorIds: string[]`, holding every vendor with
 * a stake in the order — the union of the top-level vendorId and the owners of the
 * items' products. The three queries now filter on it with array-contains, so each
 * window is per-store instead of global.
 *
 * These tests run the migration's REAL computeVendorIds against the order shapes
 * this codebase actually produces, and assert the query shape against the shipped
 * source. Nothing here touches Firestore.
 *
 * Run:  node --test tests/unit/vendor-order-scope.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments as sharedStripComments } from "./_source.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const { computeVendorIds } = await import("../../scripts/compute-vendor-ids.mjs");
const VENDOR = readFileSync(join(here, "../../server/vendor.ts"), "utf8");
const INDEXES = JSON.parse(readFileSync(join(here, "../../firestore.indexes.json"), "utf8"));
const strip = sharedStripComments;
const CLEAN = strip(VENDOR);

/** productId → owning vendor, the shape the migration builds from vendorProducts. */
const owners = new Map([
  ["p-alpha-1", "vendor-alpha"],
  ["p-alpha-2", "vendor-alpha"],
  ["p-beta-1", "vendor-beta"],
]);

describe("H-34 · vendorIds is computed exactly as the old JS filter decided", () => {
  test("a modern order with a top-level vendorId", () => {
    assert.deepEqual(
      computeVendorIds({ vendorId: "vendor-alpha", items: [] }, owners),
      ["vendor-alpha"],
    );
  });

  test("a legacy order carrying the vendor only inside items", () => {
    assert.deepEqual(
      computeVendorIds({ items: [{ productId: "p-beta-1", qty: 2 }] }, owners),
      ["vendor-beta"],
      "the legacy order that the where() query could never find is now queryable",
    );
  });

  test("an order spanning several stores lists every one of them", () => {
    assert.deepEqual(
      computeVendorIds({
        items: [{ productId: "p-alpha-1" }, { productId: "p-beta-1" }],
      }, owners),
      ["vendor-alpha", "vendor-beta"],
    );
  });

  test("repeated products from one store do not repeat the vendor", () => {
    assert.deepEqual(
      computeVendorIds({
        vendorId: "vendor-alpha",
        items: [{ productId: "p-alpha-1" }, { productId: "p-alpha-2" }, { productId: "p-alpha-1" }],
      }, owners),
      ["vendor-alpha"],
      "array-contains would still work, but a duplicated array wastes index entries",
    );
  });

  test("an order with no resolvable vendor stays empty, matching nobody", () => {
    // Exactly today's behaviour: it matches no vendor in the JS filter either.
    assert.deepEqual(computeVendorIds({ items: [{ productId: "unknown" }] }, owners), []);
    assert.deepEqual(computeVendorIds({}, owners), []);
    assert.deepEqual(computeVendorIds({ items: null }, owners), []);
  });

  test("malformed input does not throw", () => {
    for (const bad of [null, undefined, { items: "nope" }, { vendorId: 42 },
      { items: [null, {}, { productId: "" }, { productId: 7 }] }]) {
      assert.doesNotThrow(() => computeVendorIds(bad, owners));
    }
  });

  test("blank and padded vendor ids are normalised, not stored raw", () => {
    assert.deepEqual(computeVendorIds({ vendorId: "   " }, owners), []);
    assert.deepEqual(computeVendorIds({ vendorId: " vendor-alpha " }, owners), ["vendor-alpha"]);
  });

  test("the result is sorted, so re-running writes an identical value", () => {
    const a = computeVendorIds({ items: [{ productId: "p-beta-1" }, { productId: "p-alpha-1" }] }, owners);
    const b = computeVendorIds({ items: [{ productId: "p-alpha-1" }, { productId: "p-beta-1" }] }, owners);
    assert.deepEqual(a, b);
    assert.deepEqual(a, [...a].sort());
  });
});

describe("H-34 · the switch is done, and its preconditions were met first", () => {
  // This block previously asserted the OPPOSITE — that no query had switched yet.
  // The scoped query could not ship before the backfill: an order without vendorIds
  // does not come back from it, and the item-level recovery pass iterates THAT
  // snapshot, so the order vanished from the dashboard. An early attempt broke
  // h22-live ("الطلب المملوك عبر العنصر ظهر → غائب").
  //
  // Both preconditions are now satisfied against production onway-74c20: the
  // orders/vendorIds CONTAINS + createdAt DESC index reports READY, and
  // scripts/backfill-order-vendor-ids.mjs reports "would change: 0" with 3/3 orders
  // carrying a correct, sorted, deduplicated value.
  test("the item-level recovery pass is intact", () => {
    assert.match(CLEAN, /vendorProductIds\.has\(item\.productId\)/,
      "orders owned only through their items would disappear");
  });

  test("the direct vendorId query is intact — the safety net beside every switch", () => {
    assert.match(CLEAN, /where\("vendorId", "==", vid\)/);
  });

  test("all three sites now query by vendorIds", () => {
    const switched = CLEAN.match(/where\("vendorIds", "array-contains", vid\)/g) ?? [];
    assert.equal(switched.length, 3,
      `expected all three sites switched, found ${switched.length}`);
  });

  test("no staging note is left behind", () => {
    // Checked on the RAW source: these are comments, which CLEAN has stripped.
    assert.equal((VENDOR.match(/H-34 \(STAGED/g) ?? []).length, 0,
      "a site still claims to be staged after the switch");
    assert.equal((VENDOR.match(/H-34 \(SWITCHED/g) ?? []).length, 3,
      "each switched site should record that it switched, and why it was safe to");
  });

  test("⚑ no unfiltered platform-wide scan of `orders` survives in vendor.ts", () => {
    // The whole point of H-34: every read of the orders collection is scoped to one
    // store. A bare .collection("orders").orderBy(...) is the regression to catch.
    const offenders = [];
    const re = /db\.collection\("orders"\)([\s\S]{0,200})/g;
    let m;
    while ((m = re.exec(CLEAN))) {
      const tail = m[1];
      // .doc(...) is a single-document read, not a scan.
      if (/^\s*\.doc\(/.test(tail)) continue;
      const upToGet = tail.slice(0, tail.indexOf(".get()") + 6);
      if (!/\.where\(/.test(upToGet)) {
        offenders.push(CLEAN.slice(0, m.index).split("\n").length);
      }
    }
    assert.deepEqual(offenders, [],
      `platform-wide orders scan(s) at line(s): ${offenders.join(", ")}`);
  });

  test("each scoped query keeps its original ordering and limit", () => {
    for (const lim of ["300", "ORDER_SCAN_LIMIT", "1000"]) {
      const re = new RegExp(
        `where\\("vendorIds", "array-contains", vid\\)[\\s\\S]{0,120}?\\.orderBy\\("createdAt", "desc"\\)[\\s\\S]{0,60}?\\.limit\\(${lim}\\)`);
      assert.match(CLEAN, re, `the site limited to ${lim} lost its ordering or limit`);
    }
  });
});

describe("H-34 · the index that makes the new query possible", () => {
  test("orders vendorIds CONTAINS + createdAt DESC is declared", () => {
    const found = INDEXES.indexes.find(
      (i) =>
        i.collectionGroup === "orders" &&
        i.fields.some((f) => f.fieldPath === "vendorIds" && f.arrayConfig === "CONTAINS") &&
        i.fields.some((f) => f.fieldPath === "createdAt" && f.order === "DESCENDING"),
    );
    assert.ok(found, "the array-contains index is missing — the query returns FAILED_PRECONDITION");
  });

  test("no previously declared index was removed", () => {
    // The backfill must not have cost us an index the earlier rounds added.
    for (const [cg, field] of [
      ["settlements", "accountKey"], ["settlementRequests", "status"],
      ["settlementLedger", "accountType"], ["settlementPayments", "accountKey"],
      ["vendorNotifications", "vendorId"], ["orders", "vendorId"],
    ]) {
      assert.ok(
        INDEXES.indexes.some(
          (i) => i.collectionGroup === cg && i.fields.some((f) => f.fieldPath === field),
        ),
        `the ${cg}/${field} index disappeared`,
      );
    }
  });
});

describe("H-34 · the migration is safe by construction", () => {
  const MIG = readFileSync(join(here, "../../scripts/backfill-order-vendor-ids.mjs"), "utf8");
  const M = strip(MIG);

  test("it writes nothing without --apply", () => {
    assert.match(M, /const APPLY = process\.argv\.includes\("--apply"\)/);
    assert.match(M, /if \(APPLY\)/, "writes are not gated on the flag");
  });

  test("it never deletes a document", () => {
    assert.doesNotMatch(M, /\.delete\(\)(?!\s*\})/,
      "a document delete appears in the migration");
    assert.doesNotMatch(M, /batch\.delete\(/);
  });

  test("it only ever updates the one new field", () => {
    const updates = M.match(/batch\.update\([^)]*\)/g) ?? [];
    assert.ok(updates.length > 0, "no update call found");
    for (const u of updates) {
      assert.match(u, /vendorIds/, `an update touches something else: ${u}`);
      for (const protectedField of ["items", "total", "status", "vendorId:", "createdAt"]) {
        assert.ok(!u.includes(protectedField), `an update writes ${protectedField}: ${u}`);
      }
    }
  });

  test("it is idempotent — an unchanged value is skipped", () => {
    assert.match(M, /sameArray\(data\.vendorIds, next\)/,
      "a re-run would rewrite every document");
  });

  test("a rollback path exists and removes only the new field", () => {
    assert.match(M, /--rollback/);
    assert.match(M, /vendorIds: admin\.firestore\.FieldValue\.delete\(\)/,
      "rollback does not remove the field cleanly");
  });

  test("it reports the count before writing anything", () => {
    assert.match(M, /would change/, "the operator gets no pre-write count");
  });
});
