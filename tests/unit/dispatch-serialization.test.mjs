/**
 * Dispatch serialisation tests (audit finding H-19).
 *
 * The dispatch engine is read → filter → write: it queries the confirmed orders,
 * drops the ones already spoken for, and only sets its in-memory guards
 * (`batchedOrderIds`, `qd.currentBatchId`) on the very last line — after a Firestore
 * query, N order updates and the batch creation. Ten entry points could start a run
 * and not one of them awaited the previous one, so two runs routinely overlapped
 * inside that window, both saw the same order as unclaimed, and both batched it.
 * Two drivers pressing "go online" in the same second reproduced it every time:
 * one order, two batches, two different drivers, both sent to the store.
 *
 * The fix serialises every run onto one promise chain. These tests pin three things:
 * the chain's behaviour (built from the shipped source text, not a copy), that every
 * entry point goes through it, and that the internal calls deliberately do NOT — that
 * is the deadlock guard, not an oversight.
 *
 * Run:  node --test tests/unit/dispatch-serialization.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, "../../", p), "utf8");
const ROUTES = read("server/routes.ts");
const FIREBASE = read("server/firebase.ts");

/** Strip comments so a test never matches a pattern that only appears in prose. */
function code(src) {
  return src
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*"));
    })
    .join("\n");
}

const ROUTES_CODE = code(ROUTES);

// ── The real serialiser, lifted out of routes.ts ────────────────────────────
// Rather than re-implementing the pattern (which would only ever test the copy),
// take the shipped source text, remove the two type annotations, and run it. If the
// signature changes, the replacements below stop matching and the test fails loudly.
const SERIALISER_SRC = (() => {
  const from = ROUTES.indexOf("let dispatchChain");
  assert.ok(from > -1, "dispatchChain not found in routes.ts");
  const end = ROUTES.indexOf("\n  }\n", ROUTES.indexOf("function runDispatch", from));
  assert.ok(end > from, "runDispatch body not found");
  return ROUTES.slice(from, end + 4);
})();

const buildRunDispatch = () => {
  let js = SERIALISER_SRC;
  const typedChain = "let dispatchChain: Promise<unknown> = Promise.resolve();";
  const typedSig =
    "function runDispatch<T>(label: string, work: () => Promise<T>): Promise<T | undefined> {";
  assert.ok(js.includes(typedChain), "the chain declaration changed shape");
  assert.ok(js.includes(typedSig), "the runDispatch signature changed shape");
  js = js
    .replace(typedChain, "let dispatchChain = Promise.resolve();")
    .replace(typedSig, "function runDispatch(label, work) {");
  assert.doesNotMatch(js, /: Promise<|: string|<T>/, "a type annotation survived de-typing");
  // eslint-disable-next-line no-new-func
  return new Function("console", `${js}\nreturn runDispatch;`)({ error() {} });
};

const defer = (ms) => new Promise((r) => setTimeout(r, ms));

describe("H-19 — the chain actually serialises overlapping runs", () => {
  test("a second run cannot start until the first has finished", async () => {
    const runDispatch = buildRunDispatch();
    const log = [];
    const job = (name, ms) => async () => {
      log.push(`${name}:start`);
      await defer(ms);
      log.push(`${name}:end`);
    };

    // Fired in the same tick, exactly like two drivers pressing "go online" together.
    const a = runDispatch("a", job("a", 30));
    const b = runDispatch("b", job("b", 5));
    await Promise.all([a, b]);

    assert.deepEqual(log, ["a:start", "a:end", "b:start", "b:end"]);
  });

  test("ten simultaneous runs stay strictly FIFO and never interleave", async () => {
    const runDispatch = buildRunDispatch();
    const log = [];
    let live = 0;
    let maxLive = 0;

    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        runDispatch(`j${i}`, async () => {
          live += 1;
          maxLive = Math.max(maxLive, live);
          log.push(i);
          await defer(i % 3);
          live -= 1;
        }),
      ),
    );

    assert.equal(maxLive, 1, "two dispatch runs were in flight at once");
    assert.deepEqual(log, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  test("every queued run is executed — none is dropped", async () => {
    // This is the property a boolean `inFlight` flag would break: the overlapping
    // attempt would be discarded and its order would sit unassigned until the 30s
    // watchdog noticed. Queuing runs them all.
    const runDispatch = buildRunDispatch();
    let runs = 0;
    await Promise.all(
      Array.from({ length: 25 }, () => runDispatch("x", async () => { runs += 1; })),
    );
    assert.equal(runs, 25);
  });

  test("later work sees the state written by earlier work", async () => {
    const runDispatch = buildRunDispatch();
    const claimed = new Set();
    const doubleClaims = [];

    // Mirrors the real read → await → write shape that made the race possible.
    const dispatch = () =>
      runDispatch("claim", async () => {
        const free = !claimed.has("order-A");
        await defer(5);
        if (free) {
          if (claimed.has("order-A")) doubleClaims.push(1);
          claimed.add("order-A");
        }
      });

    await Promise.all([dispatch(), dispatch(), dispatch()]);
    assert.equal(doubleClaims.length, 0, "an order was claimed twice");
    assert.equal(claimed.size, 1);
  });
});

describe("H-19 — one failure cannot wedge dispatch", () => {
  test("a throwing run does not stop the next one", async () => {
    const runDispatch = buildRunDispatch();
    const log = [];
    const bad = runDispatch("bad", async () => { log.push("bad"); throw new Error("boom"); });
    const good = runDispatch("good", async () => { log.push("good"); return "ok"; });

    assert.equal(await bad, undefined, "runDispatch must resolve, never reject");
    assert.equal(await good, "ok");
    assert.deepEqual(log, ["bad", "good"]);
  });

  test("a synchronous throw is caught too", async () => {
    const runDispatch = buildRunDispatch();
    assert.equal(await runDispatch("sync", () => { throw new Error("boom"); }), undefined);
    assert.equal(await runDispatch("after", async () => "still alive"), "still alive");
  });

  test("the chain survives repeated failures", async () => {
    const runDispatch = buildRunDispatch();
    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await runDispatch("fail", async () => { throw new Error(`boom ${i}`); });
    }
    assert.equal(await runDispatch("last", async () => "alive"), "alive");
  });

  test("no unhandled rejection escapes the chain", async () => {
    const runDispatch = buildRunDispatch();
    const seen = [];
    const onUnhandled = (err) => seen.push(err);
    process.on("unhandledRejection", onUnhandled);
    try {
      runDispatch("fire-and-forget", async () => { throw new Error("boom"); });
      await defer(30);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
    assert.deepEqual(seen, [], "a fire-and-forget dispatch produced an unhandled rejection");
  });

  test("the result value of a successful run is passed through unchanged", async () => {
    const runDispatch = buildRunDispatch();
    assert.equal(await runDispatch("v", async () => 42), 42);
    assert.equal(await runDispatch("v", async () => false), false);
  });
});

describe("H-19 — the serialiser is a queue, not a lock", () => {
  test("it is built on a promise chain", () => {
    assert.match(ROUTES_CODE, /let dispatchChain: Promise<unknown> = Promise\.resolve\(\);/);
    assert.match(ROUTES_CODE, /dispatchChain = result;/);
  });

  test("both settle paths continue the chain", () => {
    // `.then(work, work)` — the rejected branch must also run the next job, otherwise
    // one failure leaves every later dispatch queued behind a promise that never settles.
    assert.match(
      SERIALISER_SRC,
      /dispatchChain\s*\.then\(\s*\(\) => work\(\),\s*\(\) => work\(\),\s*\)/,
      "REGRESSION: the chain no longer continues after a rejected run",
    );
    assert.match(SERIALISER_SRC, /\.catch\(/, "the chain must be re-armed with a caught promise");
  });

  test("no boolean in-flight flag was introduced", () => {
    // A flag DROPS the overlapping run instead of queuing it, which silently loses
    // the assignment the run was meant to make. (routes.ts has an unrelated pre-existing
    // `inFlight` local at boot hydration — a list of undelivered orders — so the flag
    // check is scoped to the dispatch section, with the dispatch-specific names checked
    // across the whole file.)
    const from = ROUTES.indexOf("// ── Dispatch serialisation (H-19)");
    assert.ok(from > -1, "the dispatch section header is gone");
    const section = code(ROUTES.slice(from, ROUTES.indexOf("// ── Settlement recovery sweep", from)));
    assert.doesNotMatch(
      section,
      /\b(inFlight|running|busy|locked|isDispatching)\s*(=|:)\s*(true|false)\b/i,
      "REGRESSION: a drop-the-run flag replaced the queue",
    );
    assert.doesNotMatch(
      ROUTES_CODE,
      /\b(dispatchRunning|isDispatching|dispatchBusy|dispatchLock|dispatchInFlight)\b/i,
      "REGRESSION: a drop-the-run flag replaced the queue",
    );
  });

  test("the dispatch state it protects is still plain in-memory state", () => {
    // The whole fix rests on there being exactly one process; if this state ever moves
    // or the deployment scales out, the serialiser alone stops being sufficient.
    assert.match(ROUTES_CODE, /const batchedOrderIds = new Set<string>\(\)/);
    assert.match(ROUTES_CODE, /driverQueue/);
  });
});

describe("H-19 — every entry point goes through the chain", () => {
  const WRAPPERS_AT = ROUTES.indexOf("function assignWaitingBatchToDriver(phoneNumber: string)");

  test("the public wrappers exist and delegate to runDispatch", () => {
    assert.ok(WRAPPERS_AT > -1, "the public wrapper is gone");
    const wrappers = ROUTES.slice(WRAPPERS_AT, ROUTES.indexOf("orderEvents.on(\"confirmed\"", WRAPPERS_AT));
    assert.match(wrappers, /return runDispatch\(\s*`assignWaitingBatchToDriver\(\$\{phoneNumber\}\)`/);
    assert.match(wrappers, /return runDispatch\("onOrderConfirmed", \(\) => onOrderConfirmedUnsafe\(\)\)/);
  });

  test("no call site outside the two legal regions calls an Unsafe body", () => {
    // Position-aware, not shape-aware: a bypass looks exactly like a legal call, so the
    // only thing that distinguishes them is WHERE it sits. Exactly two regions may call
    // an Unsafe body — onOrderConfirmedUnsafe (it already holds the chain) and the
    // runDispatch wrappers. Anywhere else is the pre-fix race, back again.
    const bodiesFrom = ROUTES.indexOf("async function onOrderConfirmedUnsafe()");
    const wrappersFrom = ROUTES.indexOf("// ── Public dispatch entry points");
    const wrappersTo = ROUTES.indexOf('orderEvents.on("confirmed"', wrappersFrom);
    assert.ok(bodiesFrom > -1 && wrappersFrom > bodiesFrom && wrappersTo > wrappersFrom);
    const allowed = [[bodiesFrom, wrappersFrom], [wrappersFrom, wrappersTo]];
    const inAllowed = (at) => allowed.some(([a, b]) => at >= a && at < b);

    const lineStarts = [];
    ROUTES.split("\n").reduce((at, line) => { lineStarts.push(at); return at + line.length + 1; }, 0);
    const lineAt = (at) => {
      let n = 0;
      while (n + 1 < lineStarts.length && lineStarts[n + 1] <= at) n += 1;
      return n + 1;
    };

    const offenders = [];
    const re = /\b(assignWaitingBatchToDriverUnsafe|topUpBusyDriverBatchUnsafe|onOrderConfirmedUnsafe)\s*\(/g;
    for (const m of ROUTES.matchAll(re)) {
      const n = lineAt(m.index);
      const line = ROUTES.split("\n")[n - 1];
      const t = line.trim();
      if (t.startsWith("//") || t.startsWith("*")) continue;         // prose
      if (/^async function \w+Unsafe/.test(t)) continue;             // the declarations
      if (inAllowed(m.index)) continue;
      offenders.push(`${n}: ${t}`);
    }
    assert.deepEqual(offenders, [], "an Unsafe body is called from outside the dispatch chain");
  });

  test("the route handlers and timers all call the wrapper names", () => {
    // Every historical entry point, by the exact text it uses. If any of these reverts
    // to an Unsafe call the race comes straight back.
    const calls = [...ROUTES_CODE.matchAll(/^\s*(?:await |return )?(assignWaitingBatchToDriver|onOrderConfirmed)\(/gm)];
    assert.ok(calls.length >= 8, `expected the known entry points, found ${calls.length}`);
  });

  test("the vendor \"confirmed\" event is bound to the serialised wrapper", () => {
    assert.match(ROUTES_CODE, /orderEvents\.on\("confirmed", onOrderConfirmed\);/);
    assert.doesNotMatch(ROUTES_CODE, /orderEvents\.on\("confirmed", onOrderConfirmedUnsafe\)/);
  });

  test("the wrappers keep the original names and arity, so no call site changed", () => {
    assert.match(ROUTES_CODE, /function assignWaitingBatchToDriver\(phoneNumber: string\): Promise<unknown>/);
    assert.match(ROUTES_CODE, /function onOrderConfirmed\(\): Promise<unknown>/);
  });
});

describe("H-19 — the deadlock guard", () => {
  const BODY = (() => {
    const at = ROUTES.indexOf("async function onOrderConfirmedUnsafe()");
    assert.ok(at > -1, "onOrderConfirmedUnsafe not found");
    return ROUTES.slice(at, ROUTES.indexOf("\n  // ── Public dispatch entry points", at));
  })();

  test("onOrderConfirmedUnsafe calls the Unsafe bodies directly", () => {
    // It already holds the chain. Re-entering runDispatch here would queue a job behind
    // the very job that is awaiting it — dispatch would stop forever on the first
    // confirmed order.
    assert.match(BODY, /await assignWaitingBatchToDriverUnsafe\(driver\.phoneNumber\);/);
    assert.match(BODY, /await topUpBusyDriverBatchUnsafe\(anchor\);/);
  });

  test("it never re-enters runDispatch", () => {
    assert.doesNotMatch(code(BODY), /runDispatch\(/, "DEADLOCK: a held chain is being re-entered");
    assert.doesNotMatch(code(BODY), /\bassignWaitingBatchToDriver\(/);
    assert.doesNotMatch(code(BODY), /\btopUpBusyDriverBatch\(/);
  });

  test("a nested re-entry really would deadlock (why the guard matters)", async () => {
    const runDispatch = buildRunDispatch();
    let inner = false;
    const outer = runDispatch("outer", async () => {
      // The bug this guard prevents: queueing from inside a queued job.
      await runDispatch("inner", async () => { inner = true; });
    });
    const settled = await Promise.race([outer.then(() => "done"), defer(120).then(() => "hung")]);
    assert.equal(settled, "hung", "nesting no longer deadlocks — re-check the guard's rationale");
    assert.equal(inner, false);
  });

  test("the direct (unnested) shape used in production does not deadlock", async () => {
    const runDispatch = buildRunDispatch();
    const seen = [];
    const innerUnsafe = async () => { seen.push("inner"); };
    const outer = runDispatch("outer", async () => {
      seen.push("outer");
      await innerUnsafe();
    });
    const settled = await Promise.race([outer.then(() => "done"), defer(120).then(() => "hung")]);
    assert.equal(settled, "done");
    assert.deepEqual(seen, ["outer", "inner"]);
  });
});

describe("H-19 — scope: nothing else in the dispatch path was changed", () => {
  test("createDeliveryBatch was NOT converted to a transaction in this round", () => {
    // Deliberate: the atomic reservation is a separate, larger change. Recording it
    // here so that if it lands later, this expectation is updated on purpose.
    const from = FIREBASE.indexOf("export async function createDeliveryBatch");
    const body = FIREBASE.slice(from, FIREBASE.indexOf("export async function getDeliveryBatch"));
    assert.ok(from > -1, "createDeliveryBatch not found");
    assert.doesNotMatch(code(body), /runTransaction/);
  });

  test("claimBatchForDriver is still the atomic accept it always was", () => {
    const from = FIREBASE.indexOf("export async function claimBatchForDriver");
    const body = FIREBASE.slice(from, FIREBASE.indexOf("export async function cancelBatchIfPending"));
    assert.ok(from > -1, "claimBatchForDriver not found");
    assert.match(body, /db\.runTransaction/);
    assert.match(body, /await tx\.get\(/);
  });

  test("cancelBatchIfPending is still transactional", () => {
    const from = FIREBASE.indexOf("export async function cancelBatchIfPending");
    assert.ok(from > -1, "cancelBatchIfPending not found");
    assert.match(FIREBASE.slice(from, from + 2000), /db\.runTransaction/);
  });

  test("the rejection cooldown and offer timeout are untouched", () => {
    assert.match(ROUTES_CODE, /REJECTION_COOLDOWN_MS = 3 \* 60 \* 1000/);
    assert.match(ROUTES_CODE, /OFFER_TIMEOUT_MS = 90 \* 1000/);
  });
});

describe("H-19 — multi-order route batching is preserved verbatim", () => {
  // The whole point of serialising dispatch is that ONE order cannot land in TWO
  // batches. It must never become "one order per batch": a driver still has to be able
  // to carry A+B+C on one trip when the existing route rules say they combine. These
  // pin the batching logic byte-for-byte so a future fix cannot quietly shrink batches.

  test("ordersCombinable still merges by region OR radius OR unknown-coords", () => {
    const at = ROUTES.indexOf("function ordersCombinable(anchor: any, o: any): boolean {");
    assert.ok(at > -1, "ordersCombinable is gone");
    const body = ROUTES.slice(at, ROUTES.indexOf("\n  }", at));
    assert.match(body, /const sameRegion = !!o\.region && !!anchor\.region && o\.region === anchor\.region;/);
    assert.match(body, /calculateDistance\(anchor\.latitude, anchor\.longitude, o\.latitude, o\.longitude\) <= MERGE_RADIUS_KM/);
    assert.match(body, /return sameRegion \|\| near \|\| cantTellFar;/);
    assert.match(ROUTES_CODE, /const MERGE_RADIUS_KM = 3;/);
  });

  test("the merge loop still fills the batch up to maxOrders", () => {
    // If this loop ever stops running, every batch silently becomes a single order.
    const at = ROUTES.indexOf("const anchor = eligible[0];");
    assert.ok(at > -1, "the anchor/merge block is gone");
    const block = ROUTES.slice(at, ROUTES.indexOf("const driverLoc = driverLocations.get", at));
    assert.match(block, /const waitingOrders = \[anchor\];/);
    assert.match(block, /for \(const o of eligible\.slice\(1\)\) \{/);
    assert.match(block, /if \(waitingOrders\.length >= maxOrders\) break;/);
    assert.match(block, /if \(ordersCombinable\(anchor, o\)\) waitingOrders\.push\(o\);/);
  });

  test("maxOrders still comes from the admin setting, unchanged", () => {
    assert.match(ROUTES_CODE, /const maxOrders = \(await getSystemSettings\(\)\)\.maxBatchSize;/);
    assert.match(ROUTES_CODE, /maxBatchSize: 3,/, "the default batch size changed");
    assert.match(ROUTES_CODE, /maxBatchSize: Math\.min\(4, Math\.max\(1, Number\(d\.maxBatchSize\) \|\| defaults\.maxBatchSize\)\)/);
  });

  test("route optimization still runs over the whole merged set", () => {
    assert.match(
      ROUTES_CODE,
      /const routeInfo = optimizeDeliveryRoute\(waitingOrders, driverLoc\?\.lat \?\? 0, driverLoc\?\.lng \?\? 0\);/,
      "REGRESSION: the optimizer no longer receives the merged order set",
    );
    assert.match(ROUTES_CODE, /const optimizedIds = routeInfo\.map\(r => r\.id\);/);
    assert.match(ROUTES_CODE, /const totalDistance = routeInfo\.reduce\(\(sum, r\) => sum \+ r\.distance, 0\);/);
    assert.match(ROUTES_CODE, /const nearest = remaining\.splice\(nearestIdx, 1\)\[0\];/, "nearest-neighbour ordering changed");
  });

  test("the batch is created from optimizedIds — the full list, not a single order", () => {
    assert.match(
      ROUTES_CODE,
      /createDeliveryBatch\(\{ driverPhone: phoneNumber, orderIds: optimizedIds, totalDistance \}\)/,
      "REGRESSION: the batch no longer carries every merged order",
    );
    assert.match(ROUTES_CODE, /optimizedIds\.forEach\(id => batchedOrderIds\.add\(id\)\);/);
    assert.doesNotMatch(
      ROUTES_CODE,
      /orderIds: \[anchor\.id\]|orderIds: \[optimizedIds\[0\]\]/,
      "REGRESSION: batching was reduced to one order",
    );
  });

  test("deliverySequence is still persisted for every order in the batch", () => {
    const at = ROUTES.indexOf("for (const r of routeInfo) {");
    assert.ok(at > -1, "the sequence-persist loop is gone");
    const block = ROUTES.slice(at, at + 500);
    assert.match(block, /deliverySequence: r\.deliverySequence/);
    assert.match(block, /delivery_sequence: r\.deliverySequence/);
    assert.match(block, /distance: r\.distance/);
    assert.match(block, /estimatedTime: r\.estimatedTime/);
  });

  test("the batch notification still reports the real order count", () => {
    assert.match(
      ROUTES_CODE,
      /sendDriverBatchNotification\(driverPushToken, optimizedIds\.length, batchId, driverBadge\)/,
      "REGRESSION: the driver is no longer told how many orders the batch holds",
    );
  });

  test("topUpBusyDriverBatch still adds orders to an open batch", () => {
    // The other half of multi-order delivery: a busy driver with room keeps taking work.
    const at = ROUTES.indexOf("async function topUpBusyDriverBatchUnsafe(anchor: any)");
    assert.ok(at > -1, "topUpBusyDriverBatch is gone");
    const body = ROUTES.slice(at, ROUTES.indexOf("async function onOrderConfirmedUnsafe", at));
    assert.match(body, /ordersCombinable\(/, "the top-up no longer checks route combinability");
    assert.match(body, /maxBatchSize/, "the top-up no longer respects the batch cap");
    assert.match(body, /batchedOrderIds\.add\(orderId\)/);
  });

  test("the serialiser sits outside all of it — it wraps, it does not filter", () => {
    // runDispatch must not appear anywhere inside the batching logic itself.
    const from = ROUTES.indexOf("async function assignWaitingBatchToDriverUnsafe");
    const to = ROUTES.indexOf("async function topUpBusyDriverBatchUnsafe");
    assert.doesNotMatch(
      code(ROUTES.slice(from, to)),
      /runDispatch|dispatchChain/,
      "the serialiser leaked into the batching logic",
    );
  });
});
