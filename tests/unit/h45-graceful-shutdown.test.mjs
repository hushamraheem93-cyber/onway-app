/**
 * H-45 — "الإغلاق السلس يتجاهل Socket والمؤقّتات والحالة".
 *
 * Three separate defects under one heading:
 *
 *   1. gracefulShutdown called _httpServer.close() and nothing else. Socket.IO
 *      held every client connection open, so close() could never drain and the
 *      10s force-exit timer was what actually ended the process — cutting off
 *      in-flight requests on every deploy.
 *   2. Six periodic jobs (rate-limit sweep, stale orders, settlement sweep,
 *      dispatch watchdog, ghost-driver cleanup, offer timeout) were untracked
 *      setInterval calls. Nothing held a handle, so nothing could stop them.
 *   3. driverAssignments — the map that authorises live driver tracking — was
 *      never rebuilt after boot, so a restart left in-flight customers with no
 *      tracking map. THIS ONE WAS ALREADY FIXED before this pass (routes.ts,
 *      [ASSIGN_RESTORE]); it is asserted here so it cannot regress unnoticed.
 *
 * Behaviour is proved over a real HTTP + Socket.IO server by
 * scratchpad/h45-live.mjs — 11 assertions, 5 of which fail on HEAD, and where
 * the decisive proof is that the process now exits on its own (it used to hang).
 * Guards are mutation-tested by scratchpad/h45-mutations.mjs (4/4 caught).
 *
 * Run:  node --test tests/unit/h45-graceful-shutdown.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments } from "./_source.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const INDEX = stripComments(readFileSync(join(root, "server/index.ts"), "utf8"));
const ROUTES = stripComments(readFileSync(join(root, "server/routes.ts"), "utf8"));

describe("H-45 · every periodic job is tracked, so it can be stopped", () => {
  test("routes.ts registers its jobs through a registry, not bare setInterval", () => {
    assert.match(ROUTES, /const backgroundTimers: ReturnType<typeof setInterval>\[\] = \[\];/,
      "the job registry disappeared");
    assert.match(ROUTES, /backgroundTimers\.push\(setInterval\(fn, ms\)\);/);
  });

  test("no bare setInterval survives in routes.ts", () => {
    // Exactly one setInterval may exist: the one inside the registry helper.
    const all = ROUTES.match(/setInterval\(/g) ?? [];
    assert.equal(all.length, 1,
      `${all.length} setInterval calls — every periodic job must go through everyMs()`);
  });

  test("all four route-level jobs go through everyMs", () => {
    // The declaration reads `const everyMs = (ms, fn) =>`, so every `everyMs(`
    // match is a call site: settlement sweep, dispatch watchdog, ghost-driver
    // cleanup, offer timeout.
    const calls = ROUTES.match(/everyMs\(/g) ?? [];
    assert.equal(calls.length, 4,
      `expected 4 registered jobs, found ${calls.length}`);
  });

  test("index.ts tracks its own two jobs", () => {
    assert.match(INDEX, /const serverTimers: ReturnType<typeof setInterval>\[\] = \[\];/);
    const pushes = INDEX.match(/serverTimers\.push\(setInterval\(/g) ?? [];
    assert.equal(pushes.length, 2,
      `expected both index.ts jobs registered, found ${pushes.length}`);
  });

  test("no bare setInterval survives in index.ts", () => {
    const bare = INDEX.match(/(?<!serverTimers\.push\()setInterval\(/g) ?? [];
    assert.equal(bare.length, 0, "an untracked periodic job came back");
  });
});

describe("H-45 · shutdown releases Socket.IO and the jobs, in that order", () => {
  test("registerRoutes exposes a shutdown hook on the server it returns", () => {
    assert.match(ROUTES, /\(httpServer as any\)\.onwayShutdown = async \(\): Promise<void> => \{/,
      "the shutdown hook is gone — index.ts has no way to release Socket.IO");
  });

  test("the hook clears the timers AND closes Socket.IO", () => {
    const at = ROUTES.indexOf("(httpServer as any).onwayShutdown");
    const hook = ROUTES.slice(at, ROUTES.indexOf("return httpServer;", at));
    assert.match(hook, /for \(const t of backgroundTimers\) clearInterval\(t\);/,
      "shutdown no longer stops the periodic jobs");
    assert.match(hook, /ioServer\.close\(done\);/,
      "shutdown no longer disconnects Socket.IO clients");
  });

  test("the hook cannot hang forever on a stuck client", () => {
    const at = ROUTES.indexOf("(httpServer as any).onwayShutdown");
    const hook = ROUTES.slice(at, ROUTES.indexOf("return httpServer;", at));
    assert.match(hook, /setTimeout\(done, 3_000\)\.unref\(\);/,
      "a stuck socket could hold shutdown open indefinitely");
  });

  test("gracefulShutdown awaits the hook BEFORE draining HTTP", () => {
    const at = INDEX.indexOf("async function gracefulShutdown");
    assert.ok(at > 0, "gracefulShutdown disappeared");
    const body = INDEX.slice(at, INDEX.indexOf("process.on(\"SIGTERM\"", at));
    const hookAt = body.indexOf("releaseRoutes");
    const closeAt = body.indexOf("_httpServer.close(");
    assert.ok(hookAt > 0, "gracefulShutdown never calls the route cleanup");
    assert.ok(closeAt > hookAt,
      "HTTP is drained before Socket.IO is released — close() cannot finish");
    assert.match(body, /for \(const t of serverTimers\) clearInterval\(t\);/,
      "index.ts's own jobs are not stopped");
  });

  test("shutdown runs once even if both signals arrive", () => {
    assert.match(INDEX, /let shutdownStarted = false;/);
    const at = INDEX.indexOf("async function gracefulShutdown");
    const body = INDEX.slice(at, at + 400);
    assert.match(body, /if \(shutdownStarted\) return;/,
      "a second signal would re-enter shutdown");
  });

  test("both signals are still wired", () => {
    assert.match(INDEX, /process\.on\("SIGTERM"/);
    assert.match(INDEX, /process\.on\("SIGINT"/);
  });

  test("the 10s force-exit backstop is kept", () => {
    // It should now be a backstop rather than the normal path, but removing it
    // would let a pathological connection hang a deploy forever.
    assert.match(INDEX, /Forced exit after 10s timeout/);
  });
});

describe("H-45 · dispatch state survives a restart", () => {
  test("driverAssignments is rebuilt at boot from persisted orders", () => {
    assert.match(ROUTES, /\[ASSIGN_RESTORE\]/,
      "the driver→order map is no longer rebuilt after a restart");
    assert.match(ROUTES, /driverAssignments\.set\(o\.id, String\(driverPhone\)\)/);
  });

  test("only in-flight orders are restored, not delivered ones", () => {
    const at = ROUTES.indexOf("[ASSIGN_RESTORE]");
    const block = ROUTES.slice(Math.max(0, at - 900), at);
    assert.match(block, /getOrdersByStatus\("preparing"\)/);
    assert.match(block, /getOrdersByStatus\("in_delivery"\)/);
    assert.ok(!/getOrdersByStatus\("delivered"\)/.test(block),
      "delivered orders would be restored into the live assignment map");
  });

  test("the driver queue is restored too", () => {
    assert.match(ROUTES, /\[QUEUE_RESTORE\]/,
      "the active driver queue is no longer restored at boot");
  });
});
