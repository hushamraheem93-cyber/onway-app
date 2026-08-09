/**
 * Order polling start-up race tests (audit finding H-25).
 *
 * OrderProvider gated its 10-second fallback poll on `isInitializedRef.current` — a
 * ref. Mutating a ref does not schedule a render, and a ref cannot appear in a
 * dependency array, so nothing re-ran the effect when the flag flipped.
 *
 * Two AsyncStorage reads race at start-up: OrderContext's own stored-status load, and
 * AuthContext's auth blob, which publishes the phone number. When the phone won, the
 * polling effect ran once with the flag still false and was never re-run: no interval
 * for the entire session. Sockets still delivered updates, and OrdersScreen still did
 * its one-shot fetch on mount, so the tab was not empty — but the fallback that exists
 * precisely for dropped sockets was silently absent, which on a weak connection is the
 * difference between seeing an order update and not seeing one.
 *
 * Measured on the pre-fix source with the runtime below: 0 intervals, 0 fetches.
 *
 * The fix keeps the ref for checkForStatusChanges (it is read inside an async callback,
 * where a ref is the right tool and keeping it out of the deps keeps refreshOrders'
 * identity stable) and adds a state flag that the polling effect depends on. Replacing
 * the ref outright also works but churns refreshOrders' identity, which re-runs the
 * socket effect and costs an extra disconnect/reconnect at every boot — measured, and
 * pinned below.
 *
 * Run:  node --test tests/unit/order-polling-race.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, "../../", p), "utf8");
const SRC = read("client/context/OrderContext.tsx");
const ORDERS_SCREEN = read("client/screens/OrdersScreen.tsx");

function code(src) {
  return src
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*"));
    })
    .join("\n");
}
const C = code(SRC);

/** The polling effect, read out of the source. */
const POLL = (() => {
  const at = SRC.indexOf("if (phoneNumber &&");
  assert.ok(at > -1, "the polling effect is gone");
  return SRC.slice(SRC.lastIndexOf("useEffect(", at), SRC.indexOf("]);", at) + 3);
})();

const wiring = {
  guardKind: /isInitializedRef\.current/.test(POLL) ? "ref" : "state",
  deps: (POLL.match(/\}, \[([^\]]*)\]\);\s*$/) ?? [, ""])[1]
    .split(",").map((s) => s.trim()).filter(Boolean),
  interval: Number((POLL.match(/setInterval\(refreshOrders, (\d+)\)/) ?? [, 0])[1]),
};
const checkGuardKind = /if \(!isInitializedRef\.current\) return;/.test(SRC) ? "ref" : "state";
const initSetsState = /setIsInitialized\(true\)/.test(SRC);

// ── a minimal React hooks runtime with the one rule that matters ─────────────
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
          schedule();                       // state change → re-render
        }];
      },
      useRef(initial) {
        const i = cursor++;
        if (!(i in hooks)) hooks[i] = { current: initial };
        return hooks[i];                     // ref mutation → nothing
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

/** The provider, wired from the source's own guard kind and dependency array. */
function makeProvider(env, override = {}) {
  const w = { ...wiring, checkGuardKind, initSetsState, ...override };
  return function OrderProviderModel(R) {
    const [phoneNumber, setPhoneNumber] = R.useState(null);
    const [customerToken, setCustomerToken] = R.useState(null);
    const [appActive, setAppActive] = R.useState(true);
    Object.assign(env, { setPhoneNumber, setCustomerToken, setAppActive });

    const isInitializedRef = R.useRef(false);
    const [isInitialized, setIsInitialized] = R.useState(false);
    env.finishInit = () => {
      isInitializedRef.current = true;
      if (w.initSetsState) setIsInitialized(true);
    };

    const saveStatuses = R.useCallback(() => {}, []);
    const checkForStatusChanges = R.useCallback(() => {
      const ready = w.checkGuardKind === "ref" ? isInitializedRef.current : isInitialized;
      if (!ready) { env.suppressed += 1; return; }
      env.checked += 1;
    }, w.checkGuardKind === "ref" ? [saveStatuses] : [saveStatuses, isInitialized]);

    const refreshOrders = R.useCallback(() => { env.fetches += 1; checkForStatusChanges(); },
      [phoneNumber, customerToken, checkForStatusChanges]);
    env.refreshOrders = refreshOrders;

    R.useEffect(() => {
      if (!phoneNumber) return;
      env.socketUp += 1;
      return () => { env.socketDown += 1; };
    }, [phoneNumber, refreshOrders]);

    const guard = w.guardKind === "ref" ? isInitializedRef.current : isInitialized;
    const depValues = w.deps.map((d) =>
      d === "phoneNumber" ? phoneNumber : d === "appActive" ? appActive
        : d === "refreshOrders" ? refreshOrders : d === "isInitialized" ? isInitialized : undefined);
    R.useEffect(() => {
      if (phoneNumber && guard && appActive) {
        refreshOrders();
        const id = setInterval(refreshOrders, w.interval);
        env.timers.add(id);
        env.started += 1;
        return () => { clearInterval(id); env.timers.delete(id); env.cleared += 1; };
      }
    }, depValues);
  };
}

const newEnv = () => ({ fetches: 0, started: 0, cleared: 0, socketUp: 0, socketDown: 0,
  checked: 0, suppressed: 0, timers: new Set() });
const liveTimers = (e) => e.started - e.cleared;
const tick = () => new Promise((r) => setTimeout(r, 0));
/** Runs a scenario and ALWAYS tears the runtime down, even if an assertion throws —
 *  a leaked interval would hang the test runner instead of failing it. */
async function withProvider(fn, override) {
  const env = newEnv();
  const rt = createRuntime(makeProvider(env, override));
  try {
    rt.mount();
    await fn(env, rt);
  } finally {
    rt.unmount();
    for (const id of env.timers) clearInterval(id);
    env.timers.clear();
  }
  return env;
}

/** Drives the race order — phone first, stored statuses second — on a mounted env. */
async function bootInto(env) {
  env.setPhoneNumber("07700000001");
  await tick();
  env.finishInit();
  await tick(); await tick();
}

describe("H-25 — polling starts whichever way the start-up race falls", () => {
  test("phone number first, stored statuses second", async () => {
    await withProvider(async (env) => {
      env.setPhoneNumber("07700000001");
      await tick();
      env.finishInit();
      await tick(); await tick();
      assert.equal(env.started, 1, "the 10-second fallback poll never started");
      assert.ok(env.fetches >= 1, "no initial fetch");
    });
  });

  test("stored statuses first, phone number second", async () => {
    await withProvider(async (env) => {
      env.finishInit();
      await tick();
      env.setPhoneNumber("07700000001");
      await tick(); await tick();
      assert.equal(env.started, 1);
      assert.equal(liveTimers(env), 1);
    });
  });

  test("the pre-fix wiring provably fails the same scenario", async () => {
    // Guards the guard: if this ever passes, the model no longer reproduces the defect
    // and the test above proves nothing.
    await withProvider(async (env) => {
      env.setPhoneNumber("07700000001");
      await tick();
      env.finishInit();
      await tick(); await tick();
      assert.equal(env.started, 0, "the ref-guarded wiring should never start polling here");
    }, { guardKind: "ref", initSetsState: false, deps: ["phoneNumber", "refreshOrders", "appActive"] });
  });
});

describe("H-25 — exactly one timer, always cleaned up", () => {
  test("repeated re-renders never stack timers", async () => {
    await withProvider(async (env) => {
      await bootInto(env);
      for (let i = 0; i < 6; i += 1) { env.setCustomerToken(`t-${i}`); await tick(); }
      assert.equal(liveTimers(env), 1, "two intervals were live at once");
      assert.equal(env.timers.size, 1);
      assert.equal(env.cleared, env.started - 1, "an old interval was not cleared");
    });
  });

  test("unmount clears the interval and the socket", async () => {
    const env = await withProvider(async (e) => { await bootInto(e); });
    assert.equal(env.cleared, env.started, "the interval survived unmount");
    assert.equal(env.timers.size, 0);
    assert.equal(env.socketUp, env.socketDown, "the socket was left connected");
  });

  test("backgrounding stops polling, returning restarts it", async () => {
    await withProvider(async (env) => {
      await bootInto(env);
      assert.equal(liveTimers(env), 1);

    env.setAppActive(false);
    await tick();
    assert.equal(liveTimers(env), 0, "polling continued in the background");
    assert.equal(env.timers.size, 0);

    const before = env.fetches;
    env.setAppActive(true);
    await tick();
    assert.equal(liveTimers(env), 1);
    assert.ok(env.fetches > before, "no immediate refresh on return to foreground");
    });
  });

  test("logging out stops polling", async () => {
    await withProvider(async (env) => {
      await bootInto(env);
      env.setPhoneNumber(null);
      await tick();
      assert.equal(liveTimers(env), 0);
      assert.equal(env.timers.size, 0);
      assert.equal(env.socketUp, env.socketDown);
    });
  });
});

describe("H-25 — the socket and the notification flood are unaffected", () => {
  test("boot opens exactly one socket connection", async () => {
    await withProvider(async (env) => {
      await bootInto(env);
      assert.equal(env.socketUp - env.socketDown, 1);
      assert.equal(env.socketUp, 1, "refreshOrders' identity changed and churned the socket");
    });
  });

  test("the chosen fix costs no extra reconnect; replacing the ref outright does", async () => {
    // The measurement behind the design choice, kept so the trade-off is not re-litigated
    // from memory.
    const chosen = await withProvider(async (e) => { await bootInto(e); }, { checkGuardKind: "ref" });
    const replaced = await withProvider(async (e) => { await bootInto(e); }, { checkGuardKind: "state" });

    assert.equal(chosen.socketUp, 1, "the chosen wiring should open one socket");
    assert.equal(replaced.socketUp, 2, "replacing the ref should cost a reconnect");
    assert.ok(chosen.socketUp < replaced.socketUp);
  });

  test("background/foreground does not open a new socket", async () => {
    await withProvider(async (env) => {
      await bootInto(env);
      const before = env.socketUp;
      env.setAppActive(false); await tick();
      env.setAppActive(true); await tick();
      assert.equal(env.socketUp, before);
    });
  });

  test("no status check runs before the stored statuses load", async () => {
    await withProvider(async (env) => {
      env.setPhoneNumber("07700000001");
      await tick();
      env.refreshOrders();
      assert.equal(env.checked, 0, "a boot refresh would notify for every stored order");
      assert.ok(env.suppressed >= 1);

      env.finishInit();
      await tick();
      const before = env.checked;
      env.refreshOrders();
      assert.ok(env.checked > before, "status checks never resumed");
    });
  });
});

describe("H-25 — the source keeps the shape the fix depends on", () => {
  test("the polling guard is a state value, not a ref", () => {
    assert.match(C, /if \(phoneNumber && isInitialized && appActive\) \{/);
    assert.doesNotMatch(
      POLL,
      /isInitializedRef\.current/,
      "REGRESSION: a ref guards the effect again — nothing will re-run it",
    );
  });

  test("that state is in the dependency array", () => {
    assert.deepEqual(wiring.deps, ["phoneNumber", "refreshOrders", "appActive", "isInitialized"]);
  });

  test("the load effect sets the state in both the success and the failure branch", () => {
    const at = SRC.indexOf("const loadStoredStatuses = async () => {");
    const body = SRC.slice(at, SRC.indexOf("loadStoredStatuses();", at));
    assert.equal([...body.matchAll(/setIsInitialized\(true\);/g)].length, 2,
      "a failed read must not leave polling switched off forever");
    assert.equal([...body.matchAll(/isInitializedRef\.current = true;/g)].length, 2);
  });

  test("checkForStatusChanges still reads the ref, keeping refreshOrders stable", () => {
    assert.match(C, /if \(!isInitializedRef\.current\) return;/);
    assert.match(C, /\[addNotification, saveStatuses\],/,
      "adding isInitialized here churns refreshOrders and reconnects the socket");
  });

  test("the interval, the cleanup and the socket effect are unchanged", () => {
    assert.match(C, /const interval = setInterval\(refreshOrders, 10000\);/);
    assert.match(C, /return \(\) => clearInterval\(interval\);/);
    assert.match(C, /sock\.on\("orders:changed", \(\) => \{\s*refreshOrders\(\);\s*\}\);/);
    assert.match(C, /\}, \[phoneNumber, refreshOrders\]\);/);
    assert.match(C, /reconnectionAttempts: 10,/);
  });

  test("refreshOrders' own dependencies are unchanged", () => {
    assert.match(C, /\}, \[phoneNumber, customerToken, checkForStatusChanges\]\);/);
  });

  test("OrdersScreen still fetches on mount — untouched", () => {
    assert.match(code(ORDERS_SCREEN), /useEffect\(\(\) => \{\s*refreshOrders\(\);\s*\}, \[\]\);/);
  });
});
