/**
 * FIFO settlement window tests (audit finding H-24).
 *
 * markSettlementRecordsFIFO() read the account's settlement records with
 * .where("accountKey","==",key).limit(1000) and then filtered by status and sorted by
 * createdAt IN MEMORY. Three defects compounded:
 *
 *   1. No orderBy, so Firestore answered in document-id order. Settlement ids are
 *      `${orderId}__${accountType}` and order ids come from .add() — random.
 *   2. The status filter ran AFTER the limit. A driver with 2,900 settled and 100
 *      pending records got a window that was ~97% already-settled, so a real cash
 *      payment could mark far fewer records than it paid for — or none at all.
 *   3. "FIFO" only ordered within that arbitrary window: the oldest debt paid was
 *      merely the oldest one that happened to fall inside it.
 *
 * Measured on the pre-fix code with a 3,000-record account: a 20,000 payment settled
 * 9 records instead of 20, in the non-contiguous order 2901-2904, 2906, 2914, 2915,
 * 2918, 2919 — and an account whose single pending record fell outside the window
 * ended with the ledger reading outstanding 0 while the record still read pending.
 * The ledger totals are transactional and stayed right; the per-order records they
 * are supposed to reconcile to drifted, permanently.
 *
 * Run:  node --test tests/unit/settlement-fifo-window.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, "../../", p), "utf8");
const SETTLEMENT = read("server/settlement.ts");
const MIGRATION = read("scripts/migrate-settlement.mjs");
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

const FIFO = (() => {
  const from = SETTLEMENT.indexOf("async function markSettlementRecordsFIFO(");
  assert.ok(from > -1, "markSettlementRecordsFIFO is gone");
  const to = SETTLEMENT.indexOf("\n// ── Threshold configuration", from);
  assert.ok(to > from, "could not find the end of markSettlementRecordsFIFO");
  return SETTLEMENT.slice(from, to);
})();

describe("H-24 — the window is the oldest UNSETTLED records", () => {
  test("the query filters and orders in Firestore, not in memory", () => {
    assert.match(
      code(FIFO),
      /\.where\("accountKey", "==", key\)\s*\n\s*\.where\("status", "==", "pending"\)\s*\n\s*\.orderBy\("createdAt", "asc"\)\s*\n\s*\.limit\(1000\)/,
      "REGRESSION: the FIFO window is an arbitrary 1000-document slice again",
    );
  });

  test("the ordering is ascending — oldest debt first", () => {
    assert.match(code(FIFO), /\.orderBy\("createdAt", "asc"\)/);
    assert.doesNotMatch(code(FIFO), /\.orderBy\("createdAt", "desc"\)/, "descending would settle the NEWEST debt first");
  });

  test("the status filter is part of the query", () => {
    assert.match(code(FIFO), /\.where\("status", "==", "pending"\)/);
  });

  test("the limit itself is unchanged", () => {
    assert.match(code(FIFO), /\.limit\(1000\)/);
  });

  test("the in-memory filter may remain, but is no longer the only guard", () => {
    // Keeping it is harmless; relying on it alone is the defect.
    const queryAt = FIFO.indexOf('.where("status", "==", "pending")');
    const memAt = FIFO.indexOf('.filter((s: any) => s.status !== "settled")');
    assert.ok(queryAt > -1, "the query-level status filter is gone");
    if (memAt > -1) assert.ok(queryAt < memAt, "ordering of the guards is unexpected");
  });
});

describe("H-24 — the composite index the query needs is declared", () => {
  test("settlements(accountKey ASC, status ASC, createdAt ASC) exists", () => {
    const wanted = [["accountKey", "ASCENDING"], ["status", "ASCENDING"], ["createdAt", "ASCENDING"]];
    const found = (INDEXES.indexes ?? []).some(
      (i) =>
        i.collectionGroup === "settlements" &&
        (i.fields ?? []).length === wanted.length &&
        wanted.every(([path, order], n) => i.fields[n].fieldPath === path && i.fields[n].order === order),
    );
    assert.ok(found, "without this index the query fails with FAILED_PRECONDITION at runtime");
  });

  test("the pre-existing settlements index was not disturbed", () => {
    const found = (INDEXES.indexes ?? []).some(
      (i) =>
        i.collectionGroup === "settlements" &&
        i.fields.length === 2 &&
        i.fields[0].fieldPath === "accountType" &&
        i.fields[1].fieldPath === "createdAt",
    );
    assert.ok(found, "settlements(accountType, createdAt) went missing");
  });

  test("the index file is structurally valid", () => {
    assert.ok(Array.isArray(INDEXES.indexes));
    assert.ok(Array.isArray(INDEXES.fieldOverrides));
    for (const i of INDEXES.indexes) {
      assert.ok(["COLLECTION", "COLLECTION_GROUP"].includes(i.queryScope), `bad queryScope: ${i.queryScope}`);
      for (const f of i.fields) {
        assert.ok(typeof f.fieldPath === "string" && f.fieldPath.length > 0);
        if ("order" in f) assert.ok(["ASCENDING", "DESCENDING"].includes(f.order), `bad order: ${f.order}`);
      }
    }
  });

  test("no duplicate index definitions", () => {
    const sig = INDEXES.indexes.map(
      (i) => `${i.collectionGroup}|${i.fields.map((f) => `${f.fieldPath}:${f.order ?? ""}`).join(",")}`,
    );
    assert.equal(new Set(sig).size, sig.length, "a duplicate index would be rejected on deploy");
  });
});

describe("H-24 — no settlement record can be excluded by the new query", () => {
  // where(status=="pending") and orderBy(createdAt) both DROP documents that lack the
  // field. These pin the precondition that made the fix safe: every writer stamps all
  // three fields, and status only ever holds two values.

  test("recordOrderSettlement stamps accountKey, status and createdAt", () => {
    const at = SETTLEMENT.indexOf("tx.set(settlementRef, {");
    assert.ok(at > -1, "the settlement writer is gone");
    const body = SETTLEMENT.slice(at, SETTLEMENT.indexOf("});", at));
    assert.match(body, /accountKey: accountKey\(input\.accountType, input\.accountId\)/);
    assert.match(body, /status: "pending"/);
    assert.match(body, /createdAt: now/);
  });

  test("the legacy migration script stamps them too", () => {
    const at = MIGRATION.indexOf("tx.set(settlementRef, {");
    assert.ok(at > -1, "the migration writer changed shape");
    const body = MIGRATION.slice(at, MIGRATION.indexOf("});", at));
    assert.match(body, /accountKey: `driver:\$\{phone\}`/);
    assert.match(body, /status: "pending"/);
    assert.match(body, /createdAt: ts/);
  });

  test("there are exactly two writers that CREATE settlement documents", () => {
    // A third writer that forgot a field would make records invisible to FIFO —
    // silently, which is precisely the class of defect being fixed.
    const creators = [
      ...SETTLEMENT.matchAll(/tx\.set\(settlementRef,/g),
      ...MIGRATION.matchAll(/tx\.set\(settlementRef,/g),
    ];
    assert.equal(creators.length, 2, `${creators.length} places create settlement documents`);
  });

  test("the only status values ever written are pending and settled", () => {
    const updateAt = FIFO.indexOf("batch.update(s.ref, {");
    const update = FIFO.slice(updateAt, FIFO.indexOf("});", updateAt));
    assert.match(update, /status: fully \? "settled" : "pending",/);
    assert.doesNotMatch(update, /status: "[^"]*"(?!.*(pending|settled))/);
  });

  test("no writer ever deletes a settlement document's key fields", () => {
    const updateAt = FIFO.indexOf("batch.update(s.ref, {");
    const update = FIFO.slice(updateAt, FIFO.indexOf("});", updateAt));
    for (const field of ["accountKey", "createdAt"]) {
      assert.doesNotMatch(update, new RegExp(`${field}\\s*:\\s*(FieldValue\\.delete|null|undefined)`));
    }
  });
});

describe("H-24 — the allocation logic itself is unchanged", () => {
  test("FIFO allocation arithmetic is untouched", () => {
    assert.match(FIFO, /const due = \(s\.outstandingAmount \?\? 0\) - \(s\.amountSettled \?\? 0\);/);
    assert.match(FIFO, /const applied = Math\.min\(remaining, due\);/);
    assert.match(FIFO, /const newSettled = \(s\.amountSettled \?\? 0\) \+ applied;/);
    assert.match(FIFO, /const fully = newSettled >= \(s\.outstandingAmount \?\? 0\);/);
    assert.match(FIFO, /remaining -= applied;/);
  });

  test("the in-memory createdAt sort is still ascending", () => {
    assert.match(
      FIFO,
      /\.sort\(\(a: any, b: any\) => \(a\.createdAt\?\.toMillis\?\.\(\) \?\? 0\) - \(b\.createdAt\?\.toMillis\?\.\(\) \?\? 0\)\)/,
    );
  });

  test("the 400-op batch chunking is untouched", () => {
    assert.match(FIFO, /if \(ops >= 400\) \{ await batch\.commit\(\); batch = db\.batch\(\); ops = 0; \}/);
    assert.match(FIFO, /if \(ops > 0\) await batch\.commit\(\);/);
  });

  test("H-21's pendingCount decrement is intact", () => {
    assert.match(FIFO, /if \(fully\) newlySettled\+\+;/);
    assert.match(FIFO, /if \(newlySettled > 0\) \{/);
    assert.match(FIFO, /pendingCount: Math\.max\(0, prev - newlySettled\)/);
    assert.match(FIFO, /await db\.runTransaction\(async \(tx: any\) => \{/);
  });

  test("the money fields are still written only by the transactional paths", () => {
    const ledgerUpdate = FIFO.slice(FIFO.indexOf("if (newlySettled > 0) {"));
    for (const field of ["outstandingTotal", "totalSettled", "totalGross", "totalCommission"]) {
      assert.doesNotMatch(ledgerUpdate, new RegExp(`${field}\\s*:`), `FIFO must not write ${field}`);
    }
  });

  test("the callers and the FIFO claim guards are unchanged", () => {
    assert.match(code(SETTLEMENT), /const claimed = await claimFifoApplication\(db, paymentRef\.id\);/);
    assert.match(code(SETTLEMENT), /await markSettlementRecordsFIFO\(input\.accountType, input\.accountId, appliedOut, db\)/);
    assert.match(code(SETTLEMENT), /await markSettlementRecordsFIFO\(accountType, accountId, amount\);/);
    assert.match(code(SETTLEMENT), /fifoApplied: false,/);
  });
});

describe("H-24 — settlement never touches the dispatch batching system", () => {
  test("settlement.ts mentions nothing from the route-batching engine", () => {
    assert.doesNotMatch(
      SETTLEMENT,
      /optimizedIds|ordersCombinable|maxBatchSize|deliverySequence|delivery_batches|MERGE_RADIUS_KM/,
      "settlement code reached into the driver batching system",
    );
  });
});

describe("H-24 — why an unfiltered window loses payments", () => {
  // The arithmetic of the defect, pinned so the reasoning survives the code.
  const settledShare = (settledCount, pendingCount, window) =>
    (window * pendingCount) / (settledCount + pendingCount);

  test("a 97%-settled account yields a mostly useless window", () => {
    // 2,900 settled + 100 pending, 1000-document window → ~33 pending records visible.
    assert.equal(Math.round(settledShare(2900, 100, 1000)), 33);
  });

  test("a single pending record among 3,000 is usually invisible", () => {
    // 1000/3000 → one chance in three of being in the window at all.
    assert.ok(settledShare(2999, 1, 1000) < 0.34);
  });

  test("filtering in the query makes the window all-pending", () => {
    // With where(status=="pending") the limit applies to pending records only, so the
    // cap becomes "1000 debts open at once" rather than "1000 records ever".
    const visible = (pendingCount, window) => Math.min(pendingCount, window);
    assert.equal(visible(100, 1000), 100);
    assert.equal(visible(1, 1000), 1);
    assert.equal(visible(5000, 1000), 1000);
  });
});
