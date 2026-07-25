/**
 * Settlement consistency tests.
 *
 * Covers the HIGH issue from REVIEW_REPORT.md: a transient Firestore failure used
 * to be indistinguishable from the idempotent no-op, so a failed accrual was
 * silently and permanently lost.
 *
 * These are true unit tests — they run against an in-memory fake Firestore and
 * need NO credentials, so they execute in CI. Determinism comes from driving the
 * fake's failure switch directly rather than hoping to hit a real race.
 *
 * Run:  node --test tests/unit/settlement-consistency.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  recordOrderSettlement,
  retryOrderSettlements,
  settlementId,
  ledgerId,
} from "../../server/settlement.ts";

// ── Minimal in-memory Firestore double ───────────────────────────────────────
// Implements only what recordOrderSettlement touches: collection().doc(),
// runTransaction() with tx.get/tx.set, and doc snapshots exposing .exists/.data().
function makeFakeDb() {
  const store = new Map(); // "collection/docId" -> data

  const makeRef = (path) => ({
    path,
    get _data() {
      return store.get(path);
    },
  });

  const db = {
    // Set to an Error to make the NEXT transaction throw (simulates a transient
    // Firestore failure: contention, network blip, quota).
    failNextTransaction: null,
    transactionAttempts: 0,
    committedWrites: 0,

    collection(name) {
      return { doc: (id) => makeRef(`${name}/${id}`) };
    },

    async runTransaction(fn) {
      db.transactionAttempts++;
      if (db.failNextTransaction) {
        const err = db.failNextTransaction;
        db.failNextTransaction = null; // fail once, then recover
        throw err;
      }
      // Buffer writes so a throw mid-transaction commits nothing (atomicity).
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
        db.committedWrites++;
      }
      return result;
    },

    // helpers for assertions
    _get: (path) => store.get(path),
    _size: () => store.size,
  };
  return db;
}

const driverInput = (orderId = "order-1") => ({
  accountType: "driver",
  accountId: "07700000111",
  accountName: "Test Driver",
  orderId,
  storeId: "vendor-1",
  storeName: "Test Store",
  grossAmount: 25000,
  commission: 3000,
  outstandingAmount: 22000,
});

const vendorInput = (orderId = "order-1") => ({
  accountType: "vendor",
  accountId: "vendor-1",
  accountName: "Test Store",
  orderId,
  storeId: "vendor-1",
  storeName: "Test Store",
  grossAmount: 20000,
  commission: 2000,
  outstandingAmount: 18000,
});

describe("settlement consistency", () => {
  // ── 1. Successful settlement ───────────────────────────────────────────────
  test("successful settlement records the accrual and rolls it into the ledger", async () => {
    const db = makeFakeDb();

    const outcome = await recordOrderSettlement(driverInput(), db);

    assert.equal(outcome, "recorded", 'first write must report "recorded"');

    const settlement = db._get(`settlements/${settlementId("order-1", "driver")}`);
    assert.ok(settlement, "settlement document must exist");
    assert.equal(settlement.grossAmount, 25000);
    assert.equal(settlement.commission, 3000);
    assert.equal(settlement.outstandingAmount, 22000);
    assert.equal(settlement.status, "pending");

    const ledger = db._get(`settlementLedger/${ledgerId("driver", "07700000111")}`);
    assert.ok(ledger, "ledger document must exist");
    assert.equal(ledger.totalOrders, 1);
    assert.equal(ledger.totalGross, 25000);
    assert.equal(ledger.outstandingTotal, 22000);
  });

  // ── 2. Transient Firestore failure ─────────────────────────────────────────
  test('transient failure returns "failed" and writes nothing', async () => {
    const db = makeFakeDb();
    db.failNextTransaction = new Error("DEADLINE_EXCEEDED: transient");

    const outcome = await recordOrderSettlement(driverInput(), db);

    assert.equal(
      outcome,
      "failed",
      'a failed write must report "failed", never the same value as a duplicate',
    );
    assert.equal(db._size(), 0, "nothing may be persisted when the transaction throws");
    assert.equal(db.committedWrites, 0, "no partial writes may commit");
  });

  test('"failed" is distinguishable from "duplicate" (the original bug)', async () => {
    const db = makeFakeDb();

    await recordOrderSettlement(driverInput(), db); // recorded
    const duplicate = await recordOrderSettlement(driverInput(), db);

    db.failNextTransaction = new Error("UNAVAILABLE");
    const failed = await recordOrderSettlement(driverInput("order-2"), db);

    assert.equal(duplicate, "duplicate");
    assert.equal(failed, "failed");
    assert.notEqual(
      duplicate,
      failed,
      "duplicate and failed must not collapse to one value — that is what lost money",
    );
  });

  // ── 3. Retry after a transient failure ─────────────────────────────────────
  test("retry after a transient failure settles the order", async () => {
    const db = makeFakeDb();
    db.failNextTransaction = new Error("ABORTED: contention");

    const first = await recordOrderSettlement(driverInput(), db);
    assert.equal(first, "failed");
    assert.equal(db._size(), 0);

    // Recovery sweep replays the stored inputs.
    const allSettled = await retryOrderSettlements([driverInput()], db);

    assert.equal(allSettled, true, "retry must report full settlement");
    const ledger = db._get(`settlementLedger/${ledgerId("driver", "07700000111")}`);
    assert.equal(ledger.totalOrders, 1, "money must be accrued exactly once after recovery");
    assert.equal(ledger.outstandingTotal, 22000);
  });

  test("retry reports failure while Firestore is still down, so the sweep keeps the flag", async () => {
    const db = makeFakeDb();
    db.failNextTransaction = new Error("UNAVAILABLE");

    const allSettled = await retryOrderSettlements([driverInput()], db);

    assert.equal(allSettled, false, "must not claim success while the write is failing");
    assert.equal(db._size(), 0);
  });

  // ── 4. Duplicate completion request ────────────────────────────────────────
  test("duplicate completion never double-counts the ledger", async () => {
    const db = makeFakeDb();

    const a = await recordOrderSettlement(driverInput(), db);
    const b = await recordOrderSettlement(driverInput(), db);
    const c = await recordOrderSettlement(driverInput(), db);

    assert.equal(a, "recorded");
    assert.equal(b, "duplicate");
    assert.equal(c, "duplicate");

    const ledger = db._get(`settlementLedger/${ledgerId("driver", "07700000111")}`);
    assert.equal(ledger.totalOrders, 1, "three completions must accrue exactly once");
    assert.equal(ledger.totalGross, 25000);
    assert.equal(ledger.outstandingTotal, 22000);
  });

  test("repeated recovery sweeps are idempotent", async () => {
    const db = makeFakeDb();
    const inputs = [driverInput(), vendorInput()];

    await retryOrderSettlements(inputs, db);
    await retryOrderSettlements(inputs, db); // sweep runs again before the flag clears
    await retryOrderSettlements(inputs, db);

    const driverLedger = db._get(`settlementLedger/${ledgerId("driver", "07700000111")}`);
    const vendorLedger = db._get(`settlementLedger/${ledgerId("vendor", "vendor-1")}`);
    assert.equal(driverLedger.totalOrders, 1, "driver accrued once despite 3 sweeps");
    assert.equal(vendorLedger.totalOrders, 1, "vendor accrued once despite 3 sweeps");
    assert.equal(vendorLedger.outstandingTotal, 18000);
  });

  // ── 5. Partial failure: one account lands, the other does not ──────────────
  test("partial failure settles the survivor and retries only the missing account", async () => {
    const db = makeFakeDb();

    const driverOutcome = await recordOrderSettlement(driverInput(), db);
    db.failNextTransaction = new Error("UNAVAILABLE");
    const vendorOutcome = await recordOrderSettlement(vendorInput(), db);

    assert.equal(driverOutcome, "recorded");
    assert.equal(vendorOutcome, "failed");

    // Sweep replays BOTH inputs — the driver one must not double-count.
    const allSettled = await retryOrderSettlements([driverInput(), vendorInput()], db);
    assert.equal(allSettled, true);

    const driverLedger = db._get(`settlementLedger/${ledgerId("driver", "07700000111")}`);
    const vendorLedger = db._get(`settlementLedger/${ledgerId("vendor", "vendor-1")}`);
    assert.equal(driverLedger.totalOrders, 1, "already-settled driver must stay at exactly 1");
    assert.equal(vendorLedger.totalOrders, 1, "vendor must now be settled");
  });

  // ── 6. Database unavailable ────────────────────────────────────────────────
  test('missing database reports "failed", not a silent success', async () => {
    const outcome = await recordOrderSettlement(driverInput(), null);
    assert.equal(outcome, "failed");
  });
});
