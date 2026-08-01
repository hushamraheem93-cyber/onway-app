/**
 * Financial ledger unit tests — the append-only typed ledger foundation.
 *
 * True unit tests against an in-memory fake Firestore (no credentials, runs in
 * CI). They pin the properties the whole financial system will rely on:
 *   • running balanceAfter = prev + credit − debit, computed atomically;
 *   • idempotency by deterministic entryId (replays never double-count);
 *   • a failed transaction reports "failed" and commits nothing;
 *   • amounts are clamped ≥ 0 and rounded.
 *
 * Run:  node --test tests/unit/financial-ledger.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  recordLedgerEntry,
  recordAudit,
  ledgerHeadId,
  orderEntryId,
} from "../../server/financialLedger.ts";

// ── Minimal in-memory Firestore double ───────────────────────────────────────
function makeFakeDb() {
  const store = new Map(); // "collection/docId" -> data
  let autoId = 0;

  const makeRef = (path) => ({ path, get _data() { return store.get(path); } });

  const db = {
    failNextTransaction: null,
    transactionAttempts: 0,
    added: [], // docs created via collection().add()

    collection(name) {
      return {
        doc: (id) => makeRef(`${name}/${id ?? `auto-${++autoId}`}`),
        async add(data) {
          const path = `${name}/auto-${++autoId}`;
          store.set(path, data);
          db.added.push({ path, data });
          return makeRef(path);
        },
      };
    },

    async runTransaction(fn) {
      db.transactionAttempts++;
      if (db.failNextTransaction) {
        const err = db.failNextTransaction;
        db.failNextTransaction = null;
        throw err;
      }
      const pending = [];
      const tx = {
        async get(ref) {
          const data = store.get(ref.path);
          return { exists: data !== undefined, data: () => data };
        },
        set(ref, data, opts) {
          pending.push({ ref, data, merge: !!(opts && opts.merge) });
        },
      };
      const result = await fn(tx);
      for (const w of pending) {
        const prev = w.merge ? store.get(w.ref.path) ?? {} : {};
        store.set(w.ref.path, { ...prev, ...w.data });
      }
      return result;
    },

    _get: (path) => store.get(path),
    _size: () => store.size,
  };
  return db;
}

const vendorCredit = (orderId, credit) => ({
  accountType: "vendor",
  accountId: "vendor-1",
  accountName: "Test Store",
  type: "order_sale",
  credit,
  orderId,
  entryId: orderEntryId(orderId, "vendor", "order_sale"),
  description: "بيع طلب",
});

describe("financial ledger", () => {
  test("a single entry records balanceAfter and updates the head", async () => {
    const db = makeFakeDb();
    const outcome = await recordLedgerEntry(vendorCredit("order-1", 18000), db);
    assert.equal(outcome, "recorded");

    const entry = db._get(`financialLedger/${orderEntryId("order-1", "vendor", "order_sale")}`);
    assert.equal(entry.credit, 18000);
    assert.equal(entry.debit, 0);
    assert.equal(entry.balanceAfter, 18000);

    const head = db._get(`financialLedgerHeads/${ledgerHeadId("vendor", "vendor-1")}`);
    assert.equal(head.balance, 18000);
    assert.equal(head.entryCount, 1);
  });

  test("running balance accumulates as prev + credit − debit", async () => {
    const db = makeFakeDb();
    await recordLedgerEntry(vendorCredit("order-1", 18000), db);
    // A settlement pays the vendor 10000 → debit reduces the balance.
    await recordLedgerEntry({
      accountType: "vendor", accountId: "vendor-1", type: "settlement",
      debit: 10000, settlementRef: "SET-1", entryId: "pay-1",
    }, db);
    await recordLedgerEntry(vendorCredit("order-2", 5000), db);

    const head = db._get(`financialLedgerHeads/${ledgerHeadId("vendor", "vendor-1")}`);
    assert.equal(head.balance, 13000); // 18000 − 10000 + 5000
    assert.equal(head.entryCount, 3);
  });

  test("idempotency: same entryId twice is a safe no-op", async () => {
    const db = makeFakeDb();
    const first = await recordLedgerEntry(vendorCredit("order-1", 18000), db);
    const second = await recordLedgerEntry(vendorCredit("order-1", 18000), db);
    assert.equal(first, "recorded");
    assert.equal(second, "duplicate");

    const head = db._get(`financialLedgerHeads/${ledgerHeadId("vendor", "vendor-1")}`);
    assert.equal(head.balance, 18000); // NOT 36000
    assert.equal(head.entryCount, 1);
  });

  test("a failed transaction reports 'failed' and commits nothing", async () => {
    const db = makeFakeDb();
    db.failNextTransaction = new Error("firestore blip");
    const outcome = await recordLedgerEntry(vendorCredit("order-1", 18000), db);
    assert.equal(outcome, "failed");
    assert.equal(db._size(), 0); // no entry, no head
  });

  test("amounts are clamped ≥ 0 and rounded", async () => {
    const db = makeFakeDb();
    await recordLedgerEntry({
      accountType: "driver", accountId: "07700000111", type: "penalty",
      debit: -50, credit: 1234.6, entryId: "adj-1",
    }, db);
    const entry = db._get("financialLedger/adj-1");
    assert.equal(entry.debit, 0);       // −50 clamped to 0
    assert.equal(entry.credit, 1235);   // rounded
    assert.equal(entry.balanceAfter, 1235);
  });

  test("missing database reports 'failed', never a silent success", async () => {
    const outcome = await recordLedgerEntry(vendorCredit("order-1", 18000), null);
    assert.equal(outcome, "failed");
  });

  test("audit log appends an immutable entry", async () => {
    const db = makeFakeDb();
    await recordAudit({
      action: "settlement.complete", actorName: "admin",
      targetType: "vendor", targetId: "vendor-1", amount: 10000, referenceId: "SET-1",
    }, db);
    assert.equal(db.added.length, 1);
    assert.equal(db.added[0].data.action, "settlement.complete");
    assert.equal(db.added[0].data.amount, 10000);
    assert.equal(db.added[0].data.actorType, "admin");
  });
});
