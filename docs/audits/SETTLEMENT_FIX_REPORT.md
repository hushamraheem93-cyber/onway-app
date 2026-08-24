# Settlement Consistency Fix — Report

**Issue**: HIGH — settlement could be silently and permanently lost
**Source**: `REVIEW_REPORT.md`
**Status**: ✅ Fixed · 9/9 tests pass · verified by mutation testing
**Date**: 2026-07-25
**Scope**: this HIGH issue only — no Medium or Low findings were touched

---

## 1. The Bug

`POST /api/driver/batch/complete-order` committed the idempotency flag **before**
recording the money, then discarded the result of the recording:

```ts
// routes.ts:3707 — committed FIRST
tx.update(orderRef, { earningsCredited: true });
   ...
// routes.ts:3736 / 3756 — return value ignored
await recordOrderSettlement({ accountType: "driver", ... });
await recordOrderSettlement({ accountType: "vendor", ... });
```

`recordOrderSettlement` swallowed its own failures and returned `false` — **the
same value it returned for the legitimate "already recorded" no-op**:

```ts
} catch (error) {
  console.error("recordOrderSettlement tx error:", error);
  return false;          // indistinguishable from the idempotent duplicate
}
```

**Failure path.** A transient Firestore error (contention on the ledger doc, a
network blip, a quota spike) → the accrual never commits → the caller cannot
tell → the driver's debt and the vendor's payable are never created.

**And the loss was permanent.** A retry re-entered the handler, read
`earningsCredited === true`, and returned early — skipping settlement forever.
No alert, no reconciliation, one `console.error` line as the only trace.

This is the exact mirror of the existing double-credit protection: the system
correctly guaranteed **at most once**, but did not guarantee **at least once**.

---

## 2. The Fix

### Design principle

Settlement documents are keyed by a deterministic id — `${orderId}__${accountType}`
— so **replaying an accrual can never double-count**. That makes it safe to retry
*only* the settlement step, while leaving `earningsCredited` set so the rest of
completion (completed-orders list, push notifications, batch bookkeeping) never
runs twice.

That distinction is what makes the fix small and safe: the retry surface is
exactly the idempotent part.

### Changes

**`server/settlement.ts`**

1. Replaced the ambiguous `boolean` with a discriminated outcome:

```ts
export type SettlementOutcome = "recorded" | "duplicate" | "failed";
```

`"failed"` can no longer masquerade as a successful no-op — the root enabler of
the bug is gone at the type level.

2. Added an optional injected `db` parameter (production passes nothing) so the
   failure path is testable without credentials.

3. Added `retryOrderSettlements(inputs, db?)` — replays accruals and reports
   whether all landed.

4. Structured logging on every failure path, including the amounts, so an accrual
   can be reconstructed by hand if every automated retry fails.

**`server/routes.ts`**

5. The completion handler now inspects each outcome. On failure it parks the exact
   inputs on the order for replay:

```ts
settlementPending: true,
settlementFailedTypes: [...],
settlementRetryInputs: [...],   // exact inputs, replayed verbatim
settlementLastError: <timestamp>
```

`earningsCredited` deliberately stays `true`.

6. If even the marker write fails, a `CRITICAL` log line records the full inputs —
   the last-resort path to manual reconciliation.

7. Added a **recovery sweep** (every 2 minutes, batches of 25) that finds
   `settlementPending` orders, replays the stored inputs, and clears the flag only
   once everything settles. While a write keeps failing, the flag stays set and
   the next sweep tries again.

### Requirements traceability

| Requirement | How it is met |
|---|---|
| Preserve existing business logic | No economics changed. Same amounts, same accounts, same call sites. |
| Preserve idempotency | `earningsCredited` untouched; settlement ids unchanged; duplicates still no-op. |
| Settlement never permanently skipped | Failures are flagged and replayed by the recovery sweep until they land. |
| Retries cannot duplicate | Deterministic doc id → replay returns `"duplicate"` and writes nothing. Proven by test. |
| Safe recovery after failure | Exact inputs persisted on the order; sweep is self-healing and re-entrant. |
| Logging on every failure path | Write failure, retry-still-failing, marker-write failure (CRITICAL), sweep errors, plus success/duplicate lines. |

---

## 3. Tests

`tests/unit/settlement-consistency.test.mjs` — **9 tests, all passing.**

Real unit tests against an in-memory Firestore double: no credentials, fully
deterministic (the failure is triggered by a switch, not by hoping to hit a race),
so they gate CI.

| # | Test | Covers |
|---|------|--------|
| 1 | Successful settlement records accrual + ledger | **success** |
| 2 | Transient failure returns `"failed"`, writes nothing | **transient failure** |
| 3 | `"failed"` is distinguishable from `"duplicate"` | **the original bug** |
| 4 | Retry after transient failure settles the order | **retry** |
| 5 | Retry reports failure while Firestore is still down | retry backoff correctness |
| 6 | Duplicate completion never double-counts | **duplicate completion** |
| 7 | Repeated recovery sweeps are idempotent | sweep re-entrancy |
| 8 | Partial failure: survivor not double-counted, missing one retried | mixed outcome |
| 9 | Missing database reports `"failed"` | no silent success |

### Mutation testing — proof the tests are meaningful

Passing tests only matter if they fail when the bug returns. I reintroduced the
original defect (`return "duplicate"` on the catch path) and re-ran:

```
with the bug reintroduced :  9 tests, 4 pass, 5 FAIL
with the fix restored     :  9 tests, 9 pass, 0 fail
```

The suite genuinely detects this class of regression.

---

## 4. Verification

| Gate | Result |
|------|--------|
| `tsc --noEmit` | ✅ clean |
| `npm run test:unit` | ✅ 9 passed, 0 failed |
| `npm run server:build` | ✅ 515.3 KB bundle |
| Boot smoke test | ✅ starts and serves, 0 errors |
| Mutation test | ✅ 5 tests fail when the bug returns |

CI (`.github/workflows/ci.yml`) now runs `npm run test:unit` before the build, so
this regression cannot land again unnoticed.

---

## 5. Deployment Note

The recovery sweep queries `orders where settlementPending == true`. This is a
**single-field** filter, which Firestore indexes automatically — **no composite
index is required** and no index deployment is needed for this change.

The sweep runs in the same single PM2 process as the rest of the in-memory state
(`instances: 1`), so there is no risk of two workers racing on the same order.

---

## 6. Residual Risk

**Reduced, not eliminated.** If a settlement fails *and* the marker write also
fails *and* the process dies before either lands, the order is not flagged and the
sweep cannot find it. That window is small (two consecutive write failures within
milliseconds) and it now leaves a `CRITICAL` log line containing the full inputs.

To close it completely, a periodic reconciliation query — delivered orders with no
matching `settlements/{orderId}__driver` document — would catch anything the flag
missed. That is a larger change than this issue warrants and was **not** included,
per the instruction to fix only this HIGH finding. It is recorded here as
recommended follow-up.

Also unchanged, as instructed: the two MEDIUM findings from `REVIEW_REPORT.md`
(unbounded `imageHashMap`, and the `{error}`/`{message}` response-shape split).

---

*Fix verified end to end before committing; one commit created, as requested.*
