/**
 * Driver-stats fan-out tests (audit finding H-36).
 *
 * GET /api/admin/driver-stats looped over every driver with an await inside the
 * loop. The inner Promise.all only paired the two reads belonging to ONE driver,
 * so 200 drivers meant 200 sequential round trips on the single event loop — and
 * every other request on the platform queued behind them.
 *
 * The fix processes drivers in bounded batches. It is deliberately bounded rather
 * than a flat Promise.all over all drivers: 200 drivers at once would open 400
 * simultaneous Firestore reads.
 *
 * The arithmetic is asserted unchanged — this is a scheduling fix, not a
 * behavioural one, and a stats endpoint that quietly changes its numbers would be
 * far worse than a slow one.
 *
 * Run:  node --test tests/unit/driver-stats-fanout.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments as sharedStripComments } from "./_source.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(here, "../../server/routes.ts"), "utf8");
const CLEAN = sharedStripComments(SRC);

function handler(marker) {
  const at = CLEAN.indexOf(marker);
  assert.ok(at >= 0, `handler not found: ${marker}`);
  const open = CLEAN.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < CLEAN.length; i += 1) {
    if (CLEAN[i] === "{") depth += 1;
    else if (CLEAN[i] === "}") { depth -= 1; if (depth === 0) return CLEAN.slice(open, i + 1); }
  }
  throw new Error("unbalanced");
}
const BODY = handler('"/api/admin/driver-stats"');

describe("H-36 · driver stats must not serialise one round trip per driver", () => {
  test("there is no bare await inside a per-driver for…of loop", () => {
    assert.doesNotMatch(BODY, /for \(const driver of drivers\)/,
      "the sequential per-driver loop is back");
  });

  test("drivers are fanned out with Promise.all over a group", () => {
    assert.match(BODY, /Promise\.all\(\s*batch\.map\(/,
      "drivers are not processed as a group");
  });

  test("the fan-out is bounded, not unlimited", () => {
    const m = BODY.match(/DRIVER_STATS_CONCURRENCY = (\d+)/);
    assert.ok(m, "no concurrency bound — 200 drivers would open 400 reads at once");
    const n = Number(m[1]);
    assert.ok(n >= 2 && n <= 50, `a bound of ${n} is not sensible`);
    assert.doesNotMatch(BODY, /Promise\.all\(\s*drivers\.map\(/,
      "every driver is fired at once, which is the opposite failure");
  });

  test("the batching walks the whole driver list", () => {
    assert.match(BODY, /i \+= DRIVER_STATS_CONCURRENCY/,
      "the loop does not advance by the batch size");
    assert.match(BODY, /drivers\.slice\(i, i \+ DRIVER_STATS_CONCURRENCY\)/,
      "batches are not taken from the driver list");
  });
});

describe("H-36 · the numbers this endpoint reports are unchanged", () => {
  for (const [field, expr] of [
    ["todayOrders", /todayOrders: todayCompleted\.length/],
    ["todayEarnings", /todayEarnings: todayCompleted\.reduce\(\(sum, o\) => sum \+ \(o\.driverEarning \|\| 0\), 0\)/],
    ["totalOrders", /totalOrders: completed\.length/],
    ["totalEarnings", /totalEarnings: completed\.reduce\(\(sum, o\) => sum \+ \(o\.driverEarning \|\| 0\), 0\)/],
    ["amountOwed", /amountOwed: ledger\?\.outstandingTotal \?\? 0/],
  ]) {
    test(`${field} is computed exactly as before`, () => {
      assert.match(BODY, expr, `${field} changed — this was meant to be a scheduling fix only`);
    });
  }

  test("the today cutoff is still the local start of day", () => {
    assert.match(BODY, /new Date\(o\.completedAt\)\.getTime\(\) >= todayStart/);
  });

  test("the same two reads are still made per driver", () => {
    assert.match(BODY, /getCompletedOrders\(phone\)/);
    // Still exactly two reads per driver, which is what this fan-out test guards.
    // H-72 only changed the ledger's ADDRESS: a driver's money is keyed by their
    // walletId, so a recycled phone number cannot resolve to someone else's
    // balance. The driver document is already in hand here, so it costs no
    // extra read.
    assert.match(BODY, /getSettlementLedger\("driver", driverWalletIdOf\(driver, phone\)\)/);
  });

  test("the response shape is unchanged", () => {
    assert.match(BODY, /res\.json\(\{ stats \}\)/, "the response shape changed");
  });

  test("failures still answer 500 rather than partial data", () => {
    assert.match(BODY, /res\.status\(500\)/);
  });
});
