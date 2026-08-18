/**
 * H-80 — "the global fetch interception is installed twice as an import side
 * effect, and every driver or admin request performs a read from the secure key
 * store (10–40 ms extra per request, across an 8-hour shift)."
 *
 * AuthContext.tsx patched global.fetch at module scope:
 *
 *     installDriverAuthInterceptor();
 *     installAdminAuthInterceptor();
 *
 * — two wrappers, installed by the act of importing the file. And inside each
 * wrapper, every matching request did `await getToken(KEY)`, which on device is
 * `SecureStore.getItemAsync`: an IPC round-trip to the iOS Keychain / Android
 * Keystore, to fetch a value that had not changed since login.
 *
 * The token now lives in memory behind authTokenCache (one store read per key,
 * writes go through the same place), and installation is one explicit idempotent
 * step in authBootstrap called by AuthProvider.
 *
 * The cache is EXECUTED here against a counting fake store, so the read counts
 * are measured rather than asserted from the source.
 *
 * No token value is ever printed.
 *
 * Run:  node --test tests/unit/h80-auth-interceptor-lifecycle.test.mjs
 */
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const read = (p) => readFileSync(join(root, p), "utf8");

const CACHE_SRC = read("client/lib/authTokenCache.ts");
const BOOTSTRAP_SRC = read("client/lib/authBootstrap.ts");
const AUTH_CONTEXT = read("client/context/AuthContext.tsx");
const DRIVER_AUTH = read("client/lib/driverAuth.ts");
const ADMIN_AUTH = read("client/lib/adminAuth.ts");

// ─── the real cache, over a counting store ───────────────────────────────────

function liftFn(src, name) {
  const sf = ts.createSourceFile("x.ts", src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let out = null;
  const walk = (n) => {
    if (ts.isFunctionDeclaration(n) && n.name?.text === name) out = n.getText(sf);
    else ts.forEachChild(n, walk);
  };
  walk(sf);
  assert.ok(out, `could not lift ${name}`);
  return out.replace(/^export\s+/, "");
}

const CACHE_FNS = ["entryFor", "readToken", "rememberToken", "forgetToken", "invalidateToken"];

/** A fresh cache instance plus the store-call counters behind it. */
function bootCache() {
  const store = new Map();
  const counts = { get: 0, set: 0, remove: 0 };

  const decls = [
    "const cache = new Map();",
    ...CACHE_FNS.map((n) => liftFn(CACHE_SRC, n)),
  ].join("\n");
  const js = ts.transpileModule(`${decls}\nreturn { ${CACHE_FNS.join(", ")} };`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;

  const deps = {
    getToken: async (k) => { counts.get += 1; return store.has(k) ? store.get(k) : null; },
    setToken: async (k, v) => { counts.set += 1; store.set(k, v); },
    removeToken: async (k) => { counts.remove += 1; store.delete(k); },
  };
  const api = new Function(...Object.keys(deps), js)(...Object.values(deps));
  return { ...api, counts, store };
}

const DRIVER_KEY = "@onway_driver_token";
const ADMIN_KEY = "@onway_admin_token";

// ═════════════════════════════════════════════════════════════════════════════
describe("H-80 · E+F. the key store is not read on every request", () => {
  test("E. one driver request → one store read; a hundred → still one", async () => {
    const c = bootCache();
    c.store.set(DRIVER_KEY, "tok-driver");

    await c.readToken(DRIVER_KEY);
    assert.equal(c.counts.get, 1, "the first request must prime the cache");

    for (let i = 0; i < 99; i++) await c.readToken(DRIVER_KEY);
    assert.equal(c.counts.get, 1,
      `100 driver requests caused ${c.counts.get} key-store reads`);
  });

  test("F. the same holds for admin requests", async () => {
    const c = bootCache();
    c.store.set(ADMIN_KEY, "tok-admin");
    for (let i = 0; i < 100; i++) await c.readToken(ADMIN_KEY);
    assert.equal(c.counts.get, 1,
      `100 admin requests caused ${c.counts.get} key-store reads`);
  });

  test("the measured curve is flat, not linear (the H-80 regression check)", async () => {
    const measure = async (n) => {
      const c = bootCache();
      c.store.set(DRIVER_KEY, "tok");
      for (let i = 0; i < n; i++) await c.readToken(DRIVER_KEY);
      return c.counts.get;
    };
    const [one, ten, hundred] = [await measure(1), await measure(10), await measure(100)];
    assert.deepEqual({ one, ten, hundred }, { one: 1, ten: 1, hundred: 1 },
      `reads scale with requests: 1→${one}, 10→${ten}, 100→${hundred}`);
  });

  test("driver and admin keys are cached independently", async () => {
    const c = bootCache();
    c.store.set(DRIVER_KEY, "d");
    c.store.set(ADMIN_KEY, "a");
    for (let i = 0; i < 20; i++) {
      await c.readToken(DRIVER_KEY);
      await c.readToken(ADMIN_KEY);
    }
    assert.equal(c.counts.get, 2, "one read per key, not per request");
    assert.equal(await c.readToken(DRIVER_KEY), "d");
    assert.equal(await c.readToken(ADMIN_KEY), "a");
  });

  test("an absent token is cached too — a miss is an answer", async () => {
    const c = bootCache();
    for (let i = 0; i < 50; i++) assert.equal(await c.readToken(DRIVER_KEY), null);
    assert.equal(c.counts.get, 1, "a logged-out driver still hits the Keychain per request");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-80 · G+H+I+J. the credential stays correct", () => {
  test("G. login makes the new token visible immediately", async () => {
    const c = bootCache();
    await c.readToken(DRIVER_KEY);                 // primes as null
    await c.rememberToken(DRIVER_KEY, "fresh");
    assert.equal(await c.readToken(DRIVER_KEY), "fresh", "login did not take effect");
    assert.equal(c.store.get(DRIVER_KEY), "fresh", "the store was not written");
  });

  test("H. a refresh replaces the value used by the next request", async () => {
    const c = bootCache();
    await c.rememberToken(DRIVER_KEY, "old");
    assert.equal(await c.readToken(DRIVER_KEY), "old");
    await c.rememberToken(DRIVER_KEY, "new");
    assert.equal(await c.readToken(DRIVER_KEY), "new", "a stale token survived a refresh");
  });

  test("I. logout clears memory and the store together", async () => {
    const c = bootCache();
    await c.rememberToken(ADMIN_KEY, "tok");
    await c.forgetToken(ADMIN_KEY);
    assert.equal(c.store.has(ADMIN_KEY), false, "the store still holds the token");
    assert.equal(await c.readToken(ADMIN_KEY), null, "memory still holds the token");
  });

  test("J. no request after logout can use the old token", async () => {
    const c = bootCache();
    await c.rememberToken(DRIVER_KEY, "secret-value");
    await c.forgetToken(DRIVER_KEY);
    for (let i = 0; i < 10; i++) {
      assert.equal(await c.readToken(DRIVER_KEY), null,
        "a request after logout was handed the old token");
    }
    // …and it must not come back by falling through to the store either.
    assert.equal(c.counts.get, 0, "a post-logout read went back to the key store");
  });

  test("writes go through the cache, never straight to the store", () => {
    // A direct setToken/removeToken would leave memory holding a value the store
    // no longer has — the one way this cache could serve a stale credential.
    for (const [name, src] of [["driverAuth.ts", DRIVER_AUTH], ["adminAuth.ts", ADMIN_AUTH]]) {
      assert.ok(!/\bsetToken\(/.test(src), `${name} writes a token past the cache`);
      assert.ok(!/\bremoveToken\(/.test(src), `${name} clears a token past the cache`);
    }
  });

  test("the interceptors read through the cache, not the store", () => {
    assert.match(DRIVER_AUTH, /const token = await readToken\(DRIVER_TOKEN_KEY\)/,
      "the driver interceptor reads the key store per request again");
    assert.match(ADMIN_AUTH, /const token = await readToken\(ADMIN_TOKEN_KEY\)/,
      "the admin interceptor reads the key store per request again");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-80 · K. concurrency", () => {
  test("K. ten simultaneous first-requests share one store read", async () => {
    const c = bootCache();
    c.store.set(DRIVER_KEY, "tok");
    const all = await Promise.all(
      Array.from({ length: 10 }, () => c.readToken(DRIVER_KEY)),
    );
    assert.equal(c.counts.get, 1,
      `a cold-start burst caused ${c.counts.get} key-store reads`);
    assert.deepEqual(new Set(all), new Set(["tok"]), "concurrent reads disagreed");
  });

  test("K. a login landing mid-flight is not overwritten by the in-flight read", async () => {
    // The read was started before the write; when it resolves it must not put
    // the pre-login value back.
    const c = bootCache();
    c.store.set(DRIVER_KEY, "old");
    const inFlight = c.readToken(DRIVER_KEY);
    await c.rememberToken(DRIVER_KEY, "new");
    await inFlight;
    assert.equal(await c.readToken(DRIVER_KEY), "new",
      "an in-flight store read resurrected the pre-login token");
  });

  test("K. a logout landing mid-flight is not undone either", async () => {
    const c = bootCache();
    c.store.set(ADMIN_KEY, "tok");
    const inFlight = c.readToken(ADMIN_KEY);
    await c.forgetToken(ADMIN_KEY);
    await inFlight;
    assert.equal(await c.readToken(ADMIN_KEY), null,
      "an in-flight read resurrected a token after logout");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-80 · A–D. the interceptor is installed once, and not on import", () => {
  test("A+D. AuthContext no longer installs at module scope", () => {
    const sf = ts.createSourceFile("AuthContext.tsx", AUTH_CONTEXT,
      ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const topLevelCalls = sf.statements
      .filter(ts.isExpressionStatement)
      .map((s) => s.expression.getText(sf));
    for (const bad of ["installDriverAuthInterceptor()", "installAdminAuthInterceptor()",
                       "installAuthInterceptors()"]) {
      assert.ok(!topLevelCalls.includes(bad),
        `importing AuthContext still patches global.fetch: ${bad}`);
    }
  });

  test("A. installation happens in one place, guarded by one flag", () => {
    assert.match(BOOTSTRAP_SRC, /let installed = false;/);
    assert.match(BOOTSTRAP_SRC, /if \(installed\) return;\s*\n\s*installed = true;/,
      "installAuthInterceptors is no longer idempotent");
    assert.match(BOOTSTRAP_SRC, /installDriverAuthInterceptor\(\);/);
    assert.match(BOOTSTRAP_SRC, /installAdminAuthInterceptor\(\);/);
  });

  test("B+C. the provider calls it, so re-render and re-mount are no-ops", () => {
    assert.match(AUTH_CONTEXT, /installAuthInterceptors\(\);/,
      "nothing installs the interceptors any more");
    const providerAt = AUTH_CONTEXT.indexOf("export function AuthProvider");
    const callAt = AUTH_CONTEXT.indexOf("installAuthInterceptors();");
    assert.ok(callAt > providerAt, "installation is not inside the provider");
    // Idempotence is what makes a second mount harmless; proven above.
  });

  test("B. it is not deferred to an effect", () => {
    // An effect runs after the first render, so a child fetching on mount would
    // send its first request without an Authorization header.
    const at = AUTH_CONTEXT.indexOf("installAuthInterceptors();");
    const before = AUTH_CONTEXT.slice(Math.max(0, at - 400), at);
    assert.ok(!/useEffect\(\s*\(\)\s*=>\s*\{[^}]*$/.test(before),
      "installation moved inside a useEffect — the first request would be unauthenticated");
  });

  test("D. each interceptor still refuses to install itself twice", () => {
    for (const [name, src] of [["driverAuth.ts", DRIVER_AUTH], ["adminAuth.ts", ADMIN_AUTH]]) {
      assert.match(src, /let installed = false;/, `${name} lost its install guard`);
      assert.match(src, /if \(installed\) return;\s*\n\s*installed = true;/,
        `${name} can be installed more than once`);
    }
  });

  test("the fetch chain is not deepened — the original is captured once", () => {
    for (const [name, src] of [["driverAuth.ts", DRIVER_AUTH], ["adminAuth.ts", ADMIN_AUTH]]) {
      const wraps = (src.match(/const orig: typeof fetch = g\.fetch;/g) ?? []).length;
      assert.equal(wraps, 1, `${name} wraps global.fetch ${wraps} times`);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-80 · nothing leaks and nothing else regressed", () => {
  test("no token value is logged anywhere in the new code", () => {
    for (const [name, src] of [["authTokenCache.ts", CACHE_SRC], ["authBootstrap.ts", BOOTSTRAP_SRC]]) {
      for (const m of src.match(/console\.\w+\([^)]*\)/g) ?? []) {
        assert.ok(!/token|value/i.test(m), `${name} logs a credential: ${m}`);
      }
    }
  });

  test("the driver 401 self-heal still exists", () => {
    assert.match(DRIVER_AUTH, /reissueDriverToken/,
      "the self-healing re-issue was lost");
    assert.match(DRIVER_AUTH, /res\.status === 401/);
  });

  test("the admin central 401 teardown still exists", () => {
    assert.match(ADMIN_AUTH, /onUnauthorized\?\.\(\)/,
      "the central admin session teardown was lost");
  });

  test("H-72…H-77 server-side work is untouched", () => {
    assert.match(read("server/firebase.ts"), /walletId: mintDriverWalletId\(\)/);
    assert.match(read("server/otpStore.ts"), /runTransaction/);
    assert.match(read("eas.json"), /"channel": "production"/);
  });
});
