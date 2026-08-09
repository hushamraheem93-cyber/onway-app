/**
 * Vendor settings / availability silent-failure tests (audit finding H-30).
 *
 * VendorHomeScreen fired the PATCH and then ran the success path unconditionally:
 * refresh the profile, close the modal, buzz "success". Neither `saveStoreSettings`
 * nor `toggleAvailability` looked at `res.ok`, and both catch blocks were empty.
 *
 * Every failure the server can actually return was therefore reported to the store
 * owner as a success:
 *   • 401 — the vendor JWT lives 7 days, so expiry is routine, not exotic.
 *   • 403 — a suspended/pending store: PATCH is NOT a pre-approval route
 *           (isPreApprovalVendorRoute requires GET), so writes are refused.
 *   • 500 — Firestore unavailable.
 * A dropped connection was worse still: the empty catch said nothing at all.
 *
 * The consequence is not cosmetic. POST /api/orders reads the store's `isVacation`
 * flag and refuses new orders when it is set. A vacation toggle that silently fails
 * leaves the store listed as open and taking cash-on-delivery orders it will not
 * fulfil — and `refreshVendorProfile` swallows its own 401, so the cached profile
 * keeps showing the stale value and nothing on screen contradicts the success buzz.
 *
 * Measured on the pre-fix source: 401, 403 and 500 each produced a success haptic,
 * a closed settings modal, and zero messages.
 *
 * The fix checks `res.ok`, shows the server's own Arabic reason, and leaves the modal
 * open so typed values are not lost. No automatic retry is added. The request bodies,
 * routes, headers and the whole success path are asserted unchanged.
 *
 * Both handler bodies are lifted straight out of the shipped .tsx by brace matching,
 * transpiled with the project's own TypeScript, and executed with injected
 * dependencies — so what runs here is the real code path, not a paraphrase of it.
 *
 * Run:  node --test tests/unit/vendor-settings-save-failure.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const ts = require("typescript");
const SRC = readFileSync(join(here, "../../client/screens/VendorHomeScreen.tsx"), "utf8");

/** Lift a function body out by brace matching. */
function body(src, declaration) {
  const at = src.indexOf(declaration);
  if (at < 0) throw new Error(`not found: ${declaration}`);
  const open = src.indexOf("{", at + declaration.length - 1);
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") { depth -= 1; if (depth === 0) return src.slice(open + 1, i); }
  }
  throw new Error(`unbalanced: ${declaration}`);
}

/** Compile a lifted TypeScript body into a callable with its free identifiers injected. */
function compile(fnBody, params, deps) {
  const js = ts.transpileModule(
    `return async function lifted(${params.join(", ")}) {\n${fnBody}\n};`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } },
  ).outputText;
  // eslint-disable-next-line no-new-func
  return new Function(...deps, js);
}

const SAVE_BODY = body(SRC, "const saveStoreSettings = async () =>");
const TOGGLE_BODY = body(SRC, 'async (field: "isVacation" | "isBusy", value: boolean) =>');

/** Strip comments so assertions never match prose about the code. */
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const SAVE = stripComments(SAVE_BODY);
const TOGGLE = stripComments(TOGGLE_BODY);

/**
 * The two error helpers, lifted too, so the messages under test are the real ones.
 * The fallbacks exist so that removing a helper shows up as failing behaviour rather
 * than as a module that will not even load.
 */
const liftedServerError = (() => {
  try {
    return compile(
      body(SRC, "async function serverError(res: Response): Promise<string>"), ["res"], [],
    )();
  } catch {
    return async () => "(الدالة المساعدة مفقودة)";
  }
})();
const LIFTED_CONNECTION_ERROR =
  stripComments(SRC).match(/const CONNECTION_ERROR\s*=\s*\n?\s*"((?:[^"\\]|\\.)*)"/)?.[1] ?? null;

const DEPS = ["serverError", "CONNECTION_ERROR",
  "fetch", "URL", "getApiUrl", "vendorToken", "Haptics", "JSON", "Number", "String",
  "refreshVendorProfile", "setSettingsVisible", "setSavingSettings",
  "settDeliveryTime", "settDeliveryPrice", "settingsUseHours",
  "settOpenTime", "settCloseTime", "settOpenDays",
  "togglingAvailability", "setTogglingAvailability",
  "setOptimisticVacation", "setOptimisticBusy", "Alert", "console"];

const saveFactory = compile(SAVE_BODY, [], DEPS);
const toggleFactory = compile(TOGGLE_BODY, ["field", "value"], DEPS);

// ── harness ──────────────────────────────────────────────────────────────────
function makeCtx(fetchImpl, over = {}) {
  const ctx = {
    settingsVisible: true, savingSettings: false,
    optimisticVacation: null, optimisticBusy: null,
    toggling: false, haptics: [], alerts: [], refreshes: 0, requests: [], ...over,
  };
  ctx.deps = {
    serverError: liftedServerError,
    CONNECTION_ERROR: LIFTED_CONNECTION_ERROR,
    fetch: async (u, init) => {
      ctx.requests.push({ url: String(u), init });
      return fetchImpl(String(u), init);
    },
    URL,
    getApiUrl: () => "http://test.local",
    vendorToken: over.vendorToken === undefined ? "vt-1" : over.vendorToken,
    Haptics: {
      notificationAsync: (t) => { ctx.haptics.push(t); },
      impactAsync: () => {},
      NotificationFeedbackType: { Success: "success", Error: "error", Warning: "warning" },
      ImpactFeedbackStyle: { Light: "light", Medium: "medium" },
    },
    JSON, Number, String,
    refreshVendorProfile: async () => { ctx.refreshes += 1; },
    setSettingsVisible: (v) => { ctx.settingsVisible = v; },
    setSavingSettings: (v) => { ctx.savingSettings = v; },
    settDeliveryTime: "  30-45 دقيقة  ",
    settDeliveryPrice: "3000",
    settingsUseHours: true,
    settOpenTime: "09:00",
    settCloseTime: "23:00",
    settOpenDays: [0, 1, 2, 3, 4],
    togglingAvailability: ctx.toggling,
    setTogglingAvailability: (v) => { ctx.toggling = v; },
    setOptimisticVacation: (v) => { ctx.optimisticVacation = v; },
    setOptimisticBusy: (v) => { ctx.optimisticBusy = v; },
    Alert: { alert: (title, msg) => { ctx.alerts.push({ title, msg }); } },
    console,
  };
  return ctx;
}
const args = (ctx) => DEPS.map((n) => ctx.deps[n]);
const runSave = async (fetchImpl, over) => {
  const ctx = makeCtx(fetchImpl, over);
  await saveFactory(...args(ctx))();
  return ctx;
};
const runToggle = async (fetchImpl, field, value, over) => {
  const ctx = makeCtx(fetchImpl, over);
  await toggleFactory(...args(ctx))(field, value);
  return ctx;
};

const ok = (payload = {}) => async () => ({ ok: true, status: 200, json: async () => payload });
const httpFail = (s, err) => async () => ({
  ok: false, status: s, json: async () => (err ? { error: err } : {}),
});
const netFail = () => { throw new TypeError("Network request failed"); };

/** What the store owner actually perceives. */
const claimsSuccess = (ctx) => ctx.haptics.includes("success");

// ─────────────────────────────────────────────────────────────────────────────
describe("H-30 · saving store settings must not claim a success it did not get", () => {
  // The three the server really returns: expired session, suspended store, outage.
  for (const [status, reason] of [
    [401, "جلستك انتهت، الرجاء تسجيل الدخول مجدداً"],
    [403, "حسابك معلق. تواصل مع الإدارة."],
    [500, "حدث خطأ في الخادم"],
  ]) {
    test(`HTTP ${status}: no success haptic, modal stays open, owner is told`, async () => {
      const ctx = await runSave(httpFail(status, reason));
      assert.equal(claimsSuccess(ctx), false, "buzzed success on a rejected save");
      assert.equal(ctx.settingsVisible, true, "closed the modal and lost the typed values");
      assert.equal(ctx.alerts.length, 1, "said nothing about the failure");
      assert.equal(ctx.refreshes, 0, "refreshed the profile after a save that never landed");
    });
  }

  test("the server's own reason reaches the owner", async () => {
    const ctx = await runSave(httpFail(403, "حسابك معلق. تواصل مع الإدارة."));
    assert.equal(ctx.alerts[0].msg, "حسابك معلق. تواصل مع الإدارة.");
    assert.match(ctx.alerts[0].title, /\S/);
  });

  test("a response with no error field still produces a non-empty message", async () => {
    const ctx = await runSave(httpFail(500));
    assert.equal(ctx.alerts.length, 1);
    assert.match(ctx.alerts[0].msg, /\S/);
  });

  test("a non-JSON error body does not crash the handler", async () => {
    const ctx = await runSave(async () => ({
      ok: false, status: 502, json: async () => { throw new SyntaxError("<html>"); },
    }));
    assert.equal(ctx.alerts.length, 1);
    assert.equal(ctx.savingSettings, false);
    assert.equal(ctx.settingsVisible, true);
  });

  test("a dropped connection is reported, not swallowed", async () => {
    const ctx = await runSave(netFail);
    assert.equal(claimsSuccess(ctx), false);
    assert.equal(ctx.alerts.length, 1, "the empty catch said nothing at all");
    assert.equal(ctx.alerts[0].msg, LIFTED_CONNECTION_ERROR);
    assert.equal(ctx.settingsVisible, true);
    assert.equal(ctx.savingSettings, false);
  });
});

describe("H-30 · availability toggle must not claim a success it did not get", () => {
  for (const status of [401, 403, 500]) {
    test(`vacation, HTTP ${status}: no success haptic, owner is told, switch reverts`, async () => {
      const ctx = await runToggle(httpFail(status, "حدث خطأ في الخادم"), "isVacation", true);
      assert.equal(claimsSuccess(ctx), false, "buzzed success while the store stayed open");
      assert.equal(ctx.alerts.length, 1, "said nothing — the store believes it is on vacation");
      assert.equal(ctx.optimisticVacation, null, "left the optimistic switch stuck on");
      assert.equal(ctx.refreshes, 0);
    });
  }

  test("busy toggle behaves the same", async () => {
    const ctx = await runToggle(httpFail(500, "حدث خطأ في الخادم"), "isBusy", true);
    assert.equal(claimsSuccess(ctx), false);
    assert.equal(ctx.alerts.length, 1);
    assert.equal(ctx.optimisticBusy, null);
  });

  test("the two toggles get distinguishable messages", async () => {
    const vac = await runToggle(httpFail(500, "x"), "isVacation", true);
    const busy = await runToggle(httpFail(500, "x"), "isBusy", true);
    assert.notEqual(vac.alerts[0].title, busy.alerts[0].title);
  });

  test("a dropped connection is reported, not swallowed", async () => {
    const ctx = await runToggle(netFail, "isVacation", true);
    assert.equal(claimsSuccess(ctx), false);
    assert.equal(ctx.alerts.length, 1);
    assert.equal(ctx.alerts[0].msg, LIFTED_CONNECTION_ERROR);
    assert.equal(ctx.optimisticVacation, null);
    assert.equal(ctx.toggling, false);
  });
});

describe("H-30 · the success path is byte-for-byte what it was", () => {
  test("saving settings still refreshes, closes and buzzes", async () => {
    const ctx = await runSave(ok({ storeName: "x" }));
    assert.equal(ctx.refreshes, 1);
    assert.equal(ctx.settingsVisible, false);
    assert.equal(claimsSuccess(ctx), true);
    assert.deepEqual(ctx.alerts, []);
    assert.equal(ctx.savingSettings, false);
  });

  test("the settings request is unchanged: route, method, headers, body", async () => {
    const ctx = await runSave(ok());
    const { url, init } = ctx.requests[0];
    assert.equal(url, "http://test.local/api/vendor/profile");
    assert.equal(init.method, "PATCH");
    assert.equal(init.headers.Authorization, "Bearer vt-1");
    assert.equal(init.headers["Content-Type"], "application/json");
    const sent = JSON.parse(init.body);
    assert.deepEqual(Object.keys(sent).sort(), ["deliveryPrice", "deliveryTime", "workingHours"]);
    assert.equal(sent.deliveryTime, "30-45 دقيقة", "trimming changed");
    assert.equal(sent.deliveryPrice, 3000, "price coercion changed");
    assert.deepEqual(sent.workingHours, {
      openTime: "09:00", closeTime: "23:00", openDays: [0, 1, 2, 3, 4],
    });
  });

  test("working hours off still sends null", async () => {
    const ctx = makeCtx(ok());
    ctx.deps.settingsUseHours = false;
    await saveFactory(...args(ctx))();
    assert.equal(JSON.parse(ctx.requests[0].init.body).workingHours, null);
  });

  test("a successful toggle still refreshes, buzzes and sends one field", async () => {
    const ctx = await runToggle(ok({ isVacation: true }), "isVacation", true);
    assert.equal(ctx.refreshes, 1);
    assert.equal(claimsSuccess(ctx), true);
    assert.deepEqual(ctx.alerts, []);
    assert.equal(ctx.requests[0].url, "http://test.local/api/vendor/availability");
    assert.equal(ctx.requests[0].init.method, "PATCH");
    assert.equal(ctx.requests[0].init.body, JSON.stringify({ isVacation: true }));
    assert.equal(ctx.optimisticVacation, null);
    assert.equal(ctx.toggling, false);
  });
});

describe("H-30 · pre-existing guards and indicators are untouched", () => {
  test("no vendor token: neither handler fires a request", async () => {
    const s = await runSave(ok(), { vendorToken: null });
    assert.equal(s.requests.length, 0);
    const t = makeCtx(ok(), { vendorToken: null });
    await toggleFactory(...args(t))("isVacation", true);
    assert.equal(t.requests.length, 0);
  });

  test("a toggle already in flight ignores the second tap", async () => {
    const ctx = makeCtx(ok());
    ctx.deps.togglingAvailability = true;
    await toggleFactory(...args(ctx))("isVacation", true);
    assert.equal(ctx.requests.length, 0);
  });

  test("loading flags clear on success, HTTP failure and network failure alike", async () => {
    for (const impl of [ok(), httpFail(401, "x"), netFail]) {
      assert.equal((await runSave(impl)).savingSettings, false);
      assert.equal((await runToggle(impl, "isVacation", true)).toggling, false);
    }
  });
});

describe("H-30 · the wiring itself, read from source", () => {
  test("both handlers check the response", () => {
    assert.match(SAVE, /res(ponse)?\.ok/, "saveStoreSettings ignores res.ok again");
    assert.match(TOGGLE, /res(ponse)?\.ok/, "toggleAvailability ignores res.ok again");
  });

  test("neither catch block is empty again", () => {
    assert.doesNotMatch(SAVE, /catch\s*(\([^)]*\))?\s*\{\s*\}/);
    assert.doesNotMatch(TOGGLE, /catch\s*(\([^)]*\))?\s*\{\s*\}/);
  });

  test("Alert is imported from react-native, not shadowed", () => {
    assert.match(SRC, /import\s*\{[^}]*\bAlert\b[^}]*\}\s*from\s*"react-native"/s);
  });

  test("the connection message exists and is Arabic prose", () => {
    assert.equal(typeof LIFTED_CONNECTION_ERROR, "string");
    assert.match(LIFTED_CONNECTION_ERROR, /[؀-ۿ]/);
  });

  test("no automatic retry was smuggled into either handler", () => {
    for (const b of [SAVE, TOGGLE]) {
      assert.doesNotMatch(b, /setTimeout|setInterval|retry|Retry/);
    }
  });

  test("the success path is reached only after the ok check, in both handlers", () => {
    for (const [name, b] of [["save", SAVE], ["toggle", TOGGLE]]) {
      const okAt = b.search(/if\s*\(\s*!res\.ok\s*\)/);
      const buzzAt = b.indexOf("NotificationFeedbackType.Success");
      assert.ok(okAt >= 0, `${name}: no !res.ok guard`);
      assert.ok(buzzAt > okAt, `${name}: success haptic is not behind the guard`);
    }
  });

  test("the settings modal is closed only after the ok check", () => {
    const okAt = SAVE.search(/if\s*\(\s*!res\.ok\s*\)/);
    const closeAt = SAVE.indexOf("setSettingsVisible(false)");
    assert.ok(closeAt > okAt, "the modal still closes before the response is judged");
  });

  test("the modal is not closed from finally", () => {
    const fin = SAVE.slice(SAVE.lastIndexOf("} finally {"));
    assert.doesNotMatch(fin, /setSettingsVisible/, "finally must only clear the saving flag");
  });
});
