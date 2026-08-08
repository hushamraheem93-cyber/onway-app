/**
 * Settlement idempotency + FIFO concurrency tests (audit findings C-08 / C-09).
 *
 * C-08: completeSettlement() only deduplicated when the CALLER supplied a
 *       requestId or idempotencyKey. The two legacy driver-wallet endpoints and
 *       manual settlements supplied neither, so the payment document got a random
 *       id and the whole idempotency block was skipped: a retried 50,000 IQD cash
 *       hand-over wiped 100,000 off the driver's debt.
 *
 * C-09: markSettlementRecordsFIFO() INCREMENTS amountSettled — it is not
 *       idempotent — and `fifoApplied` was stamped AFTER distributing, so a second
 *       admin settling the same account could distribute the first payment twice.
 *
 * These are true unit tests: they run against an in-memory Firestore double and
 * need no credentials.
 *
 * Run:  node --test tests/unit/settlement-idempotency.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  completeSettlement,
  adminAdjustLedger,
  autoIdempotencyIds,
  adjustmentIdempotencyIds,
  settlementPaymentId,
  ledgerId,
  AUTO_IDEMPOTENCY_WINDOW_MS,
} from "../../server/settlement.ts";

// ── Firestore double ─────────────────────────────────────────────────────────
// Transactions are SERIALIZED through a promise chain. Real Firestore
// transactions are serializable (contention is resolved by abort + retry), so
// modelling them as "one at a time" is the correct semantic — it lets these tests
// prove the read-then-conditional-write logic is genuinely compare-and-set rather
// than a check-then-act spread across two transactions.
function makeFakeDb() {
  const store = new Map();
  let chain = Promise.resolve();

  const makeRef = (path) => ({
    path,
    get id() {
      return path.split("/").slice(1).join("/");
    },
    async set(data, opts) {
      const prev = opts && opts.merge ? (store.get(path) ?? {}) : {};
      store.set(path, { ...prev, ...data });
    },
  });

  const db = {
    transactions: 0,
    batch() {
      const ops = [];
      return {
        update: (ref, data) => ops.push({ ref, data }),
        set: (ref, data) => ops.push({ ref, data }),
        async commit() {
          for (const o of ops) store.set(o.ref.path, { ...(store.get(o.ref.path) ?? {}), ...o.data });
        },
      };
    },
    collection(name) {
      return {
        doc: (id) => makeRef(`${name}/${id}`),
        // markSettlementRecordsFIFO issues a where/limit query; return empty so it
        // is a no-op here (per-record FIFO allocation is not what these tests cover).
        where() {
          return this;
        },
        orderBy() {
          return this;
        },
        limit() {
          return this;
        },
        async get() {
          return { empty: true, docs: [] };
        },
      };
    },
    runTransaction(fn) {
      const run = async () => {
        db.transactions++;
        const pending = [];
        const tx = {
          async get(ref) {
            const data = store.get(ref.path);
            return { exists: data !== undefined, data: () => data };
          },
          set(ref, data, opts) {
            pending.push({ ref, data, merge: !!(opts && opts.merge) });
          },
          update(ref, data) {
            pending.push({ ref, data, merge: true });
          },
        };
        const result = await fn(tx);
        for (const w of pending) {
          const prev = w.merge ? (store.get(w.ref.path) ?? {}) : {};
          store.set(w.ref.path, { ...prev, ...w.data });
        }
        return result;
      };
      // Serialize: each transaction observes every earlier one's committed writes.
      const queued = chain.then(run, run);
      chain = queued.then(
        () => {},
        () => {},
      );
      return queued;
    },
    _get: (p) => store.get(p),
    _keys: () => [...store.keys()],
    _count: (prefix) => [...store.keys()].filter((k) => k.startsWith(prefix)).length,
  };
  return db;
}

function seedLedger(db, { accountType = "driver", accountId = "07700000001", outstanding = 50000 } = {}) {
  const id = ledgerId(accountType, accountId);
  db._get(`settlementLedger/${id}`); // touch
  db.collection("settlementLedger").doc(id).set({
    accountType,
    accountId,
    accountName: "سائق تجريبي",
    outstandingTotal: outstanding,
    totalSettled: 0,
    pendingCount: 1,
  });
  return { accountType, accountId, id };
}

const basePayment = (over = {}) => ({
  accountType: "driver",
  accountId: "07700000001",
  amount: 50000,
  adminName: "admin",
  method: "cash",
  notes: "دفعة نقدية",
  ...over,
});

describe("C-08 — payment idempotency without a caller-supplied key", () => {
  test("a single payment applies exactly once", async () => {
    const db = makeFakeDb();
    seedLedger(db);
    const res = await completeSettlement(basePayment(), db);
    assert.equal(res.ok, true);
    assert.equal(res.duplicate, undefined);
    assert.equal(res.applied, 50000);
    assert.equal(res.outstandingAfter, 0);
    assert.equal(db._get("settlementLedger/driver:07700000001").outstandingTotal, 0);
    assert.equal(db._count("settlementPayments/"), 1);
  });

  test("the SAME request sent twice pays once and replays the first result", async () => {
    const db = makeFakeDb();
    seedLedger(db);
    const first = await completeSettlement(basePayment(), db);
    const second = await completeSettlement(basePayment(), db);

    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(second.duplicate, true, "second call must be reported as a replay");
    // The money moved exactly once.
    assert.equal(db._get("settlementLedger/driver:07700000001").outstandingTotal, 0);
    assert.equal(db._count("settlementPayments/"), 1, "only one payment document");
    // The replay returns the ORIGINAL outcome, not a fresh one.
    assert.equal(second.applied, first.applied);
    assert.equal(second.receiptNumber, first.receiptNumber);
    assert.equal(second.outstandingAfter, first.outstandingAfter);
  });

  test("two CONCURRENT identical requests pay once", async () => {
    const db = makeFakeDb();
    seedLedger(db, { outstanding: 50000 });
    const [a, b] = await Promise.all([
      completeSettlement(basePayment(), db),
      completeSettlement(basePayment(), db),
    ]);
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    assert.equal(
      [a.duplicate, b.duplicate].filter(Boolean).length,
      1,
      "exactly one of the two concurrent calls must be a replay",
    );
    assert.equal(db._get("settlementLedger/driver:07700000001").outstandingTotal, 0);
    assert.equal(db._count("settlementPayments/"), 1);
  });

  test("retry after a timeout does not double-pay (partial settlement stays partial)", async () => {
    const db = makeFakeDb();
    seedLedger(db, { outstanding: 100000 });
    const p = basePayment({ amount: 30000 });
    const first = await completeSettlement(p, db); // response "lost" to a timeout
    const retry = await completeSettlement(p, db); // operator hits settle again

    assert.equal(first.outstandingAfter, 70000);
    assert.equal(retry.duplicate, true);
    assert.equal(
      db._get("settlementLedger/driver:07700000001").outstandingTotal,
      70000,
      "a retry must not deduct a second 30,000",
    );
    assert.equal(db._count("settlementPayments/"), 1);
  });

  test("a genuinely different payment is still recorded (dedup is not over-broad)", async () => {
    const db = makeFakeDb();
    seedLedger(db, { outstanding: 100000 });
    await completeSettlement(basePayment({ amount: 30000 }), db);
    const other = await completeSettlement(basePayment({ amount: 20000 }), db);
    assert.equal(other.duplicate, undefined, "different amount = different payment");
    assert.equal(db._get("settlementLedger/driver:07700000001").outstandingTotal, 50000);
    assert.equal(db._count("settlementPayments/"), 2);
  });

  test("an explicit requestId still wins and stays time-independent", () => {
    const withReq = settlementPaymentId(basePayment({ requestId: "REQ1" }));
    assert.equal(withReq, "stl_req_REQ1");
    // No explicit key → derived ids, which DO carry a window.
    assert.equal(settlementPaymentId(basePayment()), null);
  });

  test("derived ids cover the current AND previous window, so a boundary retry still collides", () => {
    const now = 10 * AUTO_IDEMPOTENCY_WINDOW_MS; // exactly on a boundary
    const justBefore = autoIdempotencyIds(basePayment(), now - 1);
    const atBoundary = autoIdempotencyIds(basePayment(), now);
    // The call just before the boundary wrote its id as its CURRENT window; the
    // call at the boundary checks that same id as its PREVIOUS window.
    assert.equal(atBoundary[1], justBefore[0], "previous-window id must match");
    assert.notEqual(atBoundary[0], justBefore[0]);
  });

  test("payments far apart in time are independent", () => {
    const p = basePayment();
    const morning = autoIdempotencyIds(p, 0);
    const evening = autoIdempotencyIds(p, 8 * 60 * 60 * 1000);
    assert.equal(morning.some((id) => evening.includes(id)), false);
  });
});

describe("C-08 — manual ledger adjustment idempotency", () => {
  test("a double-tapped adjustment moves the balance once", async () => {
    const db = makeFakeDb();
    seedLedger(db, { outstanding: 50000 });
    const first = await adminAdjustLedger("driver", "07700000001", 10000, "deduct", "خصم", "admin", db);
    const second = await adminAdjustLedger("driver", "07700000001", 10000, "deduct", "خصم", "admin", db);

    assert.equal(first.ok, true);
    assert.equal(first.outstandingAfter, 40000);
    assert.equal(second.duplicate, true);
    assert.equal(
      db._get("settlementLedger/driver:07700000001").outstandingTotal,
      40000,
      "a repeated adjustment must not deduct twice",
    );
  });

  test("two concurrent identical adjustments apply once", async () => {
    const db = makeFakeDb();
    seedLedger(db, { outstanding: 50000 });
    const [a, b] = await Promise.all([
      adminAdjustLedger("driver", "07700000001", 5000, "add", "غرامة", "admin", db),
      adminAdjustLedger("driver", "07700000001", 5000, "add", "غرامة", "admin", db),
    ]);
    assert.equal([a.duplicate, b.duplicate].filter(Boolean).length, 1);
    assert.equal(db._get("settlementLedger/driver:07700000001").outstandingTotal, 55000);
  });

  test("add and deduct of the same amount are different operations", () => {
    const add = adjustmentIdempotencyIds("driver", "d1", 5000, "add", "n", "admin", 0);
    const ded = adjustmentIdempotencyIds("driver", "d1", 5000, "deduct", "n", "admin", 0);
    assert.equal(add.some((id) => ded.includes(id)), false);
  });
});

describe("C-09 — FIFO distribution is claimed before it is applied", () => {
  test("a payment is stamped fifoApplied after its own distribution", async () => {
    const db = makeFakeDb();
    seedLedger(db);
    const res = await completeSettlement(basePayment(), db);
    const payment = db._get(`settlementPayments/${res.paymentId}`);
    assert.equal(payment.fifoApplied, true, "winner stamps the payment as distributed");
    assert.ok(payment.fifoClaimedAt, "the claim must be recorded before distributing");
  });

  test("a replayed payment never re-enters FIFO distribution", async () => {
    const db = makeFakeDb();
    seedLedger(db);
    await completeSettlement(basePayment(), db);
    const txAfterFirst = db.transactions;
    const replay = await completeSettlement(basePayment(), db);
    assert.equal(replay.duplicate, true);
    // A replay runs its own dedupe transaction but must NOT run a claim
    // transaction on top of it (claim + distribute is the expensive, unsafe path).
    assert.equal(
      db.transactions - txAfterFirst,
      1,
      "a replay must cost exactly one read transaction and never claim FIFO again",
    );
  });
});
