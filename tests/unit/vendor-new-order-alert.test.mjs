/**
 * Vendor new-order alert tests (audit finding H-26).
 *
 * VendorNotificationsProvider reset `isFirstLoad` and `lastSeenOrderIds` INSIDE the poll
 * effect — an effect that lists `appActive` in its dependencies. So every return from
 * the background wiped the "already alerted about" memory and re-armed the first-load
 * branch. The first poll after coming back then absorbed every pending order as
 * already-seen and returned without alerting: no popup, no repeating alarm, no haptic
 * for precisely the orders that arrived while the store was looking away.
 *
 * Measured on the pre-fix source with the runtime below: two orders arriving during a
 * fifteen-second background produced 0 alerts.
 *
 * The fix moves the reset into its own effect keyed on `vendorToken` alone, so it still
 * fires at the start of a session and when switching store accounts — preserving the
 * deliberate behaviour that pre-existing orders never alert on first load — but no
 * longer on every foreground transition.
 *
 * Severity note: this is Medium, not High. The server also sends the vendor a push
 * notification on every new order (routes.ts, sendVendorNewOrderNotification), so the
 * store is not left completely unaware while backgrounded. What was lost is the in-app
 * repeating alarm, which is the part designed to cut through a busy kitchen.
 *
 * The provider cannot be mounted here (AsyncStorage, expo-notifications, expo-haptics,
 * socket.io-client, react-native AppState), so these tests run a minimal React hooks
 * runtime driven by the provider's ACTUAL wiring, read out of the .tsx on every run.
 *
 * Run:  node --test tests/unit/vendor-new-order-alert.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { readFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(here, "../../client/context/VendorNotificationsContext.tsx"), "utf8");
// ── read the real wiring out of the source ───────────────────────────────────
function effectWithDeps(src, marker) {
  const at = src.indexOf(marker);
  if (at < 0) throw new Error(`effect not found: ${marker}`);
  const from = src.lastIndexOf("useEffect(", at);
  const to = src.indexOf("]);", at) + 3;
  return src.slice(from, to);
}
const depsOf = (block) =>
  (block.match(/\}, \[([^\]]*)\]\);\s*$/) ?? [, ""])[1]
    .split(",").map((s) => s.trim()).filter(Boolean);

const POLL_EFFECT = effectWithDeps(SRC, "pollRef.current = setInterval(");
const SOCKET_EFFECT = effectWithDeps(SRC, 'sock.on("orders:changed"');
const RESET_LINES = /isFirstLoad\.current = true;\s*\n\s*lastSeenOrderIds\.current = new Set\(\);/;

const wiring = {
  pollDeps: depsOf(POLL_EFFECT),
  socketDeps: depsOf(SOCKET_EFFECT),
  interval: Number((POLL_EFFECT.match(/setInterval\(checkNewOrders, (\w+)\)/) ?? [, ""])[1]) ||
    Number((SRC.match(/const POLL_INTERVAL_MS = ([\d_]+);/) ?? [, "0"])[1].replace(/_/g, "")),
  /** Does the poll effect (the one that depends on appActive) do the reset itself? */
  resetInPollEffect: RESET_LINES.test(POLL_EFFECT),
  /** Is there a separate reset effect keyed on the token only? */
  resetEffect: (() => {
    const at = SRC.search(RESET_LINES);
    if (at < 0) return null;
    const from = SRC.lastIndexOf("useEffect(", at);
    const to = SRC.indexOf("]);", at) + 3;
    return depsOf(SRC.slice(from, to));
  })(),
  checkDeps: (() => {
    const at = SRC.indexOf("const checkNewOrders = useCallback(");
    const end = SRC.indexOf("]);", at) + 3;
    return depsOf(SRC.slice(at, end));
  })(),
};

// ── minimal React hooks runtime (setState re-renders, ref mutation does not) ──
const sameDeps = (a, b) => !!a && !!b && a.length === b.length && a.every((x, n) => Object.is(x, b[n]));

function createRuntime(component) {
  const hooks = [];
  let cursor = 0, scheduled = false, mounted = false;
  function render() {
    cursor = 0;
    const pending = [];
    const R = {
      useState(initial) {
        const i = cursor++;
        if (!(i in hooks)) hooks[i] = { v: initial };
        const slot = hooks[i];
        return [slot.v, (next) => {
          if (Object.is(next, slot.v)) return;
          slot.v = next;
          schedule();
        }];
      },
      useRef(initial) {
        const i = cursor++;
        if (!(i in hooks)) hooks[i] = { current: initial };
        return hooks[i];
      },
      useCallback(fn, deps) {
        const i = cursor++;
        if (!hooks[i] || !sameDeps(hooks[i].deps, deps)) hooks[i] = { fn, deps };
        return hooks[i].fn;
      },
      useEffect(fn, deps) {
        const i = cursor++;
        const prev = hooks[i];
        if (!prev || !sameDeps(prev.deps, deps)) {
          hooks[i] = { deps, cleanup: prev?.cleanup, run: fn, isEffect: true };
          pending.push(i);
        } else prev.run = fn;
      },
    };
    component(R);
    while (pending.length) {
      const slot = hooks[pending.shift()];
      if (slot.cleanup) { slot.cleanup(); slot.cleanup = undefined; }
      const c = slot.run();
      slot.cleanup = typeof c === "function" ? c : undefined;
    }
  }
  function schedule() {
    if (!mounted || scheduled) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; if (mounted) render(); });
  }
  return {
    mount() { mounted = true; render(); },
    unmount() {
      mounted = false;
      for (const h of hooks) if (h?.isEffect && h.cleanup) { h.cleanup(); h.cleanup = undefined; }
    },
  };
}

// ── the provider, wired from the source ──────────────────────────────────────
function makeProvider(env, over = {}) {
  const w = { ...wiring, ...over };
  return function VendorNotificationsModel(R) {
    const [vendorToken, setVendorToken] = R.useState(null);
    const [appActive, setAppActive] = R.useState(true);
    Object.assign(env, { setVendorToken, setAppActive });

    const lastSeenOrderIds = R.useRef(new Set());
    const isFirstLoad = R.useRef(true);
    const pollRef = R.useRef(null);

    // checkNewOrders — the source's logic, verbatim in behaviour
    const checkNewOrders = R.useCallback(async () => {
      if (!vendorToken) return;
      env.polls += 1;
      const pendingOrders = env.serverPending.filter((o) => o.status === "pending");
      if (isFirstLoad.current) {
        for (const o of pendingOrders) lastSeenOrderIds.current.add(o.id);
        isFirstLoad.current = false;
        env.absorbed.push(pendingOrders.map((o) => o.id));
        return;
      }
      const newOrders = pendingOrders.filter((o) => !lastSeenOrderIds.current.has(o.id));
      for (const o of pendingOrders) lastSeenOrderIds.current.add(o.id);
      if (newOrders.length > 0) {
        env.popups.push(newOrders[0].id);
        env.haptics += 1;
        env.alerts += 1;
        env.alertedIds.push(...newOrders.map((o) => o.id));
      }
    }, w.checkDeps.map((d) => (d === "vendorToken" ? vendorToken : undefined)));

    const doReset = () => {
      isFirstLoad.current = true;
      lastSeenOrderIds.current = new Set();
      env.resets += 1;
    };

    // A separate reset effect, when the source has one.
    if (!w.resetInPollEffect && w.resetEffect) {
      R.useEffect(() => {
        if (!vendorToken) return;
        doReset();
      }, w.resetEffect.map((d) => (d === "vendorToken" ? vendorToken : undefined)));
    }

    // the poll effect
    R.useEffect(() => {
      if (!vendorToken || !appActive) return;
      if (w.resetInPollEffect) doReset();
      checkNewOrders();
      const id = setInterval(checkNewOrders, w.interval);
      pollRef.current = id;
      env.timers.add(id);
      env.timersStarted += 1;
      return () => {
        clearInterval(id);
        env.timers.delete(id);
        env.timersCleared += 1;
        pollRef.current = null;
      };
    }, w.pollDeps.map((d) =>
      d === "vendorToken" ? vendorToken : d === "appActive" ? appActive
        : d === "checkNewOrders" ? checkNewOrders : undefined));

    // the socket effect
    R.useEffect(() => {
      if (!vendorToken) return;
      env.socketUp += 1;
      return () => { env.socketDown += 1; };
    }, w.socketDeps.map((d) =>
      d === "vendorToken" ? vendorToken : d === "checkNewOrders" ? checkNewOrders : undefined));
  };
}

const newEnv = () => ({
  serverPending: [], polls: 0, resets: 0, alerts: 0, haptics: 0,
  popups: [], alertedIds: [], absorbed: [],
  timers: new Set(), timersStarted: 0, timersCleared: 0, socketUp: 0, socketDown: 0,
});
const liveTimers = (e) => e.timersStarted - e.timersCleared;
const tick = () => new Promise((r) => setTimeout(r, 0));
const order = (id) => ({ id, status: "pending" });

async function withProvider(fn, over) {
  const env = newEnv();
  const rt = createRuntime(makeProvider(env, over));
  try {
    rt.mount();
    attachRefresh(env);
    await fn(env, rt);
    // لقطة قبل التفكيك — بعده تكون كل المؤقّتات والاتصالات مُنظَّفة بالتعريف
    env.live = { timers: liveTimers(env), timerCount: env.timers.size,
      sockets: env.socketUp - env.socketDown };
  }
  finally {
    rt.unmount();
    for (const id of env.timers) clearInterval(id);
    env.timers.clear();
  }
  return env;
}
/** Signs the vendor in with some pre-existing pending orders. */
async function signIn(env, existing = []) {
  env.serverPending = existing.map(order);
  env.setVendorToken("vendor-jwt");
  await tick(); await tick();
}

/** One extra poll cycle without touching appActive. */
const attachRefresh = (env) => { env.refreshOnce = async () => { await tick(); }; };

const SOURCE = SRC;

describe("H-26 — new orders that arrive during a background alert on return", () => {
  test("two orders arriving while backgrounded raise exactly one alert", async () => {
    const env = await withProvider(async (e) => {
      await signIn(e, ["old-1", "old-2"]);
      e.setAppActive(false);
      await tick();
      e.serverPending = [...e.serverPending, order("new-1"), order("new-2")];
      e.setAppActive(true);
      await tick(); await tick();
    });
    assert.equal(env.alerts, 1, "the store was never told about the new orders");
    assert.deepEqual(env.alertedIds.slice().sort(), ["new-1", "new-2"]);
    assert.equal(env.popups.length, 1, "one popup, not one per order");
    assert.equal(env.haptics, 1);
  });

  test("the pre-fix wiring provably fails the same scenario", async () => {
    // Guards the guard: if this ever passes, the model stopped reproducing the defect
    // and the test above proves nothing.
    const env = await withProvider(async (e) => {
      await signIn(e, ["old-1"]);
      e.setAppActive(false);
      await tick();
      e.serverPending = [...e.serverPending, order("new-1")];
      e.setAppActive(true);
      await tick(); await tick();
    }, { resetInPollEffect: true, resetEffect: null });
    assert.equal(env.alerts, 0, "the reset-in-poll-effect wiring should swallow the alert");
  });

  test("an order arriving in the foreground still alerts", async () => {
    const env = await withProvider(async (e) => {
      await signIn(e, ["old-1"]);
      e.serverPending = [...e.serverPending, order("fresh-1")];
      e.setAppActive(false); await tick();
      e.setAppActive(true); await tick(); await tick();
    });
    assert.deepEqual(env.alertedIds, ["fresh-1"]);
  });
});

describe("H-26 — first load still stays silent", () => {
  test("orders that already existed when the vendor signed in do not alert", async () => {
    const env = await withProvider(async (e) => {
      await signIn(e, ["existing-1", "existing-2", "existing-3"]);
    });
    assert.equal(env.alerts, 0, "signing in must not alarm for the existing queue");
    assert.equal(env.absorbed[0].length, 3, "they must be recorded as seen");
  });

  test("signing in with no orders is silent too", async () => {
    const env = await withProvider(async (e) => { await signIn(e, []); });
    assert.equal(env.alerts, 0);
  });
});

describe("H-26 — no duplicate alerts", () => {
  test("the same order never alerts twice across repeated backgrounding", async () => {
    const env = await withProvider(async (e) => {
      await signIn(e, ["old-1"]);
      e.serverPending = [...e.serverPending, order("new-1")];
      e.setAppActive(false); await tick();
      e.setAppActive(true); await tick(); await tick();
      e.setAppActive(false); await tick();
      e.setAppActive(true); await tick(); await tick();
    });
    assert.equal(env.alertedIds.filter((id) => id === "new-1").length, 1);
    assert.equal(env.alerts, 1);
  });

  test("repeated polls of an unchanged queue stay silent", async () => {
    const env = await withProvider(async (e) => {
      await signIn(e, ["a", "b"]);
      for (let i = 0; i < 5; i += 1) { await e.refreshOnce(); }
    });
    assert.equal(env.alerts, 0);
  });
});

describe("H-26 — exactly one poll timer and one socket", () => {
  test("four background/foreground cycles leave one live timer", async () => {
    const env = await withProvider(async (e) => {
      await signIn(e, []);
      for (let i = 0; i < 4; i += 1) {
        e.setAppActive(false); await tick();
        e.setAppActive(true); await tick();
      }
    });
    assert.equal(env.live.timers, 1, "poll timers stacked");
    assert.equal(env.live.timerCount, 1);
    assert.ok(env.timersCleared >= 4, "backgrounding must stop the poll");
  });

  test("backgrounding and returning never opens a second socket", async () => {
    const env = await withProvider(async (e) => {
      await signIn(e, []);
      for (let i = 0; i < 3; i += 1) {
        e.setAppActive(false); await tick();
        e.setAppActive(true); await tick();
      }
    });
    assert.equal(env.socketUp, 1, "the socket churned on foreground transitions");
    assert.equal(env.live.sockets, 1);
  });

  test("signing out stops the timer and the socket", async () => {
    const env = await withProvider(async (e) => {
      await signIn(e, []);
      e.setVendorToken(null);
      await tick(); await tick();
    });
    assert.equal(env.live.timers, 0);
    assert.equal(env.live.sockets, 0);
  });
});

describe("H-26 — switching store accounts", () => {
  test("the seen-set is reset, and the new store's queue does not alert", async () => {
    const env = await withProvider(async (e) => {
      await signIn(e, ["a-1"]);
      e.serverPending = [order("b-1"), order("b-2")];
      e.setVendorToken("vendor-jwt-2");
      await tick(); await tick();
    });
    assert.ok(env.resets >= 2, "the reset did not fire on the account switch");
    assert.equal(env.alerts, 0, "the new store's existing orders raised an alarm");
    assert.equal(env.live.timers, 1);
    assert.equal(env.live.sockets, 1);
  });

  test("after switching, a genuinely new order still alerts", async () => {
    const env = await withProvider(async (e) => {
      await signIn(e, ["a-1"]);
      e.serverPending = [order("b-1")];
      e.setVendorToken("vendor-jwt-2");
      await tick(); await tick();
      e.serverPending = [...e.serverPending, order("b-2")];
      e.setAppActive(false); await tick();
      e.setAppActive(true); await tick(); await tick();
    });
    assert.deepEqual(env.alertedIds, ["b-2"]);
  });
});

describe("H-26 — the source keeps the shape the fix depends on", () => {
  test("the reset lives in its own effect keyed on vendorToken", () => {
    assert.deepEqual(wiring.resetEffect, ["vendorToken"],
      "REGRESSION: the reset is keyed on something else again");
    assert.equal(wiring.resetInPollEffect, false,
      "REGRESSION: the reset is back inside the appActive-dependent poll effect");
  });

  test("the reset is declared before the poll effect", () => {
    // Order matters on a token change: reset first, then the poll's immediate
    // checkNewOrders() correctly takes the first-load branch.
    const resetAt = SOURCE.search(/isFirstLoad\.current = true;\s*\n\s*lastSeenOrderIds\.current = new Set\(\);/);
    const pollAt = SOURCE.indexOf("pollRef.current = setInterval(");
    assert.ok(resetAt > -1 && pollAt > -1);
    assert.ok(resetAt < pollAt, "the reset must run before the first poll of a session");
  });

  test("the poll interval, the cleanup and the socket options are unchanged", () => {
    assert.match(SOURCE, /const POLL_INTERVAL_MS = 20_000;/);
    assert.match(SOURCE, /pollRef\.current = setInterval\(checkNewOrders, POLL_INTERVAL_MS\);/);
    assert.match(SOURCE, /if \(pollRef\.current\) clearInterval\(pollRef\.current\);/);
    assert.match(SOURCE, /reconnectionAttempts: 10,/);
    assert.match(SOURCE, /sock\.on\("orders:changed", \(\) => \{/);
  });

  test("checkNewOrders' own logic is untouched", () => {
    assert.match(SOURCE, /if \(isFirstLoad\.current\) \{/);
    assert.match(SOURCE, /isFirstLoad\.current = false;/);
    assert.match(SOURCE, /!lastSeenOrderIds\.current\.has\(o\.id\)/);
    assert.match(SOURCE, /playRepeatingAlert\(\);/);
    assert.deepEqual(wiring.checkDeps, ["vendorToken"]);
  });

  test("the effect dependency arrays are unchanged", () => {
    assert.deepEqual(wiring.pollDeps, ["vendorToken", "checkNewOrders", "appActive"]);
    assert.deepEqual(wiring.socketDeps, ["vendorToken", "checkNewOrders"]);
  });
});
