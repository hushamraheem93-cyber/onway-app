/**
 * Fatal-fault handling tests (audit finding H-44).
 *
 * The finding: "the uncaughtException handler logs and continues. Swallowing an
 * uncaught exception leaves the process in an undefined state: an exception while
 * clearing an offer timeout leaves the driver queue truncated and the batched-order
 * set inconsistent, so those orders become invisible to every later dispatch and are
 * never delivered, with no visible error." (index.ts:1007–1009)
 *
 * Checked against HEAD, the conclusion holds but the reasoning does not:
 *
 *   CONFIRMED  the handler logged and continued. Run for real, a child process
 *              using the shipped handler survived a thrown exception and exited 0.
 *   CONFIRMED  the same applied to unhandledRejection, which the finding does not
 *              mention.
 *   FALSE      the offer-timeout example. That sweep carries its OWN try/catch, so
 *              the global handler never sees its exceptions; and the splice/push
 *              pair that would "truncate" driverQueue is two adjacent synchronous
 *              statements with nothing throwable between them.
 *   FALSE      "invisible to every later dispatch, never delivered". All three
 *              dispatch maps — driverQueue, batchedOrderIds, driverAssignments —
 *              are rebuilt from Firestore on boot, so a restart recovers them.
 *
 * That last point is also what makes the fix safe: the process can now exit on a
 * fatal fault and let PM2 restart it, because a restart re-derives its state.
 *
 * These tests spawn real Node processes running the handler lifted from the shipped
 * source. They assert on exit codes and survival, not on the presence of keywords.
 *
 * Run:  node --test tests/unit/fatal-exit.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const INDEX = readFileSync(join(root, "server/index.ts"), "utf8");
const ROUTES = readFileSync(join(root, "server/routes.ts"), "utf8");
const ECOSYSTEM = readFileSync(join(root, "ecosystem.config.js"), "utf8");

/** A full `process.on("<event>", …)` registration, by paren matching. */
function handlerFor(event) {
  const at = INDEX.indexOf(`process.on("${event}"`);
  assert.ok(at > 0, `no handler registered for ${event}`);
  let depth = 0;
  for (let i = INDEX.indexOf("(", at); i < INDEX.length; i += 1) {
    if (INDEX[i] === "(") depth += 1;
    else if (INDEX[i] === ")") {
      depth -= 1;
      if (depth === 0) return `${INDEX.slice(at, i + 1)};`;
    }
  }
  throw new Error(`unbalanced handler for ${event}`);
}

/** The shipped fatalExit helper, with its TypeScript annotations removed. */
function fatalExitHelper() {
  const at = INDEX.indexOf("function fatalExit(");
  assert.ok(at > 0, "fatalExit disappeared — the fatal path is gone");
  let depth = 0;
  for (let i = INDEX.indexOf("{", at); i < INDEX.length; i += 1) {
    if (INDEX[i] === "{") depth += 1;
    else if (INDEX[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        const body = INDEX.slice(at, i + 1).replace(/: string/g, "").replace(/: void/g, "");
        return `let fatalExitStarted = false;\nlet _httpServer = null;\n${body}\n`;
      }
    }
  }
  throw new Error("unbalanced fatalExit");
}

const DIR = mkdtempSync(join(tmpdir(), "h44-"));

/**
 * Run the lifted handler in a real Node process, trigger a fault, and see whether
 * the process is still alive well after the handler's exit deadline.
 */
function runFault({ handler, trigger, probeMs = 1500 }) {
  const file = join(DIR, `t-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(file, [
    fatalExitHelper(),
    handler,
    trigger,
    `setTimeout(() => { console.log("STILL_ALIVE"); process.exit(0); }, ${probeMs});`,
  ].join("\n"));
  let out = "";
  let code = 0;
  try {
    out = execFileSync(process.execPath, [file], {
      encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 15000,
    });
  } catch (e) {
    out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    code = e.status ?? -1;
  }
  rmSync(file, { force: true });
  return { alive: out.includes("STILL_ALIVE"), code, out };
}

// ─────────────────────────────────────────────────────────────────────────────
describe("H-44 · a fatal fault takes the process down", () => {
  test("an uncaught exception exits non-zero instead of being logged and ignored", () => {
    const r = runFault({
      handler: handlerFor("uncaughtException"),
      trigger: `setTimeout(() => { throw new Error("boom"); }, 20);`,
    });
    assert.equal(r.alive, false,
      "the process kept serving after an uncaught exception — H-44 has regressed");
    assert.equal(r.code, 1, `expected exit 1, got ${r.code}`);
  });

  test("an unhandled rejection does the same", () => {
    const r = runFault({
      handler: handlerFor("unhandledRejection"),
      trigger: `Promise.reject(new Error("boom"));`,
    });
    assert.equal(r.alive, false, "the process kept serving after an unhandled rejection");
    assert.equal(r.code, 1, `expected exit 1, got ${r.code}`);
  });

  test("the original error is still logged before exiting", () => {
    const r = runFault({
      handler: handlerFor("uncaughtException"),
      trigger: `setTimeout(() => { throw new Error("distinctive-marker"); }, 20);`,
    });
    assert.match(r.out, /distinctive-marker/,
      "the underlying error was swallowed — the exit tells nobody what happened");
    assert.match(r.out, /\[FATAL\]/, "the fatal reason is not reported");
  });

  test("a second fault while exiting does not restart the sequence", () => {
    // Without the guard, a throw inside the exit path re-enters fatalExit and can
    // loop or reset the deadline.
    const r = runFault({
      handler: handlerFor("uncaughtException"),
      trigger: `setTimeout(() => { throw new Error("first"); }, 20);
                setTimeout(() => { throw new Error("second"); }, 60);
                setTimeout(() => { throw new Error("third"); }, 100);`,
    });
    assert.equal(r.alive, false, "repeated faults kept the process alive");
    assert.equal(r.code, 1);
    assert.equal((r.out.match(/\[FATAL\]/g) ?? []).length, 1,
      "the fatal sequence ran more than once");
  });

  test("a healthy process is untouched — no spurious exit", () => {
    const r = runFault({
      handler: handlerFor("uncaughtException"),
      trigger: `/* nothing goes wrong */`,
      probeMs: 300,
    });
    assert.equal(r.alive, true, "the handler exits a process that never faulted");
    assert.equal(r.code, 0);
  });
});

describe("H-44 · exiting is safe because a restart rebuilds the state", () => {
  // This is the precondition for the fix. If any of these restores disappears,
  // exiting would start stranding the very orders the finding worried about.
  for (const [what, marker] of [
    ["the driver queue", /\[QUEUE_RESTORE\] Restored \$\{driverQueue\.length\}/],
    ["the batched-order set", /bData\.orderIds\.forEach\(id => batchedOrderIds\.add\(id\)\)/],
    ["driver→order assignments", /driverAssignments\.set\(o\.id, String\(driverPhone\)\)/],
  ]) {
    test(`${what} is rebuilt from Firestore on boot`, () => {
      assert.match(ROUTES, marker,
        `${what} is no longer restored at boot — exiting on a fault would strand orders`);
    });
  }

  test("PM2 restarts the process, with a ceiling on restart loops", () => {
    assert.match(ECOSYSTEM, /max_restarts:\s*10/,
      "the restart ceiling went away — a persistent fault would loop forever");
    assert.match(ECOSYSTEM, /restart_delay:\s*3000/, "the restart delay changed");
    assert.match(ECOSYSTEM, /min_uptime:\s*"10s"/, "the uptime qualifier changed");
  });

  test("graceful shutdown on SIGTERM is untouched", () => {
    // The fatal path must not have replaced the orderly one.
    // H-45 made gracefulShutdown async (it now awaits the Socket.IO/timer
    // release before draining HTTP), so the handlers wrap it in `void`.
    assert.match(INDEX, /process\.on\("SIGTERM", \(\) => \{ void gracefulShutdown\("SIGTERM"\); \}\)/);
    assert.match(INDEX, /process\.on\("SIGINT",\s+\(\) => \{ void gracefulShutdown\("SIGINT"\); \}\)/);
    assert.match(INDEX, /_httpServer\.close\(\(\) => \{[\s\S]{0,200}process\.exit\(0\)/,
      "SIGTERM no longer drains connections before exiting");
  });
});

describe("H-44 · the finding's stated failure path, re-checked", () => {
  // Recorded because the report will be read again: the mechanism the finding
  // describes is not the mechanism that was wrong.
  test("the offer-timeout sweep catches its own exceptions", () => {
    const at = ROUTES.indexOf("const OFFER_TIMEOUT_MS");
    assert.ok(at > 0, "the offer-timeout sweep disappeared");
    const sweep = ROUTES.slice(at, at + 3000);
    // H-45 routed every periodic job through everyMs() so shutdown can stop it.
    assert.match(sweep, /everyMs\([^)]*, async \(\) => \{\s*try \{/,
      "the sweep lost its own try — its faults would now reach the global handler");
    assert.match(sweep, /\} catch \(e\) \{\s*console\.error\("\[OFFER_TIMEOUT\] error:", e\);/,
      "the sweep's catch changed");
  });

  test("the queue splice and re-push stay adjacent, with nothing throwable between", () => {
    const at = ROUTES.indexOf("const idx = driverQueue.findIndex(d => d.phoneNumber === qd.phoneNumber);");
    assert.ok(at > 0, "the requeue block moved");
    const block = ROUTES.slice(at, at + 400);
    const splice = block.indexOf("driverQueue.splice(idx, 1);");
    const push = block.indexOf("driverQueue.push({");
    assert.ok(splice > 0 && push > splice, "the splice/push pair changed order");
    const between = block.slice(splice + "driverQueue.splice(idx, 1);".length, push);
    assert.doesNotMatch(between, /await |\(\)|throw /,
      `something that can throw appeared between the splice and the re-push: ${between.trim()}`);
  });

  test("the release frees the orders before touching the queue", () => {
    const at = ROUTES.indexOf("const released = await cancelBatchIfPending(batchId);");
    assert.ok(at > 0, "the release guard disappeared");
    const after = ROUTES.slice(at, at + 700);
    const free = after.indexOf("batchedOrderIds.delete(id)");
    const requeue = after.indexOf("driverQueue.splice(");
    assert.ok(free > 0 && requeue > free,
      "orders are no longer freed before the driver is requeued");
  });
});

describe("H-44 · nothing else about process handling changed", () => {
  test("there are still exactly the five process handlers", () => {
    const events = [...INDEX.matchAll(/process\.on\("(\w+)"/g)].map((m) => m[1]).sort();
    assert.deepEqual(events, ["SIGINT", "SIGTERM", "exit", "uncaughtException", "unhandledRejection"],
      "a process handler was added or removed");
  });

  test("the exit-code logger is still passive", () => {
    const at = INDEX.indexOf('process.on("exit"');
    const handler = INDEX.slice(at, INDEX.indexOf("});", at));
    assert.doesNotMatch(handler, /process\.exit|fatalExit/,
      "the exit logger now acts, which can mask the real exit code");
  });

  test("the startup guards still exit rather than continue", () => {
    assert.match(INDEX, /Refusing to start in production[\s\S]{0,120}process\.exit\(1\)/,
      "the JWT startup guard stopped exiting");
    assert.match(INDEX, /EADDRINUSE[\s\S]{0,400}process\.exit\(1\)/,
      "the duplicate-instance guard stopped exiting");
  });
});
