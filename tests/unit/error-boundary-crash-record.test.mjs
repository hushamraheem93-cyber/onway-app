/**
 * Error-boundary crash recording tests (audit finding H-32).
 *
 * ErrorBoundary.componentDidCatch called this.props.onError and did nothing else.
 * App.tsx mounts <ErrorBoundary> with no props at all, so that branch never fired:
 * a crash caught by the boundary was recorded absolutely nowhere by the app's own
 * code — not to the device log, not anywhere. The project also carries no
 * error-tracking service (85 dependencies, none of sentry/bugsnag/crashlytics/…),
 * and there is no global ErrorUtils handler, so the boundary was the last place a
 * crash could have left a trace and it left none.
 *
 * Measured on the pre-fix source: a real crash produced {error: [], warn: [], log: []}.
 *
 * A second defect in the same four lines, which the audit does not mention: an
 * onError hook that itself throws escaped componentDidCatch, taking down the very
 * boundary that was handling the crash — a recoverable screen becomes a dead app.
 *
 * The fix records the crash to the device log and isolates the hook. Nothing is
 * sent anywhere; this stays on the device, like the console.error calls already
 * used elsewhere in the client. It does NOT add an error-tracking service — that
 * is the other half of H-32 and needs an explicit product decision, since it means
 * a new dependency, native configuration, a DSN secret, and user data leaving the
 * device.
 *
 * componentDidCatch's body is lifted straight out of the shipped .tsx and invoked
 * with a `this` whose props match the real mount site, so what runs here is the
 * real lifecycle body rather than a re-implementation of it.
 *
 * Run:  node --test tests/unit/error-boundary-crash-record.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { stripComments as sharedStripComments } from "./_source.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const ts = require("typescript");

const SRC = readFileSync(join(here, "../../client/components/ErrorBoundary.tsx"), "utf8");
const APP = readFileSync(join(here, "../../client/App.tsx"), "utf8");

function braceBody(src, at) {
  const open = src.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") { depth -= 1; if (depth === 0) return src.slice(open + 1, i); }
  }
  throw new Error("unbalanced brace scan");
}
/**
 * The parameter list contains an inline object type (`info: { componentStack:
 * string }`), so the body's opening brace is the first one AFTER the parameter
 * parens close — not simply the next `{`.
 */
function methodBody(src, name) {
  const at = src.indexOf(`${name}(`);
  if (at < 0) throw new Error(`method not found: ${name}`);
  let i = at + name.length, depth = 0;
  for (; i < src.length; i += 1) {
    if (src[i] === "(") depth += 1;
    else if (src[i] === ")") { depth -= 1; if (depth === 0) { i += 1; break; } }
  }
  return braceBody(src, i);
}
function compile(body, params, deps) {
  const js = ts.transpileModule(
    `return function lifted(${params.join(", ")}) {\n${body}\n};`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } },
  ).outputText;
  // eslint-disable-next-line no-new-func
  return new Function(...deps, js);
}
const stripComments = sharedStripComments;

const CLEAN = stripComments(SRC);
const APP_CLEAN = stripComments(APP);
const didCatch = compile(methodBody(SRC, "componentDidCatch"), ["error", "info"], ["console"]);

const STACK = "\n  in HomeScreen (at App.tsx:110)\n  in ErrorBoundary\n  in App";

/**
 * Run the real lifecycle body with given props, capturing everything it emits.
 * `info` is taken positionally with NO default: passing undefined must really mean
 * undefined, or the "missing info" case silently tests the happy path instead.
 */
function crash(props, error, ...rest) {
  const info = rest.length ? rest[0] : { componentStack: STACK };
  const log = { error: [], warn: [], log: [] };
  const fake = {
    error: (...a) => log.error.push(a.map(String).join(" ")),
    warn: (...a) => log.warn.push(a.map(String).join(" ")),
    log: (...a) => log.log.push(a.map(String).join(" ")),
  };
  didCatch(fake).call({ props }, error, info);
  return {
    log,
    all: [...log.error, ...log.warn, ...log.log].join("\n"),
    recorded: log.error.length + log.warn.length + log.log.length > 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
describe("H-32 · a crash must leave a record", () => {
  test("the boundary as the app actually mounts it — no props at all", () => {
    const c = crash({}, new TypeError("Cannot read property 'id' of undefined"));
    assert.ok(c.recorded, "the crash was swallowed: componentDidCatch emitted nothing");
    assert.match(c.all, /Cannot read property 'id' of undefined/,
      "the record does not say what actually failed");
  });

  test("the component stack is kept, so the failing screen is identifiable", () => {
    const c = crash({}, new Error("boom"),
      { componentStack: "\n  in DriverHomeScreen\n  in App" });
    assert.match(c.all, /DriverHomeScreen/,
      "no way to tell which screen crashed");
  });

  test("the record goes to console.error, not a quieter channel", () => {
    const c = crash({}, new Error("boom"));
    assert.ok(c.log.error.length >= 1,
      "a crash logged below error level is easy to miss in a device log");
  });

  for (const [label, err] of [
    ["an Error with no message", new Error()],
    ["a thrown string", "just a string"],
    ["null", null],
    ["undefined", undefined],
    ["a plain object", { weird: true }],
  ]) {
    test(`${label} is recorded without the handler itself throwing`, () => {
      let thrown = null;
      let c = null;
      try { c = crash({}, err); } catch (e) { thrown = e; }
      assert.equal(thrown, null, `componentDidCatch threw on ${label}: ${thrown}`);
      assert.ok(c.recorded, `${label} produced no record`);
    });
  }

  for (const [label, info] of [["undefined", undefined], ["null", null], ["{}", {}]]) {
    test(`an info of ${label} does not break recording`, () => {
      let thrown = null;
      let c = null;
      try { c = crash({}, new Error("x"), info); } catch (e) { thrown = e; }
      assert.equal(thrown, null, `componentDidCatch threw on info=${label}: ${thrown}`);
      assert.ok(c.recorded, `info=${label} produced no record`);
      assert.match(c.all, /x/, "the error itself was lost");
    });
  }
});

describe("H-32 · the onError contract still holds", () => {
  test("onError is still called with the error and the stack", () => {
    const seen = [];
    crash({ onError: (e, s) => seen.push([e, s]) }, new Error("kaboom"));
    assert.equal(seen.length, 1, "onError was not called");
    assert.equal(seen[0][0].message, "kaboom");
    assert.equal(seen[0][1], STACK);
  });

  test("recording happens even when onError is supplied", () => {
    const c = crash({ onError: () => {} }, new Error("kaboom"));
    assert.ok(c.recorded,
      "recording is conditional on onError being absent — a host that reports " +
      "remotely would silence the local record");
  });

  test("an onError hook that throws does not take the boundary down", () => {
    let thrown = null;
    let c = null;
    try {
      c = crash({ onError: () => { throw new Error("handler exploded"); } },
        new Error("original crash"));
    } catch (e) { thrown = e; }
    assert.equal(thrown, null,
      `the hook's exception escaped componentDidCatch: ${thrown && thrown.message}`);
    assert.match(c.all, /original crash/,
      "the original crash was lost when the hook failed");
  });

  test("a non-function onError is ignored rather than called", () => {
    let thrown = null;
    let c = null;
    try { c = crash({ onError: "not a function" }, new Error("x")); } catch (e) { thrown = e; }
    assert.equal(thrown, null, `threw on a non-function onError: ${thrown}`);
    assert.doesNotMatch(c.all, /handler failed/,
      "a non-function onError was called and the failure reported as a hook error");
  });

  test("with no onError at all the record carries no spurious hook failure", () => {
    // This is the mount the app actually uses. Calling a missing hook and letting
    // the catch report it would put a misleading "onError handler failed" line in
    // the one log a responder reads after every single crash.
    const c = crash({}, new Error("original crash"));
    assert.match(c.all, /original crash/);
    assert.doesNotMatch(c.all, /handler failed/,
      "every crash would be followed by a false 'the reporting hook failed' line");
  });
});

describe("H-32 · nothing else about the boundary changed", () => {
  test("getDerivedStateFromError still returns the error as state", () => {
    const derive = compile(methodBody(SRC, "getDerivedStateFromError"), ["error"], []);
    assert.deepEqual(derive()(new Error("x")).error.message, "x");
  });

  test("resetError still clears the state", () => {
    assert.match(CLEAN,
      /resetError\s*=\s*\(\)[^=]*=>\s*\{\s*this\.setState\(\{\s*error:\s*null\s*\}\)/);
  });

  test("ErrorFallback is still the default fallback", () => {
    assert.match(CLEAN, /FallbackComponent:\s*ErrorFallback/);
  });

  test("the boundary still renders children when there is no error", () => {
    assert.match(CLEAN, /this\.state\.error\s*&&\s*FallbackComponent/);
    assert.match(CLEAN, /this\.props\.children/);
  });
});

describe("H-32 · the recording must stay local and unconditional", () => {
  const body = stripComments(methodBody(SRC, "componentDidCatch"));

  test("no network call was introduced in the crash path", () => {
    assert.doesNotMatch(body, /\bfetch\s*\(|XMLHttpRequest|axios|navigator\.sendBeacon/,
      "a crash handler must not depend on the network to do its job");
  });

  test("no retry or timer was introduced in the crash path", () => {
    assert.doesNotMatch(body, /setTimeout|setInterval|retry/i);
  });

  test("recording is not nested inside the onError branch", () => {
    const logAt = body.indexOf("console.error");
    const hookAt = body.search(/typeof\s+this\.props\.onError/);
    assert.ok(logAt >= 0, "there is no record at all");
    assert.ok(hookAt < 0 || logAt < hookAt,
      "the record sits behind the onError check, so the app's own mount records nothing");
  });
});

describe("H-32 · the mount site, read from App.tsx", () => {
  test("the boundary is still mounted at the app root", () => {
    assert.match(APP_CLEAN, /<ErrorBoundary[\s>]/, "the boundary is no longer mounted");
  });

  test("the app does not pass onError — which is why recording must be built in", () => {
    // Not a defect to fix here: it documents WHY the default path has to record.
    // If a future change does pass onError, the tests above still hold.
    const mount = APP_CLEAN.match(/<ErrorBoundary[^>]*>/)?.[0] ?? "";
    if (/\bonError\b/.test(mount)) return;
    assert.ok(
      /console\.error/.test(stripComments(methodBody(SRC, "componentDidCatch"))),
      "the app mounts the boundary bare and the boundary records nothing — " +
      "a production crash would leave no trace at all",
    );
  });
});
