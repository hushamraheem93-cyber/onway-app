/**
 * M-80 … M-83 — the first launch after install renders left-to-right.
 *
 * `I18nManager.forceRTL(true)` was called in the body of two modules
 * (client/constants/theme.ts and client/App.tsx). In React Native that call writes
 * a NATIVE flag which the platform reads when it starts up; it cannot re-lay-out
 * the session that is already running. So the very first launch after an install
 * draws the whole Arabic app mirrored, and it "fixes itself" the next time the user
 * opens it — which is exactly how the audit described it.
 *
 * A `setTimeout` before rendering would only move the flash later. The correct
 * handling is to notice that the flag did not take effect and reload the app once,
 * while the splash screen is still up, so the wrong direction is never drawn — and
 * to remember the attempt, so a platform that can never honour forceRTL (web, or a
 * client where reloading is unavailable) degrades instead of looping forever.
 *
 * The decision is a pure function so it can be executed here for every case,
 * including the two that must NOT reload. It is lifted out of the shipped module
 * rather than restated.
 *
 * Run:  node --test tests/unit/m80-rtl-first-launch.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments } from "./_source.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const read = (p) => readFileSync(join(root, p), "utf8");

const RTL = stripComments(read("client/lib/rtl.ts"));
const ENTRY = stripComments(read("client/index.js"));
const THEME = stripComments(read("client/constants/theme.ts"));
const APP = stripComments(read("client/App.tsx"));

const ts = (await import(join(root, "node_modules/typescript/lib/typescript.js")))
  .default;

// ── lifting ──────────────────────────────────────────────────────────────────

function liftFunction(src, marker) {
  const at = src.indexOf(marker);
  assert.notEqual(at, -1, `moved or renamed: ${JSON.stringify(marker)}`);
  let open = src.indexOf("{", at);
  for (;;) {
    assert.notEqual(open, -1, `no body brace for ${marker}`);
    let j = open + 1;
    while (j < src.length && src[j] !== "\n" && /\s/.test(src[j])) j++;
    if (j >= src.length || src[j] === "\n") break;
    open = src.indexOf("{", open + 1);
  }
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(at, i + 1);
  }
  throw new Error(`unbalanced braces after ${marker}`);
}

/**
 * The REAL decision function, executed.
 *
 * The module is transpiled FIRST and the function lifted out of the JavaScript. Its
 * TypeScript signature annotates the parameter with an inline object type, so brace
 * matching over the .ts source grabs that type instead of the body.
 */
const rtlStartupAction = (() => {
  const js = ts.transpileModule(RTL, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const src = liftFunction(js, "function rtlStartupAction(");
  return new Function(`${src}\nreturn rtlStartupAction;`)();
})();

// ─────────────────────────────────────────────────────────────────────────────
describe("M-80 · the first launch reloads instead of drawing the wrong way", () => {
  test("flag not applied, nothing tried yet, reload available → reload", () => {
    assert.equal(
      rtlStartupAction({ isRTL: false, alreadyAttempted: false, canReload: true }),
      "reload",
      "the first launch would render left-to-right",
    );
  });

  test("flag applied → carry on, no reload", () => {
    assert.equal(
      rtlStartupAction({ isRTL: true, alreadyAttempted: false, canReload: true }),
      "ready",
    );
  });

  test("flag applied on a later launch → still no reload", () => {
    assert.equal(
      rtlStartupAction({ isRTL: true, alreadyAttempted: true, canReload: true }),
      "ready",
    );
  });
});

describe("M-80 · it can never loop", () => {
  test("already reloaded once and STILL not applied → give up, do not reload again", () => {
    assert.equal(
      rtlStartupAction({ isRTL: false, alreadyAttempted: true, canReload: true }),
      "ready",
      "a second reload would restart the app forever",
    );
  });

  test("no reload mechanism available → carry on rather than hang", () => {
    assert.equal(
      rtlStartupAction({ isRTL: false, alreadyAttempted: false, canReload: false }),
      "ready",
    );
  });

  test("every input combination resolves to a defined action", () => {
    for (const isRTL of [true, false]) {
      for (const alreadyAttempted of [true, false]) {
        for (const canReload of [true, false]) {
          const action = rtlStartupAction({ isRTL, alreadyAttempted, canReload });
          assert.ok(
            ["ready", "reload"].includes(action),
            `undefined action for ${JSON.stringify({ isRTL, alreadyAttempted, canReload })}`,
          );
        }
      }
    }
  });

  test("exactly one of the eight combinations reloads", () => {
    let reloads = 0;
    for (const isRTL of [true, false])
      for (const alreadyAttempted of [true, false])
        for (const canReload of [true, false])
          if (rtlStartupAction({ isRTL, alreadyAttempted, canReload }) === "reload")
            reloads += 1;
    assert.equal(reloads, 1, "the reload condition is not as narrow as it must be");
  });
});

describe("M-80 · the fix is a reload, not a delay", () => {
  test("no timer is used to paper over the flash", () => {
    assert.doesNotMatch(
      RTL,
      /setTimeout|setInterval|requestAnimationFrame/,
      "a timer only moves the wrong-direction frame later, it does not remove it",
    );
  });

  test("the attempt is remembered across the reload", () => {
    // In-memory would reset with the JS context and loop forever.
    assert.match(RTL, /AsyncStorage/, "the attempt is not persisted");
    assert.match(RTL, /getItem|setItem/);
  });

  test("the reload goes through expo-updates", () => {
    assert.match(RTL, /expo-updates/);
    assert.match(RTL, /reloadAsync/);
  });
});

describe("M-80 · the flags are set once, in one place", () => {
  test("client/lib/rtl.ts owns the forceRTL call", () => {
    assert.match(RTL, /forceRTL\(true\)/);
    assert.match(RTL, /allowRTL\(true\)/);
  });

  test("theme.ts no longer forces RTL as an import side effect", () => {
    assert.doesNotMatch(
      THEME,
      /I18nManager\.(force|allow)RTL/,
      "a second module still sets the flag; whichever imports first wins",
    );
  });

  test("App.tsx no longer forces RTL either", () => {
    assert.doesNotMatch(APP, /I18nManager\.(force|allow)RTL/);
  });

  test("the flags are applied from the entry point, before App is required", () => {
    // client/index.js requires App with require() precisely so side effects can be
    // ordered. RTL has to be applied before App's module graph is evaluated.
    assert.match(ENTRY, /rtl/i, "the entry point does not apply RTL");
    const applyAt = ENTRY.search(/applyRtlFlags\s*\(/);
    const requireAt = ENTRY.search(/require\(\s*["']@\/App["']\s*\)/);
    assert.ok(applyAt > -1, "applyRtlFlags is not called from the entry point");
    assert.ok(requireAt > -1, "the App require moved");
    assert.ok(
      applyAt < requireAt,
      "RTL is applied after App is loaded — theme.ts would already have laid out",
    );
  });
});

describe("M-80 · reading the flag is not confused with setting it", () => {
  test("ProductCard still reads I18nManager.isRTL for its own maths", () => {
    // Reading the current direction is legitimate and unrelated; only the
    // module-body WRITES were the defect.
    const card = stripComments(read("client/components/ProductCard.tsx"));
    assert.match(card, /I18nManager\.isRTL/);
    assert.doesNotMatch(card, /I18nManager\.(force|allow)RTL/);
  });
});
