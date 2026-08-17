/**
 * OrderTrackingScreen duplication tests (audit finding H-42).
 *
 * The finding: the tracking screen polls every 10s while OrderContext already
 * polls, opens a second socket, adds an 8s fallback poll, and has no app-state
 * guard — "two connections open and ~19 requests a minute during one delivery".
 *
 * Measured against HEAD by lifting the real useEffect bodies and running them, the
 * claims split up:
 *
 *   CONFIRMED   the 10s poll was `setInterval(refreshOrders, 10000)` — the same
 *               function at the same interval as OrderContext's own poll.
 *   CONFIRMED   no app-state guard: the screen kept polling in the background,
 *               where the context correctly stops.
 *   CONFIRMED   no status guard either: a delivered or cancelled order kept being
 *               polled for as long as the screen stayed mounted, and a stack
 *               screen stays mounted when another screen is pushed over it.
 *   CONFIRMED   the request rate — measured at 21/min with the socket down
 *               (the finding said ~19), 14/min with it up.
 *   PARTIAL     the 8s fallback is real but was always conditional: it only
 *               fetches while the socket is disconnected AND the order is
 *               in flight.
 *   FALSE       nothing leaks. Five open/close cycles left 0 live sockets and
 *               0 live timers; both cleanups were already correct.
 *
 * The fix removes the duplicated poll outright — the context's copy is strictly
 * better, being app-state gated and socket-driven — and puts the same app-state
 * guard on the driver-location fallback. The second socket is deliberately kept:
 * it joins the per-order room for `order:driverLocation` (live GPS), which the
 * context's socket does not carry. See the report for why deduplicating it needs
 * an owner decision.
 *
 * These tests execute the screen's and the context's REAL effect bodies against
 * injected timers and sockets. Nothing is asserted from source text alone except
 * where a structural guarantee is the point.
 *
 * Run:  node --test tests/unit/order-tracking-duplication.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { stripComments } from "./_source.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const ts = createRequire(import.meta.url)("typescript");
const SCREEN = readFileSync(join(root, "client/screens/OrderTrackingScreen.tsx"), "utf8");
const CONTEXT = readFileSync(join(root, "client/context/OrderContext.tsx"), "utf8");
const SCREEN_CLEAN = stripComments(SCREEN);
const CONTEXT_CLEAN = stripComments(CONTEXT);

/** The full `useEffect(...)` call that starts at or after `marker`. */
function effectAfter(src, marker) {
  const from = src.indexOf("useEffect(", src.indexOf(marker));
  assert.ok(from > 0, `no useEffect after ${JSON.stringify(marker)}`);
  let depth = 0;
  for (let i = from + 9; i < src.length; i += 1) {
    if (src[i] === "(") depth += 1;
    else if (src[i] === ")") {
      depth -= 1;
      if (depth === 0) return src.slice(from, i + 1);
    }
  }
  throw new Error("unbalanced useEffect");
}

/**
 * The `useEffect(...)` call that CONTAINS `codeMarker`, found by scanning back to
 * the nearest `useEffect(`. Anchoring on code rather than on a comment matters:
 * these are run against comment-stripped source, where a `//` marker is gone.
 */
function effectContaining(src, codeMarker) {
  const at = src.indexOf(codeMarker);
  assert.ok(at > 0, `code marker not found: ${codeMarker}`);
  const from = src.lastIndexOf("useEffect(", at);
  assert.ok(from > 0, `no useEffect wraps ${codeMarker}`);
  let depth = 0;
  for (let i = from + 9; i < src.length; i += 1) {
    if (src[i] === "(") depth += 1;
    else if (src[i] === ")") {
      depth -= 1;
      if (depth === 0) return src.slice(from, i + 1);
    }
  }
  throw new Error("unbalanced useEffect");
}

/** Execute a lifted effect once; returns its cleanup function if it made one. */
function runEffect(source, scope) {
  const js = ts.transpileModule(
    `exports.run = function(){ const useEffect = (fn) => { exports.cleanup = fn(); }; ${source}; };`,
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.React,
      },
    },
  ).outputText;
  const exports = {};
  const names = Object.keys(scope);
  // eslint-disable-next-line no-new-func
  new Function("exports", ...names, js)(exports, ...names.map((n) => scope[n]));
  exports.run();
  return exports.cleanup;
}

/** A world with countable timers and sockets. */
function makeWorld() {
  const w = {
    timers: [], sockets: [],
    setInterval(fn, ms) { const t = { fn, ms, alive: true }; w.timers.push(t); return t; },
    clearInterval(t) { if (t) t.alive = false; },
    io() {
      const s = {
        events: [], connected: true, joined: [],
        on(ev, cb) { s.events.push(ev); (s[`_${ev}`] ??= []).push(cb); return s; },
        emit(ev, payload) { s.joined.push([ev, payload]); },
        disconnect() { s.connected = false; },
      };
      w.sockets.push(s);
      return s;
    },
    tick(seconds) {
      for (const t of w.timers) {
        if (!t.alive) continue;
        for (let i = 0; i < Math.floor((seconds * 1000) / t.ms); i += 1) t.fn();
      }
    },
    liveTimers: () => w.timers.filter((t) => t.alive).length,
    liveSockets: () => w.sockets.filter((s) => s.connected).length,
  };
  return w;
}

const TRACKING = { id: "o-1", status: "in_delivery", latitude: 34.4, longitude: 43.8 };

/** Mount the screen's effects. Returns counters and the cleanup list. */
function mountScreen({ order = TRACKING, socketConnected = true, appActive = true } = {}) {
  const w = makeWorld();
  let refreshCalls = 0;
  let gpsFetches = 0;
  const scope = {
    setInterval: w.setInterval, clearInterval: w.clearInterval, io: w.io,
    refreshOrders: () => { refreshCalls += 1; },
    fetchDriverLocation: () => { gpsFetches += 1; },
    orderId: order?.id, order, customerToken: "tok", appActive,
    getApiUrl: () => "http://x",
    socketRef: { current: null },
    socketConnectedRef: { current: socketConnected },
    setDriverLocation: () => {}, setMapHtml: () => {},
    mapInitializedRef: { current: false }, webViewRef: { current: null },
    getTrackingMapHTML: () => "<html>",
  };
  const cleanups = [];
  for (const marker of ["// Socket.io: real-time driver", "// HTTP Polling fallback"]) {
    cleanups.push(runEffect(effectAfter(SCREEN, marker), scope));
  }
  return {
    w, cleanups,
    refreshCalls: () => refreshCalls,
    gpsFetches: () => gpsFetches,
  };
}

function mountContext({ appActive = true } = {}) {
  const w = makeWorld();
  let refreshCalls = 0;
  const scope = {
    setInterval: w.setInterval, clearInterval: w.clearInterval, io: w.io,
    refreshOrders: () => { refreshCalls += 1; },
    phoneNumber: "07700000001", isInitialized: true, appActive,
    getApiUrl: () => "http://x",
    ordersSocketRef: { current: null },
  };
  const cleanups = [];
  for (const marker of ["// H-25: gated on the state flag", "const ordersSocketRef"]) {
    cleanups.push(runEffect(effectAfter(CONTEXT, marker), scope));
  }
  return { w, cleanups, refreshCalls: () => refreshCalls };
}

// ─────────────────────────────────────────────────────────────────────────────
describe("H-42 · the duplicated poll is gone", () => {
  test("the screen no longer creates a refreshOrders interval", () => {
    assert.doesNotMatch(SCREEN_CLEAN, /setInterval\(\s*\(\s*\)\s*=>\s*\{?\s*refreshOrders\(\)/,
      "the screen is polling the order list again, duplicating OrderContext");
    assert.doesNotMatch(SCREEN_CLEAN, /setInterval\(refreshOrders/,
      "the screen is polling the order list again, duplicating OrderContext");
  });

  test("the context still owns that poll, at the same interval", () => {
    assert.match(CONTEXT_CLEAN, /setInterval\(refreshOrders, 10000\)/,
      "the single source of order polling disappeared — the screen now has none either");
  });

  test("the screen keeps only the driver-location timer while tracking", () => {
    const s = mountScreen();
    assert.equal(s.w.liveTimers(), 1,
      `${s.w.liveTimers()} timers — the duplicate poll is back`);
  });

  test("during one minute of delivery the screen issues no order-list requests", () => {
    const s = mountScreen();
    s.w.tick(60);
    assert.equal(s.refreshCalls(), 0,
      "the screen fetched the order list; that is the context's job");
  });

  test("the order list is still refreshed — by the context, every 10s", () => {
    const c = mountContext();
    c.w.tick(60);
    // one immediate call on mount + six ticks
    assert.equal(c.refreshCalls(), 7, "the context stopped refreshing the order list");
  });
});

describe("H-42 · request rate, measured", () => {
  const rate = ({ socketConnected, appActive }) => {
    const s = mountScreen({ socketConnected, appActive });
    const c = mountContext({ appActive });
    s.w.tick(60); c.w.tick(60);
    return s.refreshCalls() + s.gpsFetches() + c.refreshCalls();
  };

  test("socket up: 8 requests a minute", () => {
    assert.equal(rate({ socketConnected: true, appActive: true }), 8);
  });

  test("socket down: 15 a minute, all of them the GPS fallback", () => {
    assert.equal(rate({ socketConnected: false, appActive: true }), 15);
  });

  test("both stay well under the 21/min measured before the fix", () => {
    assert.ok(rate({ socketConnected: false, appActive: true }) < 21);
    assert.ok(rate({ socketConnected: true, appActive: true }) < 14);
  });
});

describe("H-42 · background and foreground", () => {
  test("backgrounded, the screen starts no timer and issues no request", () => {
    const s = mountScreen({ appActive: false });
    s.w.tick(60);
    assert.equal(s.w.liveTimers(), 0, "a timer kept running in the background");
    assert.equal(s.gpsFetches(), 0, "the screen fetched GPS while backgrounded");
    assert.equal(s.refreshCalls(), 0);
  });

  test("the context also stops in the background — nothing polls at all", () => {
    const c = mountContext({ appActive: false });
    c.w.tick(60);
    assert.equal(c.w.liveTimers(), 0);
    assert.equal(c.refreshCalls(), 0);
  });

  test("returning to foreground fetches once immediately, then resumes", () => {
    const s = mountScreen({ appActive: true });
    assert.equal(s.gpsFetches(), 1, "no immediate fetch on becoming active");
    s.w.tick(8 * 5);
    assert.equal(s.w.liveTimers(), 1, "the interval did not restart");
  });

  test("backgrounding does NOT tear down the map state", () => {
    // The effect's else-branch clears driverLocation/mapHtml. It must fire only
    // when the order stops being trackable, never merely because the app blurred —
    // otherwise the map rebuilds from scratch on every return to foreground.
    const body = effectContaining(SCREEN_CLEAN, "mapInitializedRef.current = false");
    assert.match(body, /\}\s*else if \(!tracking\)\s*\{/,
      "the map-clearing branch is not guarded on !tracking, so backgrounding wipes the map");
  });

  test("the app-state listener is removed on unmount", () => {
    assert.match(SCREEN_CLEAN, /return \(\) => sub\.remove\(\)/,
      "the AppState subscription leaks");
  });
});

describe("H-42 · a finished order stops everything", () => {
  for (const status of ["delivered", "cancelled"]) {
    test(`${status}: no timers, no socket, no requests`, () => {
      const s = mountScreen({ order: { ...TRACKING, status } });
      s.w.tick(60);
      assert.equal(s.w.liveTimers(), 0, `a timer kept running for a ${status} order`);
      assert.equal(s.w.liveSockets(), 0, `a socket stayed open for a ${status} order`);
      assert.equal(s.refreshCalls() + s.gpsFetches(), 0,
        `requests continued for a ${status} order`);
    });
  }

  test("an in-flight order does keep its socket", () => {
    const s = mountScreen({ order: TRACKING });
    assert.equal(s.w.liveSockets(), 1, "live tracking lost its socket");
  });
});

describe("H-42 · cleanup: unmount and repeated navigation", () => {
  test("unmount clears every timer and closes the socket", () => {
    const s = mountScreen();
    for (const c of s.cleanups) if (typeof c === "function") c();
    assert.equal(s.w.liveTimers(), 0, "a timer survived unmount");
    assert.equal(s.w.liveSockets(), 0, "a socket survived unmount");
  });

  test("opening and closing the screen ten times leaves nothing behind", () => {
    let liveTimers = 0, liveSockets = 0, created = 0;
    for (let i = 0; i < 10; i += 1) {
      const s = mountScreen();
      for (const c of s.cleanups) if (typeof c === "function") c();
      liveTimers += s.w.liveTimers();
      liveSockets += s.w.liveSockets();
      created += s.w.sockets.length;
    }
    assert.equal(created, 10, "one socket per visit is expected");
    assert.equal(liveTimers, 0, "timers accumulated across visits");
    assert.equal(liveSockets, 0, "sockets accumulated across visits");
  });

  test("each visit registers its listeners on a fresh socket, so none stack up", () => {
    const s = mountScreen();
    const sock = s.w.sockets[0];
    assert.deepEqual(sock.events, ["connect", "disconnect", "order:driverLocation"],
      "the socket's listener set changed");
    // A second mount must not add listeners to the first socket.
    const s2 = mountScreen();
    assert.equal(s.w.sockets.length, 1);
    assert.equal(s2.w.sockets[0].events.length, 3, "listeners stacked on one socket");
  });
});

describe("H-42 · the second socket is not a duplicate — it carries different data", () => {
  test("the screen's socket joins the per-order room for live GPS", () => {
    const s = mountScreen();
    const sock = s.w.sockets[0];
    assert.ok(sock.events.includes("order:driverLocation"),
      "the screen's socket no longer listens for the driver's position");
    // The join is emitted from the connect handler.
    assert.match(SCREEN_CLEAN, /sock\.emit\("order:watch", \{ orderId \}\)/,
      "the screen stopped joining the order room, so GPS would never arrive");
  });

  test("the context's socket carries only the refresh ping", () => {
    const c = mountContext();
    assert.deepEqual(c.w.sockets[0].events, ["orders:changed"],
      "the context's socket changed shape — re-check whether the two overlap");
  });

  test("neither socket subscribes to what the other does", () => {
    const s = mountScreen();
    const c = mountContext();
    const screenEvents = new Set(s.w.sockets[0].events);
    const contextEvents = new Set(c.w.sockets[0].events);
    const overlap = [...screenEvents].filter((e) => contextEvents.has(e));
    assert.deepEqual(overlap, [],
      `both sockets listen for ${overlap.join(", ")} — that IS duplication now`);
  });
});

describe("H-42 · behaviour that must not have changed", () => {
  test("the GPS fallback still only fires while the socket is down", () => {
    const up = mountScreen({ socketConnected: true });
    up.w.tick(60);
    assert.equal(up.gpsFetches(), 1, "only the immediate fetch should happen on a live socket");

    const down = mountScreen({ socketConnected: false });
    down.w.tick(60);
    assert.equal(down.gpsFetches(), 8, "the fallback stopped covering a dropped socket");
  });

  test("the fallback interval is still 8s and the context poll still 10s", () => {
    const s = mountScreen();
    assert.deepEqual(s.w.timers.map((t) => t.ms), [8000], "the GPS fallback interval changed");
    const c = mountContext();
    assert.deepEqual(c.w.timers.map((t) => t.ms), [10000], "the context poll interval changed");
  });

  test("pull-to-refresh still refreshes the orders directly", () => {
    assert.match(SCREEN_CLEAN, /const handleRefresh = useCallback\(async \(\) => \{[\s\S]*?await refreshOrders\(\)/,
      "the manual refresh path lost its order refresh");
  });

  test("the screen still reads order state from the context", () => {
    assert.match(SCREEN_CLEAN, /const \{ orders, refreshOrders \} = useOrders\(\)/,
      "the screen stopped using the shared order state");
    assert.match(SCREEN_CLEAN, /const order = orders\.find\(\(o\) => o\.id === orderId\)/,
      "the screen's order lookup changed — status display may differ");
  });

  test("the tracking statuses that open the socket are unchanged", () => {
    // C-1 dropped "delivering" from the list. It was an inert third alternative:
    // the server has never written that status, and every condition already tested
    // `in_delivery` alongside it, so no order could reach tracking through it. The
    // two statuses that actually occur are asserted here, unchanged.
    const socketEffect = effectContaining(SCREEN_CLEAN, 'sock.emit("order:watch"');
    for (const s of ["in_delivery", "picked_up"]) {
      assert.ok(socketEffect.includes(`"${s}"`), `${s} no longer counts as tracking`);
    }
    assert.ok(!socketEffect.includes('"delivering"'),
      "the phantom status is back in the tracking gate");
  });
});
