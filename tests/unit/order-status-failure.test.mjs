/**
 * Order status / assignment failure tests (audit finding H-33, orders batch).
 *
 * Four call sites discarded the boolean that updateOrderStatus and
 * updateOrderDriverInfo return, so a refused transition or a failed write carried
 * on as if it had worked:
 *
 *  1. POST /api/driver/start-delivery — notified the customer "on the way" and
 *     answered success while Firestore kept the previous status. The customer
 *     watched a delivery that had not started.
 *  2. POST accept-batch — told the customer "being prepared", linked the order to
 *     the driver in memory and answered success for orders that never moved.
 *  3. The delivery completion path — carried on to credit the driver and accrue
 *     settlements for an order Firestore still showed as undelivered.
 *  4. accrueDeliveredOrderSettlements — wrote the ledger while the ORDER document
 *     kept no driverEarning/ownerEarning, so the two records silently disagreed.
 *
 * These are checked against the shipped source rather than a rebuilt copy of the
 * logic, because the flows sit inside a 8000-line route module with real Firestore
 * transactions; what matters and what is checkable is the ORDER of operations —
 * that no customer notice, no in-memory assignment, no financial accrual and no
 * success response can be reached without the write having succeeded first.
 *
 * Run:  node --test tests/unit/order-status-failure.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments as sharedStripComments } from "./_source.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(here, "../../server/routes.ts"), "utf8");
const FIREBASE = readFileSync(join(here, "../../server/firebase.ts"), "utf8");
const strip = sharedStripComments;
const CLEAN = strip(SRC);

/** The body of the handler registered for `marker`, by brace matching. */
function handler(marker) {
  const at = CLEAN.indexOf(marker);
  assert.ok(at >= 0, `handler not found: ${marker}`);
  const open = CLEAN.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < CLEAN.length; i += 1) {
    if (CLEAN[i] === "{") depth += 1;
    else if (CLEAN[i] === "}") { depth -= 1; if (depth === 0) return CLEAN.slice(open, i + 1); }
  }
  throw new Error(`unbalanced: ${marker}`);
}

// ─────────────────────────────────────────────────────────────────────────────
describe("H-33 · start-delivery must not announce a delivery that did not start", () => {
  const body = handler('"/api/driver/start-delivery"');

  test("the status result is checked, not discarded", () => {
    assert.doesNotMatch(body, /^\s*await updateOrderStatus\(/m,
      "the return value of updateOrderStatus is thrown away again");
    assert.match(body, /=\s*await updateOrderStatus\(/,
      "the result is not captured at all");
  });

  test("the customer notice sits behind the check", () => {
    const guardAt = body.search(/if\s*\(\s*!\w+\s*\)/);
    const notifyAt = body.indexOf("notifyCustomerStatus");
    assert.ok(guardAt >= 0, "there is no guard on the status result");
    assert.ok(notifyAt > guardAt,
      "the customer is still told 'on the way' before the write is judged");
  });

  test("a refused transition returns a failure status, not success", () => {
    const guard = body.slice(body.search(/if\s*\(\s*!\w+\s*\)/));
    assert.match(guard.slice(0, 400), /res\.status\(\s*[45]\d\d\s*\)/,
      "the driver is still told the delivery started");
    assert.match(guard.slice(0, 400), /return/,
      "execution continues past the failure");
  });

  test("the success response is still reachable on the happy path", () => {
    assert.match(body, /res\.json\(\s*\{\s*success:\s*true\s*\}\s*\)/);
  });

  test("the driver activity log is not written for a move that did not happen", () => {
    const guardAt = body.search(/if\s*\(\s*!\w+\s*\)/);
    assert.ok(body.indexOf("saveDriverActivity") > guardAt);
  });
});

describe("H-33 · accepting a batch must not claim orders that did not move", () => {
  const body = handler('"/api/driver/batch/accept"');

  test("each order's status result is checked", () => {
    assert.match(body, /=\s*await updateOrderStatus\(orderId, "preparing"/,
      "the per-order status result is still discarded");
  });

  test("the customer notice and the driver link sit behind the check", () => {
    const loopAt = body.indexOf("for (const orderId of claim.orderIds)");
    const loop = body.slice(loopAt, body.indexOf("}", body.indexOf("addDeliveryLog", loopAt)));
    const guardAt = loop.search(/if\s*\(\s*!\w+\s*\)/);
    assert.ok(guardAt >= 0, "no guard inside the loop");
    assert.ok(loop.indexOf("notifyCustomerStatus") > guardAt,
      "the customer is still told 'being prepared' for an order that never moved");
    assert.ok(loop.indexOf("driverAssignments.set") > guardAt,
      "the in-memory assignment still happens for an order that never moved");
  });

  test("the driver link result is checked too", () => {
    assert.match(body, /=\s*await updateOrderDriverInfo\(orderId/,
      "the driver link result is discarded, so an order can look accepted but unlinked");
  });

  test("an incomplete accept answers a failure, not success", () => {
    assert.match(body, /notAccepted/, "failures are not collected at all");
    const tail = body.slice(body.indexOf("notAccepted.length"));
    assert.match(tail.slice(0, 500), /res\.status\(\s*5\d\d\s*\)/,
      "a partially failed accept still answers success:true");
  });

  test("batch composition, order and size are untouched", () => {
    // The standing constraint: this fix must not reshape batching in any way.
    assert.match(body, /for \(const orderId of claim\.orderIds\)/,
      "the iteration over the claimed batch changed");
    assert.doesNotMatch(body, /maxBatchSize|deliverySequence|optimizeDeliveryRoute|slice\(|sort\(/,
      "the accept handler now touches batch composition");
  });
});

describe("H-33 · completion must not credit an order that was never marked delivered", () => {
  const body = handler('"/api/driver/batch/complete-order"');

  test("the delivered write is checked before anything else runs", () => {
    assert.match(body, /=\s*await updateOrderStatus\(orderId, "delivered"/,
      "the delivered write result is still discarded");
    const guardAt = body.search(/if\s*\(!\s*markedDelivered\s*\)/);
    assert.ok(guardAt >= 0, "there is no guard on the delivered write");
    assert.ok(body.indexOf("accrueDeliveredOrderSettlements") > guardAt,
      "settlements are still accrued for an order that was not marked delivered");
    assert.ok(body.indexOf("sendPushNotification") > guardAt,
      "the customer is still told 'delivered' before the write is judged");
  });

  test("it throws so the existing claim-release recovery runs", () => {
    const guard = body.slice(body.search(/if\s*\(!\s*markedDelivered\s*\)/));
    assert.match(guard.slice(0, 200), /throw\b/,
      "the failure does not reach the recovery handler");
  });

  test("the claim-release recovery is still in place", () => {
    assert.match(body, /legacyCreditApplied/, "the idempotency marker was removed");
    assert.match(body, /earningsCredited:\s*false/, "the claim is no longer released on failure");
  });

  test("the idempotent short-circuit for an already-completed order is untouched", () => {
    assert.match(body, /alreadyCompleted:\s*true/);
  });
});

describe("H-33 · the ledger and the order record must not disagree", () => {
  const at = CLEAN.indexOf("accrueDeliveredOrderSettlements");
  const fn = CLEAN.slice(at, at + 2500);

  test("the earnings write onto the order is checked", () => {
    assert.match(fn, /=\s*await updateOrderDriverInfo\(orderId, \{ driverEarning/,
      "the earnings write result is still discarded");
  });

  test("a failed earnings write stops the accrual instead of diverging", () => {
    const guardAt = fn.search(/if\s*\(\s*!\w+\s*\)/);
    assert.ok(guardAt >= 0, "no guard on the earnings write");
    assert.match(fn.slice(guardAt, guardAt + 300), /throw\b/,
      "the ledger would still be credited while the order carries no earnings");
  });

  test("the computed payout itself is unchanged", () => {
    assert.match(fn, /computeDriverPayout\(isRestaurantOrder, order\.deliveryFee \|\| 0\)/,
      "the payout formula changed — this fix must not touch business logic");
  });
});

describe("H-33 · the data layer's contract is unchanged", () => {
  test("updateOrderStatus still returns false for a blocked transition", () => {
    const at = FIREBASE.indexOf("export async function updateOrderStatus");
    const fn = strip(FIREBASE.slice(at, at + 2200));
    assert.match(fn, /\[StateMachine\] Blocked/,
      "the state machine no longer reports a blocked transition");
    assert.match(fn, /return false/, "the boolean contract changed");
  });

  test("the status event is still emitted only on a real change", () => {
    const at = FIREBASE.indexOf("export async function updateOrderStatus");
    const fn = strip(FIREBASE.slice(at, at + 2200));
    const changedAt = fn.indexOf("if (changed)");
    const emitAt = fn.indexOf("orderEvents.emit");
    assert.ok(changedAt > 0 && emitAt > changedAt,
      "a status event can now fire for a write that did not happen");
  });

  test("the allowed-transition table is untouched", () => {
    for (const t of ["picked_up", "in_delivery", "delivered", "cancelled", "issue"]) {
      assert.ok(FIREBASE.includes(`${t}:`), `the ${t} transition row disappeared`);
    }
  });
});
