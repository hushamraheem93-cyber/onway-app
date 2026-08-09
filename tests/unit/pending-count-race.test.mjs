/**
 * Settlement pendingCount tests (audit finding H-21).
 *
 * markSettlementRecordsFIFO() ended by writing an ABSOLUTE pendingCount, computed from
 * a settlements snapshot read at the top of the function — several awaited batch commits
 * earlier. recordAccrual() increments that same field inside a transaction whenever a
 * driver completes an order. An order finished inside that window was counted by the
 * accrual and then erased by the absolute write: classic lost update.
 *
 * The money itself was never wrong (outstandingTotal is transactional), but a driver
 * with money genuinely owed saw "0 pending orders", and createSettlementRequest() stamped
 * that same 0 onto the permanent settlement request used to resolve disputes.
 *
 * The fix decrements by the number of records the call actually settled, inside a
 * transaction, clamped at zero — an operation that commutes with a concurrent +1.
 *
 * Run:  node --test tests/unit/pending-count-race.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, "../../", p), "utf8");
const SETTLEMENT = read("server/settlement.ts");

function code(src) {
  return src
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*"));
    })
    .join("\n");
}

/** markSettlementRecordsFIFO, source text. */
const FIFO = (() => {
  const from = SETTLEMENT.indexOf("async function markSettlementRecordsFIFO(");
  assert.ok(from > -1, "markSettlementRecordsFIFO is gone");
  const to = SETTLEMENT.indexOf("\n// ── Threshold configuration", from);
  assert.ok(to > from, "could not find the end of markSettlementRecordsFIFO");
  return SETTLEMENT.slice(from, to);
})();

describe("H-21 — the absolute write is gone", () => {
  test("pendingCount is no longer set from a snapshot-derived total", () => {
    assert.doesNotMatch(
      code(FIFO),
      /pendingCount: stillPending/,
      "REGRESSION: the absolute write is back — a concurrent accrual will be erased",
    );
    assert.doesNotMatch(code(FIFO), /let stillPending/, "the stale counter variable is back");
  });

  test("it counts what this call actually settled instead", () => {
    assert.match(code(FIFO), /let newlySettled = 0;/);
    assert.match(code(FIFO), /if \(fully\) newlySettled\+\+;/);
  });

  test("only fully-settled records decrement the counter", () => {
    // A partially settled record is still pending, so it must not decrement.
    const loop = FIFO.slice(FIFO.indexOf("for (const s of pending) {"), FIFO.indexOf("if (ops > 0)"));
    assert.match(loop, /const fully = newSettled >= \(s\.outstandingAmount \?\? 0\);/);
    const increments = [...loop.matchAll(/newlySettled\+\+/g)].length;
    assert.equal(increments, 1, "the counter must be decremented from exactly one place");
  });
});

describe("H-21 — the update is atomic, relative and clamped", () => {
  const UPDATE = (() => {
    const from = FIFO.indexOf("if (newlySettled > 0) {");
    assert.ok(from > -1, "the guarded pendingCount update is gone");
    return FIFO.slice(from);
  })();

  test("it runs inside a transaction that re-reads the ledger", () => {
    assert.match(UPDATE, /await db\.runTransaction\(async \(tx: any\) => \{/);
    assert.match(UPDATE, /const snap = await tx\.get\(ledgerRef\);/);
    assert.match(UPDATE, /const prev = \(snap\.data\(\) as any\)\.pendingCount \?\? 0;/);
  });

  test("it writes a decrement of the live value, not a computed total", () => {
    assert.match(
      UPDATE,
      /pendingCount: Math\.max\(0, prev - newlySettled\)/,
      "REGRESSION: pendingCount is no longer derived from the value read in the transaction",
    );
  });

  test("it is clamped at zero", () => {
    // The counter is shown to drivers and vendors; a negative is worse than a stale one.
    assert.match(UPDATE, /Math\.max\(0,/);
  });

  test("it skips the write entirely when nothing was settled", () => {
    assert.match(FIFO, /if \(newlySettled > 0\) \{/);
  });

  test("it does not create a ledger that was not there", () => {
    assert.match(UPDATE, /if \(!snap\.exists\) return;/);
  });

  test("a failure is logged, not swallowed silently", () => {
    assert.match(UPDATE, /\.catch\(\(e: any\) => console\.error\("\[FIFO\] pendingCount update failed:", e\)\)/);
  });

  test("the merge write still carries updatedAt", () => {
    assert.match(UPDATE, /updatedAt: now \}, \{ merge: true \}\)/);
  });
});

describe("H-21 — the arithmetic commutes with a concurrent accrual", () => {
  // Models the two writers against a shared counter: the accrual's transactional +1
  // and the FIFO decrement. The point of the fix is that order no longer matters.
  const accrue = (n) => n + 1;
  const settle = (n, k) => Math.max(0, n - k);

  test("accrual-then-settle and settle-then-accrual agree", () => {
    for (const start of [0, 1, 4, 9, 50]) {
      for (const k of [1, 2, 3]) {
        if (k > start) continue;
        assert.equal(settle(accrue(start), k), accrue(settle(start, k)), `start=${start} k=${k}`);
      }
    }
  });

  test("the reported scenario now lands on 1, not 0", () => {
    // 4 pending, all four settled, a 5th order completes inside the window.
    let n = 4;
    n = accrue(n);        // the 5th order's transactional +1  → 5
    n = settle(n, 4);     // FIFO settled four records          → 1
    assert.equal(n, 1);
  });

  test("the old absolute write loses the accrual whatever the timing", () => {
    const oldWrite = (_n, stillPendingFromStaleSnapshot) => stillPendingFromStaleSnapshot;
    let n = 4;
    n = accrue(n);        // → 5
    n = oldWrite(n, 0);   // stale snapshot said "0 will remain"
    assert.equal(n, 0, "this is the defect the fix removes");
  });

  test("a partial settlement decrements by 0 and changes nothing", () => {
    assert.equal(settle(7, 0), 7);
  });

  test("clamping keeps a drifted counter non-negative", () => {
    assert.equal(settle(1, 3), 0);
    assert.equal(settle(0, 5), 0);
  });
});

describe("H-21 — nothing else in the settlement path changed", () => {
  test("the accrual still increments inside its own transaction", () => {
    assert.match(code(SETTLEMENT), /pendingCount: \(prev\.pendingCount \?\? 0\) \+ 1,/);
    assert.match(code(SETTLEMENT), /outstandingTotal: \(prev\.outstandingTotal \?\? 0\) \+ outstanding,/);
    assert.match(code(SETTLEMENT), /totalOrders: \(prev\.totalOrders \?\? 0\) \+ 1,/);
  });

  test("FIFO ordering and allocation are untouched", () => {
    assert.match(FIFO, /\.sort\(\(a: any, b: any\) => \(a\.createdAt\?\.toMillis\?\.\(\) \?\? 0\) - \(b\.createdAt\?\.toMillis\?\.\(\) \?\? 0\)\)/);
    assert.match(FIFO, /const applied = Math\.min\(remaining, due\);/);
    assert.match(FIFO, /const newSettled = \(s\.amountSettled \?\? 0\) \+ applied;/);
    assert.match(FIFO, /status: fully \? "settled" : "pending",/);
    assert.match(FIFO, /remaining -= applied;/);
  });

  test("the 400-op batch chunking is untouched", () => {
    assert.match(FIFO, /if \(ops >= 400\) \{ await batch\.commit\(\); batch = db\.batch\(\); ops = 0; \}/);
    assert.match(FIFO, /if \(ops > 0\) await batch\.commit\(\);/);
  });

  test("no money field is written by the counter update", () => {
    const UPDATE = FIFO.slice(FIFO.indexOf("if (newlySettled > 0) {"));
    for (const field of ["outstandingTotal", "totalSettled", "totalGross", "totalCommission", "amountSettled"]) {
      assert.doesNotMatch(UPDATE, new RegExp(`${field}\\s*:`), `the counter update must not touch ${field}`);
    }
  });

  test("the readers of pendingCount are unchanged", () => {
    assert.match(code(SETTLEMENT), /const pendingOrderCount = ledger\.pendingCount \?\? 0;/);
    assert.match(code(SETTLEMENT), /pendingOrderCount: ledger\?\.pendingCount \?\? 0,/);
    assert.match(code(SETTLEMENT), /pendingOrderCount: l\.pendingCount \?\? 0,/);
  });

  test("the FIFO claim/repair guards are untouched", () => {
    assert.match(code(SETTLEMENT), /const claimed = await claimFifoApplication\(db, paymentRef\.id\);/);
    assert.match(code(SETTLEMENT), /fifoApplied: false,/);
    assert.match(code(SETTLEMENT), /await markSettlementRecordsFIFO\(accountType, accountId, amount\);/);
  });
});
