/**
 * AuthContext memoization tests (audit finding H-40).
 *
 * The finding says the AuthContext value is "not memoized — a new object with 16
 * functions on every render, and the provider sits above every provider and the
 * router, so any profile update re-renders the whole tree, cascading ~10 times a
 * second during login on a weak device."
 *
 * The unmemoized value is real: client/context/AuthContext.tsx returns an inline
 * object literal, carrying a comment that says the omission is deliberate. Two of
 * the surrounding claims are not:
 *
 *   1. "re-renders the whole tree" — it does not. `children` arrives as a prop, so
 *      its element identity is unchanged when the provider re-renders and React
 *      bails out of that subtree. What re-renders is every useAuth() CONSUMER.
 *
 *   2. "memoize the value" would fix it — it would not. AuthProvider sits under
 *      ThemeProvider and QueryClientProvider, both of which pass `children`
 *      straight through, so the provider re-renders only when its OWN state
 *      changes. A useMemo keyed on that state therefore recomputes on every single
 *      render it would be asked to skip. It is a no-op, exactly as the in-code
 *      comment claims.
 *
 * These tests run a small React model — useState with Object.is bail-out, batching
 * per tick, useMemo, and context-identity-driven consumer re-renders — over the
 * real login sequence traced from AuthContext.tsx, and compare the shipped shape
 * against the two remedies. The point is to measure the remedy before adopting it.
 *
 * Run:  node --test tests/unit/auth-context-memoization.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments } from "./_source.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const AUTH = readFileSync(join(root, "client/context/AuthContext.tsx"), "utf8");
const CLEAN = stripComments(AUTH);
const APP = stripComments(readFileSync(join(root, "client/App.tsx"), "utf8"));

/** Every client source file, so the consumer sweep cannot silently miss one. */
const CONSUMER_FILES = (function walk(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.tsx?$/.test(e.name)) acc.push(relative(root, p));
  }
  return acc;
})(join(root, "client"));

// ─── a small React model ──────────────────────────────────────────────────────
// Models only what this question turns on: state identity, batching, memo deps,
// and the rule that a context consumer re-renders when the value's identity
// changes. It is not a React implementation and does not pretend to be one.
function createRuntime() {
  const stats = { providerRenders: 0, valueIdentities: 0, consumerRenders: 0 };
  let hooks = [];
  let cursor = 0;
  let dirty = false;
  let lastValue = Symbol("none");

  const useState = (initial) => {
    const i = cursor++;
    if (hooks.length <= i) hooks[i] = { value: initial };
    const slot = hooks[i];
    const set = (next) => {
      // React bails out when the new state is Object.is-equal to the old.
      if (Object.is(slot.value, next)) return;
      slot.value = next;
      dirty = true;
    };
    return [slot.value, set];
  };

  const useMemo = (factory, deps) => {
    const i = cursor++;
    const slot = (hooks[i] ??= {});
    const same =
      slot.deps && slot.deps.length === deps.length &&
      slot.deps.every((d, k) => Object.is(d, deps[k]));
    if (!same) { slot.value = factory(); slot.deps = deps; }
    return slot.value;
  };

  /** One render pass of the provider. `build` returns the context value. */
  const render = (build) => {
    cursor = 0;
    stats.providerRenders += 1;
    const value = build({ useState, useMemo });
    if (!Object.is(value, lastValue)) {
      stats.valueIdentities += 1;
      // Every mounted useAuth() consumer re-renders on a new value identity.
      stats.consumerRenders += MOUNTED_CONSUMERS;
      lastValue = value;
    }
    return value;
  };

  /** Run `fn` (a batch of setState calls), then re-render once if anything changed. */
  const tick = (build, fn) => { dirty = false; fn(); if (dirty) render(build); };

  return { render, tick, stats, isDirty: () => dirty };
}

/** Consumers mounted during the login burst — the login screen and app shell. */
const MOUNTED_CONSUMERS = 4;

/**
 * The customer login sequence, traced from AuthContext.tsx.
 * Each entry is one await-separated batch, so each is one render opportunity.
 *   verifyOtp:479 → setCustomerToken, then await setToken
 *   verifyOtp:508 → setPhoneNumber + setPendingPhone + setIsOtpVerified
 *   selectRoleForPhone:538 → setSelectedUserType, then await AsyncStorage
 *   selectRoleForPhone:549 → setIsProfileLoading(true) + setIsLoggedIn(true)
 *   selectRoleForPhone:562 → setUserProfile + setIsProfileComplete
 *   selectRoleForPhone:574 → setIsProfileLoading(false)
 */
const LOGIN_BATCHES = [
  (s) => { s.setCustomerToken("tok"); },
  (s) => { s.setPhoneNumber("07700000001"); s.setPendingPhone("07700000001"); s.setIsOtpVerified(true); },
  (s) => { s.setSelectedUserType("customer"); },
  (s) => { s.setIsProfileLoading(true); s.setIsLoggedIn(true); },
  (s) => { s.setUserProfile({ name: "زبون" }); s.setIsProfileComplete(true); },
  (s) => { s.setIsProfileLoading(false); },
];

/**
 * Drive the login sequence through a provider built in one of three shapes.
 *   "inline"   — the shipped shape: a fresh object literal every render
 *   "memo"     — the remedy the audit proposes: useMemo over the state
 *   "memo+cb"  — useMemo plus stabilised function identities
 */
function runLogin(shape) {
  const rt = createRuntime();
  const setters = {};

  const build = ({ useState, useMemo }) => {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [phoneNumber, setPhoneNumber] = useState(null);
    const [pendingPhone, setPendingPhone] = useState(null);
    const [userProfile, setUserProfile] = useState(null);
    const [isProfileComplete, setIsProfileComplete] = useState(false);
    const [isOtpVerified, setIsOtpVerified] = useState(false);
    const [selectedUserType, setSelectedUserType] = useState(null);
    const [isProfileLoading, setIsProfileLoading] = useState(false);
    const [customerToken, setCustomerToken] = useState(null);

    Object.assign(setters, {
      setIsLoggedIn, setPhoneNumber, setPendingPhone, setUserProfile,
      setIsProfileComplete, setIsOtpVerified, setSelectedUserType,
      setIsProfileLoading, setCustomerToken,
    });

    const state = {
      isLoggedIn, phoneNumber, pendingPhone, userProfile, isProfileComplete,
      isOtpVerified, selectedUserType, isProfileLoading, customerToken,
    };
    const deps = Object.values(state);

    if (shape === "inline") {
      // A fresh literal, and fresh closures, on every render.
      return { ...state, login: async () => {}, logout: async () => {} };
    }
    if (shape === "memo") {
      const fns = { login: async () => {}, logout: async () => {} };
      return useMemo(() => ({ ...state, ...fns }), deps);
    }
    const fns = useMemo(() => ({ login: async () => {}, logout: async () => {} }), []);
    return useMemo(() => ({ ...state, ...fns }), [...deps, fns]);
  };

  rt.render(build); // mount
  for (const batch of LOGIN_BATCHES) rt.tick(build, () => batch(setters));
  return rt.stats;
}

// ─────────────────────────────────────────────────────────────────────────────
describe("H-40 · the model reproduces the React rules this turns on", () => {
  test("a setState with an unchanged value does not re-render", () => {
    const rt = createRuntime();
    const setters = {};
    const build = ({ useState }) => {
      const [n, setN] = useState(1);
      setters.setN = setN;
      return { n };
    };
    rt.render(build);
    rt.tick(build, () => setters.setN(1)); // same value
    assert.equal(rt.stats.providerRenders, 1, "React bails out on Object.is-equal state");
    rt.tick(build, () => setters.setN(2));
    assert.equal(rt.stats.providerRenders, 2);
  });

  test("several setState calls in one batch produce one render", () => {
    const rt = createRuntime();
    const setters = {};
    const build = ({ useState }) => {
      const [a, setA] = useState(0);
      const [b, setB] = useState(0);
      Object.assign(setters, { setA, setB });
      return { a, b };
    };
    rt.render(build);
    rt.tick(build, () => { setters.setA(1); setters.setB(1); });
    assert.equal(rt.stats.providerRenders, 2, "the batch was not coalesced");
  });

  test("useMemo keeps identity while its deps are unchanged", () => {
    const rt = createRuntime();
    const setters = {};
    const build = ({ useState, useMemo }) => {
      const [a, setA] = useState(0);
      const [b, setB] = useState(0);
      Object.assign(setters, { setA, setB });
      return useMemo(() => ({ a }), [a]); // deliberately ignores b
    };
    rt.render(build);
    rt.tick(build, () => setters.setB(1)); // renders, but the memo dep is unchanged
    assert.equal(rt.stats.providerRenders, 2);
    assert.equal(rt.stats.valueIdentities, 1, "the memo produced a new identity anyway");
  });
});

describe("H-40 · the unmemoized value is real", () => {
  test("the provider value is an inline object literal", () => {
    const at = CLEAN.indexOf("<AuthContext.Provider");
    assert.ok(at > 0, "the provider disappeared");
    const head = CLEAN.slice(at, at + 200);
    assert.match(head, /value=\{\{/,
      "the value is no longer an inline literal — this test needs rewriting");
  });

  test("no useMemo wraps it", () => {
    assert.doesNotMatch(CLEAN, /useMemo\([\s\S]{0,80}isLoggedIn/,
      "the value is memoized now — re-measure the finding");
  });

  test("the omission is documented rather than accidental", () => {
    // Checked on the RAW source: this is a comment, which CLEAN has stripped.
    assert.match(AUTH, /deliberately NOT memoized/,
      "the rationale comment was removed; a future reader would read this as an oversight");
  });
});

describe("H-40 · the one stabilisation that IS load-bearing stays", () => {
  // refreshVendorProfile is the single auth function whose identity anything
  // depends on. Leaving it unstable is not a theoretical cost: it previously made
  // VendorHomeScreen's useFocusEffect clear and restart its poll interval on every
  // render, so the vendor's approval status stopped updating reliably. That is why
  // it — and only it — carries a useCallback.
  test("refreshVendorProfile is useCallback-wrapped", () => {
    assert.match(CLEAN, /const refreshVendorProfile = useCallback\(async \(\) => \{/,
      "refreshVendorProfile lost its stable identity — the vendor approval poll " +
      "will restart on every render again");
  });

  test("it is keyed on vendorToken, not on nothing and not on everything", () => {
    const at = CLEAN.indexOf("const refreshVendorProfile = useCallback");
    const body = CLEAN.slice(at, at + 900);
    const deps = body.match(/\}, \[([^\]]*)\]\);/)?.[1];
    assert.equal(deps?.trim(), "vendorToken",
      `dependencies changed to [${deps}] — an empty array would read a stale token, ` +
      "a wider one would defeat the stabilisation");
  });

  test("the consumer that needs it still depends on it", () => {
    // If VendorHomeScreen stops holding it in a dependency array, the useCallback
    // above is no longer load-bearing and this whole guard can be reconsidered.
    const vendorHome = stripComments(
      readFileSync(join(root, "client/screens/VendorHomeScreen.tsx"), "utf8"),
    );
    const deps = [...vendorHome.matchAll(/\}, \[([^\]]*)\]\)/g)]
      .filter((m) => /\brefreshVendorProfile\b/.test(m[1]));
    assert.ok(deps.length > 0,
      "no VendorHomeScreen dependency array holds refreshVendorProfile any more");
  });

  test("no OTHER auth function has quietly grown a dependent", () => {
    // The finding's remedy would be worth revisiting the moment this changes: an
    // auth function in a consumer's dependency array is the one case where an
    // unstable identity has a real, observable cost.
    const FNS = ["sendOtp", "verifyOtp", "setUserType", "login", "logout",
      "deleteAccount", "saveProfile", "refreshProfile", "completeDriverRegistration",
      "completeVendorRegistration", "goBackToUserType", "goBackToPhoneLogin",
      "goBackToOtp", "markSplashSeen", "loginAsGuest", "exitGuestMode"];
    const offenders = [];
    for (const file of CONSUMER_FILES) {
      const src = stripComments(readFileSync(join(root, file), "utf8"));
      if (!src.includes("useAuth()")) continue;
      for (const m of src.matchAll(/\}, \[([^\]]*)\]\)/g)) {
        const deps = m[1].split(",").map((d) => d.trim());
        for (const fn of FNS) {
          if (deps.includes(fn)) offenders.push(`${file}: [${m[1].trim()}]`);
        }
      }
    }
    assert.deepEqual(offenders, [],
      "an auth function is now a dependency — it needs the refreshVendorProfile " +
      `treatment, or the context needs splitting:\n${offenders.join("\n")}`);
  });
});

describe("H-40 · but the proposed remedy is a no-op — measured", () => {
  const inline = runLogin("inline");
  const memo = runLogin("memo");
  const memoCb = runLogin("memo+cb");

  test("one customer login drives six provider renders", () => {
    assert.equal(inline.providerRenders, 7, "mount plus one render per await-separated batch");
  });

  test("memoizing the value changes NOTHING", () => {
    assert.equal(memo.providerRenders, inline.providerRenders);
    assert.equal(memo.valueIdentities, inline.valueIdentities,
      "the memo skipped a render — then the finding's remedy would be worth adopting");
    assert.equal(memo.consumerRenders, inline.consumerRenders,
      "consumers re-rendered a different number of times under the remedy");
  });

  test("adding useCallback on top changes nothing either", () => {
    assert.equal(memoCb.valueIdentities, inline.valueIdentities,
      "stabilising the functions changed the value's identity count");
    assert.equal(memoCb.consumerRenders, inline.consumerRenders);
  });

  test("the reason: every render already carries a state change", () => {
    // A memo can only skip when its deps are unchanged. Here the provider re-renders
    // ONLY because its own state changed, so the deps have always changed.
    assert.equal(inline.valueIdentities, inline.providerRenders,
      "some render did not change the value — a memo would have had something to skip");
  });
});

describe("H-40 · why the provider re-renders only on its own state", () => {
  test("AuthProvider's parents pass children straight through", () => {
    const at = APP.indexOf("<AuthProvider>");
    assert.ok(at > 0, "AuthProvider moved");
    const above = APP.slice(Math.max(0, at - 400), at);
    assert.match(above, /<ThemeProvider>/,
      "the parent chain changed — re-measure whether the provider re-renders for other reasons");
  });

  test("the tree really is mounted above the router", () => {
    const authAt = APP.indexOf("<AuthProvider>");
    const navAt = APP.search(/<NavigationContainer|<RootNavigator|<AppNavigator/);
    assert.ok(navAt === -1 || authAt < navAt,
      "the finding's premise about provider placement no longer holds");
  });
});

describe("H-40 · the control: the model DOES credit memoization when it earns it", () => {
  // If the measurement above could never show a win, it would prove nothing. This
  // drives the same provider with renders that carry NO state change — what a
  // parent re-render would cause — and there the memo is worth exactly what the
  // finding expects. The login sequence simply never produces such a render.
  function runParentRerenders(shape, times) {
    const rt = createRuntime();
    const setters = {};
    const build = ({ useState, useMemo }) => {
      const [n, setN] = useState(0);
      setters.setN = setN;
      const state = { n };
      if (shape === "inline") return { ...state, login: async () => {} };
      return useMemo(() => ({ ...state, login: async () => {} }), [n]);
    };
    rt.render(build);
    for (let i = 0; i < times; i += 1) rt.render(build); // re-render, no state change
    return rt.stats;
  }

  test("with parent-driven renders, memoizing prevents consumer re-renders", () => {
    const inlineRuns = runParentRerenders("inline", 5);
    const memoRuns = runParentRerenders("memo", 5);
    assert.equal(inlineRuns.valueIdentities, 6, "each render made a new literal");
    assert.equal(memoRuns.valueIdentities, 1, "the memo held identity across renders");
    assert.ok(memoRuns.consumerRenders < inlineRuns.consumerRenders,
      "the model cannot detect a memoization win — the measurement above is worthless");
  });

  test("AuthProvider gets no such renders, which is why the win is zero", () => {
    const s = runLogin("inline");
    assert.equal(s.valueIdentities, s.providerRenders,
      "a state-free render appeared — memoization would now buy something");
  });
});

describe("H-40 · the cost the finding is really pointing at", () => {
  test("every consumer re-renders on each auth state change", () => {
    const s = runLogin("inline");
    assert.equal(s.consumerRenders / s.valueIdentities, MOUNTED_CONSUMERS,
      "each value identity re-renders every mounted consumer");
    // This is inherent to ONE fat context, and is not what memoization addresses.
    // Splitting state from actions would address it — at the cost of touching all
    // 39 consumers, which is an API change and outside this finding's scope.
  });
});
