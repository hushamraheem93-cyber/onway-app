/**
 * H-49 — the unsigned Expo Go surface must not exist in production.
 *
 * `scripts/build.js` writes `static-build/`: an UNSIGNED Expo manifest plus JS
 * bundles. `server/index.ts` served that directory from the same origin as the
 * API, unconditionally. This app ships no OTA channel (no expo-updates, no
 * `updates` block), so released binaries cannot consume it — which is why the
 * finding's "arbitrary JS in every session" impact did not apply. What remained
 * was a real latent path: nothing in the SERVER stopped the directory being
 * served if it ever appeared on a production host. "No deploy script builds it"
 * is a fact about the scripts, not a property of the server.
 *
 * There were exactly two ways in, and both are now gated:
 *   • serveExpoManifest()  — read static-build/<platform>/manifest.json directly
 *   • express.static(static-build) — served every file underneath
 *
 * These tests do not grep for the guard. They LIFT the three shipped code units
 * out of server/index.ts, mount them on a real Express app, plant a real
 * static-build/ containing a real payload, and make real HTTP requests — under
 * NODE_ENV=production and again under development.
 *
 * Run:  node --test tests/unit/h49-expo-surface-production.test.mjs
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import * as fs from "node:fs";
import * as path from "node:path";
import ts from "typescript";
import { stripComments } from "./_source.mjs";
import { isExpoGoSurfaceEnabled } from "../../server/env.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const INDEX = readFileSync(join(root, "server/index.ts"), "utf8");
/** Comments describe the OLD unconditional behaviour — never let them pass a check. */
const indexCode = stripComments(INDEX);

// ── lifting the shipped code ─────────────────────────────────────────────────
/** Slice from `start` through the brace that closes the first `{` after it. */
function braceBlock(src, start) {
  const open = src.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error("unbalanced braces while lifting from server/index.ts");
}

/** Slice a `foo(...)` statement through its matching close paren. */
function callStatement(src, start) {
  const open = src.indexOf("(", start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")" && --depth === 0) return src.slice(start, i + 1) + ";";
  }
  throw new Error("unbalanced parens while lifting from server/index.ts");
}

const lift = (anchor) => {
  const at = INDEX.indexOf(anchor);
  assert.notEqual(at, -1, `anchor moved in server/index.ts: ${anchor}`);
  return braceBlock(INDEX, at);
};

/** The real serveExpoManifest, verbatim. */
const SERVE_MANIFEST = lift("function serveExpoManifest(");
/** The real middleware that routes /, /manifest and the expo-platform header. */
const EXPO_MIDDLEWARE = (() => {
  const marker = INDEX.indexOf('const platform = req.header("expo-platform")');
  assert.notEqual(marker, -1, "the expo-platform routing disappeared");
  const start = INDEX.lastIndexOf("app.use((req", marker);
  assert.notEqual(start, -1, "could not find the app.use that owns the expo route");
  return braceBlock(INDEX, start) + ");";
})();
/**
 * The real static mount. Lifted whether or not it is guarded, so the behavioural
 * tests below measure what the server ACTUALLY serves rather than failing to boot
 * when the guard is absent — an unguarded mount must fail the production tests on
 * their own merits, not by breaking the harness.
 */
const STATIC_MOUNT = (() => {
  const marker = INDEX.indexOf('express.static(path.resolve(process.cwd(), "static-build")');
  assert.notEqual(marker, -1, "the static-build mount disappeared");
  const useAt = INDEX.lastIndexOf("app.use(", marker);
  assert.notEqual(useAt, -1, "could not find the app.use that owns the static-build mount");
  const ifAt = INDEX.lastIndexOf("if (", marker);
  const guarded =
    ifAt !== -1 && ifAt < useAt && INDEX.slice(ifAt, useAt).includes("isExpoGoSurfaceEnabled");
  return { guarded, code: guarded ? braceBlock(INDEX, ifAt) : callStatement(INDEX, useAt) };
})();

/** Compile the lifted TypeScript and build an Express app from it. */
function buildApp(cwd, fsImpl = fs) {
  const src = `
    ${SERVE_MANIFEST}
    const serveLandingPage = ({ res }) => res.status(200).send("landing");
    const landingPageTemplate = "", publicPageTemplate = "", appName = "Onway";
    return (app) => {
      ${EXPO_MIDDLEWARE}
      ${STATIC_MOUNT.code}
    };
  `;
  const js = ts.transpileModule(src, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;

  // `process` is shadowed so process.cwd() points at the fixture. env stays REAL,
  // because isExpoGoSurfaceEnabled reads the real process.env.NODE_ENV.
  const shadowProcess = { ...process, cwd: () => cwd, env: process.env };
  const factory = new Function(
    "express", "path", "fs", "isExpoGoSurfaceEnabled", "process", js,
  )(express, path, fsImpl, isExpoGoSurfaceEnabled, shadowProcess);

  const app = express();
  factory(app);
  app.use((_req, res) => res.status(404).send("not found"));
  return app;
}

// ── a fixture that is deliberately HOSTILE: static-build exists and is planted ──
let fixture, servers = [];
const PLANTED_MANIFEST = { id: "planted", launchAsset: { url: "https://attacker.test/evil.bundle" } };

before(() => {
  fixture = mkdtempSync(join(tmpdir(), "h49-"));
  for (const p of ["ios", "android"]) {
    mkdirSync(join(fixture, "static-build", p), { recursive: true });
    writeFileSync(join(fixture, "static-build", p, "manifest.json"),
      JSON.stringify(PLANTED_MANIFEST));
  }
  writeFileSync(join(fixture, "static-build", "evil.js"), "PLANTED_PAYLOAD");
  // A file two levels up, to prove traversal cannot reach outside static-build.
  writeFileSync(join(fixture, "secret.txt"), "TOP_SECRET");
});

after(() => {
  for (const s of servers) s.close();
  rmSync(fixture, { recursive: true, force: true });
});

const listen = (app) => new Promise((r) => {
  const s = app.listen(0, () => { servers.push(s); r(s); });
});

/** Boot the lifted server under a given NODE_ENV and issue one request. */
async function request(nodeEnv, path, headers = {}, fsImpl = fs) {
  const prev = process.env.NODE_ENV;
  if (nodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = nodeEnv;
  try {
    const s = await listen(buildApp(fixture, fsImpl));
    const res = await fetch(`http://127.0.0.1:${s.address().port}${path}`, { headers });
    const body = await res.text();
    s.close();
    return { status: res.status, body };
  } finally {
    if (prev === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prev;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
describe("H-49 · the predicate", () => {
  const under = (v, fn) => {
    const prev = process.env.NODE_ENV;
    if (v === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = v;
    try { return fn(); } finally {
      if (prev === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = prev;
    }
  };

  test("production disables the Expo Go surface", () => {
    assert.equal(under("production", isExpoGoSurfaceEnabled), false);
  });

  test("development and an unset NODE_ENV keep it enabled", () => {
    assert.equal(under("development", isExpoGoSurfaceEnabled), true);
    assert.equal(under(undefined, isExpoGoSurfaceEnabled), true);
    assert.equal(under("test", isExpoGoSurfaceEnabled), true);
  });

  test("it does NOT depend on DEV_MODE — that would break `npm run server:dev`", () => {
    const prevDev = process.env.DEV_MODE;
    delete process.env.DEV_MODE;
    try { assert.equal(under("development", isExpoGoSurfaceEnabled), true); }
    finally { if (prevDev !== undefined) process.env.DEV_MODE = prevDev; }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("H-49 · PRODUCTION serves nothing, even with static-build planted", () => {
  test("GET / with expo-platform: ios does not return the planted manifest", async () => {
    const r = await request("production", "/", { "expo-platform": "ios" });
    assert.equal(r.status, 404);
    assert.doesNotMatch(r.body, /attacker\.test|planted/, "the planted manifest was served");
  });

  test("GET / with expo-platform: android does not return the planted manifest", async () => {
    const r = await request("production", "/", { "expo-platform": "android" });
    assert.equal(r.status, 404);
    assert.doesNotMatch(r.body, /attacker\.test|planted/);
  });

  test("GET /manifest does not return the planted manifest", async () => {
    for (const p of ["ios", "android"]) {
      const r = await request("production", "/manifest", { "expo-platform": p });
      assert.equal(r.status, 404);
      assert.doesNotMatch(r.body, /attacker\.test|planted/);
    }
  });

  test("GET /evil.js cannot reach static-build", async () => {
    const r = await request("production", "/evil.js");
    assert.equal(r.status, 404);
    assert.doesNotMatch(r.body, /PLANTED_PAYLOAD/, "planted JS was served from the API origin");
  });

  test("no file under static-build is reachable", async () => {
    for (const p of ["/ios/manifest.json", "/android/manifest.json", "/evil.js"]) {
      const r = await request("production", p);
      assert.equal(r.status, 404, `${p} was served`);
      assert.doesNotMatch(r.body, /PLANTED_PAYLOAD|attacker\.test/);
    }
  });

  test("the 404 body does not reveal whether the directory exists", async () => {
    const planted = await request("production", "/", { "expo-platform": "ios" });
    // Same shape as the pre-existing "not built" 404 — no new signal for a prober.
    assert.match(planted.body, /Manifest not found for platform: ios/);
  });

  test("the manifest route never touches the filesystem in production", async () => {
    // The lifted code receives `fs` as an injected binding, so a spy sees every
    // real call the shipped source makes — no module patching involved.
    const touched = [];
    const watch = (name) => (p, ...rest) => {
      if (String(p).includes("static-build")) touched.push(`${name}(${p})`);
      return fs[name](p, ...rest);
    };
    const spy = { ...fs, existsSync: watch("existsSync"), readFileSync: watch("readFileSync") };

    await request("production", "/", { "expo-platform": "ios" }, spy);
    assert.deepEqual(touched, [],
      `production read static-build from disk: ${touched.join(", ")}`);

    // …and the same spy DOES record a read in development, proving it works.
    await request("development", "/", { "expo-platform": "ios" }, spy);
    assert.ok(touched.length > 0, "the filesystem spy never fired — the test proves nothing");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("H-49 · DEVELOPMENT is untouched — Expo Go still works", () => {
  for (const env of ["development", undefined]) {
    const label = env ?? "(unset)";
    test(`NODE_ENV=${label}: GET / with expo-platform: ios serves the manifest`, async () => {
      const r = await request(env, "/", { "expo-platform": "ios" });
      assert.equal(r.status, 200);
      assert.match(r.body, /planted/, "Expo Go development workflow was broken");
    });

    test(`NODE_ENV=${label}: GET /manifest serves the android manifest`, async () => {
      const r = await request(env, "/manifest", { "expo-platform": "android" });
      assert.equal(r.status, 200);
      assert.match(r.body, /planted/);
    });

    test(`NODE_ENV=${label}: bundles under static-build are still served`, async () => {
      const r = await request(env, "/evil.js");
      assert.equal(r.status, 200);
      assert.match(r.body, /PLANTED_PAYLOAD/, "the static mount stopped working in development");
    });
  }

  test("the landing page still answers without the expo-platform header", async () => {
    const r = await request("development", "/");
    assert.equal(r.status, 200);
    assert.match(r.body, /landing/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("H-49 · path traversal stays impossible in every environment", () => {
  for (const env of ["production", "development"]) {
    for (const bad of ["../../etc", "ios/../../..", "IOS", "web", "../secret.txt", ""]) {
      test(`NODE_ENV=${env}: expo-platform ${JSON.stringify(bad)} reaches no manifest`, async () => {
        const r = await request(env, "/", { "expo-platform": bad });
        assert.doesNotMatch(r.body, /planted|TOP_SECRET/,
          "a non-literal platform value reached the filesystem");
      });
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
describe("H-49 · the source keeps both doors gated", () => {
  test("every static-build access in server/index.ts is behind the gate", () => {
    const lines = indexCode.split("\n");
    const hits = lines
      .map((l, i) => [i + 1, l])
      .filter(([, l]) => l.includes("static-build"));
    assert.ok(hits.length >= 2, "the static-build references vanished — re-read this test");
    // Each hit must sit inside a block guarded by the predicate: check that the
    // nearest preceding `isExpoGoSurfaceEnabled` is closer than the previous hit's
    // own guard, i.e. the guard exists above it within the same function.
    for (const [lineNo] of hits) {
      const above = lines.slice(Math.max(0, lineNo - 30), lineNo).join("\n");
      assert.match(above, /isExpoGoSurfaceEnabled\(\)/,
        `server/index.ts:${lineNo} touches static-build with no environment gate above it`);
    }
  });

  test("the static mount is not registered at all in production", () => {
    assert.equal(STATIC_MOUNT.guarded, true,
      "express.static(static-build) is mounted unconditionally again");
    assert.match(STATIC_MOUNT.code, /^if \(isExpoGoSurfaceEnabled\(\)\)/,
      "the mount is registered and then filtered, instead of never being registered");
  });

  test("serveExpoManifest gates BEFORE building the path", () => {
    // Comments inside the function mention static-build; strip them first.
    const body = stripComments(SERVE_MANIFEST);
    const gate = body.indexOf("isExpoGoSurfaceEnabled");
    const pathBuild = body.indexOf("static-build");
    assert.ok(gate !== -1, "serveExpoManifest lost its gate");
    assert.ok(gate < pathBuild,
      "the gate runs after the path is built — production could still touch the filesystem");
  });

  test("no OTA channel was added as part of this fix", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    assert.ok(!("expo-updates" in deps), "expo-updates was added — out of scope for H-49");
    const cfg = readFileSync(join(root, "app.config.js"), "utf8");
    assert.doesNotMatch(cfg, /\bupdates\s*:/, "an updates block was added to app.config.js");
  });
});
