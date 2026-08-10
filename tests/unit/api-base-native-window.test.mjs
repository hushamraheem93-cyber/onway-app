/**
 * API base resolution under a React Native global object.
 *
 * query-client.ts read `window.location.origin` behind a `typeof window !==
 * "undefined"` guard. React Native DEFINES a global `window` — it is an alias for
 * the global object — but it does NOT define `window.location`. So in a standalone
 * EAS build the guard passed and the property read threw:
 *
 *     TypeError: Cannot read property 'origin' of undefined
 *
 * The throw happens while building the argument object, BEFORE resolveApiBase is
 * called, so a correctly configured EXPO_PUBLIC_API_BASE_URL did not save it. Every
 * network path in the app funnels through getApiUrl(), so the whole build could not
 * reach the server: the login screen showed the raw TypeError under the phone field.
 *
 * It only survived testing because Expo Go and the Metro dev client polyfill
 * window.location, and because the pure resolveApiBase unit tests are handed a
 * ready-made windowOrigin string and never execute the wrapper that computes it.
 *
 * currentResolution's body is lifted straight out of the shipped source and run with
 * `window` injected as a parameter, so what runs here is the real expression.
 *
 * Run:  node --test tests/unit/api-base-native-window.test.mjs
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
const SRC = readFileSync(join(here, "../../client/lib/query-client.ts"), "utf8");
const API_BASE_SRC = readFileSync(join(here, "../../client/lib/apiBase.ts"), "utf8");

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
function compile(fnBody, params, deps) {
  const js = ts.transpileModule(
    `return function lifted(${params.join(", ")}) {\n${fnBody}\n};`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } },
  ).outputText;
  // eslint-disable-next-line no-new-func
  return new Function(...deps, js);
}

// The real resolver, transpiled from its own source so the decision logic under
// test is the shipped one.
const resolverModule = ts.transpileModule(API_BASE_SRC, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const resolveApiBase = (() => {
  const exports = {};
  // eslint-disable-next-line no-new-func
  new Function("exports", "require", resolverModule)(exports, require);
  return exports.resolveApiBase;
})();

const DEPS = ["Platform", "process", "resolveApiBase", "window"];
const CURRENT = compile(body(SRC, "function currentResolution()"), [], DEPS);

/**
 * `window` is injected as a parameter, which shadows the real global inside the
 * lifted body — so each case models one runtime exactly.
 */
function resolveUnder({ platform, win, configured, legacy }) {
  const env = {};
  if (configured !== undefined) env.EXPO_PUBLIC_API_BASE_URL = configured;
  if (legacy !== undefined) env.EXPO_PUBLIC_DOMAIN = legacy;
  return CURRENT({ OS: platform }, { env }, resolveApiBase, win)();
}

/** React Native: `window` exists and IS the global object, but has no `location`. */
const RN_WINDOW = (() => {
  const w = { navigator: { product: "ReactNative" } };
  w.window = w;
  return w;
})();
const WEB_WINDOW = (origin) => ({ location: { origin, href: `${origin}/` } });

describe("the standalone-build crash", () => {
  for (const platform of ["ios", "android"]) {
    test(`${platform}: a global window without location must not throw`, () => {
      assert.doesNotThrow(
        () => resolveUnder({
          platform, win: RN_WINDOW, configured: "https://onwayiq.com",
        }),
        /origin/,
        "reading window.location.origin on React Native took the whole app down",
      );
    });

    test(`${platform}: the configured API host is still used`, () => {
      const r = resolveUnder({
        platform, win: RN_WINDOW, configured: "https://onwayiq.com",
      });
      assert.equal(r.ok, true);
      assert.equal(r.url, "https://onwayiq.com");
    });

    test(`${platform}: the legacy EXPO_PUBLIC_DOMAIN alias still works`, () => {
      const r = resolveUnder({ platform, win: RN_WINDOW, legacy: "onwayiq.com" });
      assert.equal(r.ok, true);
      assert.equal(r.url, "https://onwayiq.com");
    });

    test(`${platform}: an unconfigured build reports missing config, it does not crash`, () => {
      const r = resolveUnder({ platform, win: RN_WINDOW });
      assert.equal(r.ok, false);
      assert.equal(r.reason, "missing_config");
    });

    test(`${platform}: no global window at all is still safe`, () => {
      const r = resolveUnder({
        platform, win: undefined, configured: "https://onwayiq.com",
      });
      assert.equal(r.ok, true);
      assert.equal(r.url, "https://onwayiq.com");
    });

    test(`${platform}: a window whose location is explicitly undefined is safe`, () => {
      const r = resolveUnder({
        platform, win: { location: undefined }, configured: "https://onwayiq.com",
      });
      assert.equal(r.ok, true);
      assert.equal(r.url, "https://onwayiq.com");
    });

    test(`${platform}: the page origin is never used as the API host on a phone`, () => {
      // Even if something did define location natively, a phone must talk to the
      // configured server, never to whatever origin the bundle was served from.
      const r = resolveUnder({
        platform, win: WEB_WINDOW("http://192.168.1.5:8081"),
        configured: "https://onwayiq.com",
      });
      assert.equal(r.url, "https://onwayiq.com");
    });
  }
});

describe("web behaviour is unchanged", () => {
  test("configured host wins on web", () => {
    const r = resolveUnder({
      platform: "web", win: WEB_WINDOW("https://admin.onwayiq.com"),
      configured: "https://onwayiq.com",
    });
    assert.equal(r.ok, true);
    assert.equal(r.url, "https://onwayiq.com");
  });

  test("the Expo dev server origin still maps to the API port", () => {
    const r = resolveUnder({ platform: "web", win: WEB_WINDOW("http://localhost:8081") });
    assert.equal(r.ok, true);
    assert.equal(r.url, "http://localhost:5000");
  });

  test("a plain web origin is used as-is when nothing is configured", () => {
    const r = resolveUnder({ platform: "web", win: WEB_WINDOW("https://onwayiq.com") });
    assert.equal(r.ok, true);
    assert.equal(r.url, "https://onwayiq.com");
  });

  test("web with no window still falls back to the configured host", () => {
    const r = resolveUnder({
      platform: "web", win: undefined, configured: "https://onwayiq.com",
    });
    assert.equal(r.ok, true);
    assert.equal(r.url, "https://onwayiq.com");
  });
});

describe("the guard itself, read from source", () => {
  const clean = SRC
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  const fn = body(clean, "function currentResolution()");

  test("window.location is never read behind a bare typeof window check", () => {
    // Every read of window.location must be guarded by something that also
    // establishes location exists.
    const reads = fn.match(/window\.location/g) || [];
    if (reads.length === 0) return; // resolved another way entirely — fine
    assert.match(
      fn, /window\.location\s*(!==|===)\s*(undefined|null)|window\.location\s*\?|\?\.\s*location|hasLocation|!!\s*window\.location/,
      "window.location is read without ever checking that it exists",
    );
  });

  test("an empty configured value is still treated as unset", () => {
    const r = resolveUnder({ platform: "ios", win: RN_WINDOW, configured: "   " });
    assert.equal(r.ok, false);
  });
});
