/**
 * M-46 … M-48 — the geocode cache emptied itself instead of evicting.
 *
 *     if (geocodeCache.size >= GEOCODE_CACHE_MAX) geocodeCache.clear(); // simple bound
 *
 * At five thousand entries every single one was dropped, including the four
 * thousand nine hundred and ninety-nine that were being hit. Every address then had
 * to be re-fetched from Google — a paid call each — so the endpoint's cost and
 * latency spiked periodically for no reason other than the bound being implemented
 * as a reset.
 *
 * The second half is quieter. An entry whose TTL has passed was only replaced if
 * that exact coordinate was asked for again; a key never revisited sat there dead,
 * holding a slot until the wholesale clear. The cache filled with expired entries
 * and then threw away the live ones to make room.
 *
 * These tests execute the shipped functions, lifted out of server/routes.ts with the
 * cache injected, so the behaviour asserted is the behaviour deployed.
 *
 * Run:  node --test tests/unit/m46-geocode-cache-eviction.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments } from "./_source.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const ROUTES = stripComments(readFileSync(join(root, "server/routes.ts"), "utf8"));

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

const MAX = 5000;
const TTL = 24 * 60 * 60 * 1000;

/** The real pair of cache functions, over a cache this test owns. */
function buildCache({ max = MAX } = {}) {
  const cache = new Map();
  const js = ts.transpileModule(
    `${liftFunction(ROUTES, "function rememberGeocode(")}\n` +
      `${liftFunction(ROUTES, "function readGeocode(")}`,
    { compilerOptions: { target: ts.ScriptTarget.ES2020 } },
  ).outputText;
  const [rememberGeocode, readGeocode] = new Function(
    "geocodeCache",
    "GEOCODE_CACHE_MAX",
    "GEOCODE_CACHE_TTL_MS",
    `${js}\nreturn [rememberGeocode, readGeocode];`,
  )(cache, max, TTL);
  return { cache, rememberGeocode, readGeocode };
}

const addr = (i) => ({ address: `عنوان ${i}`, resolved: true });

// ─────────────────────────────────────────────────────────────────────────────
describe("M-46 · reading the cache", () => {
  test("a hit returns the stored value", () => {
    const { rememberGeocode, readGeocode } = buildCache();
    rememberGeocode("32.1000,44.2000", addr(1));
    assert.deepEqual(readGeocode("32.1000,44.2000"), addr(1));
  });

  test("a miss returns nothing", () => {
    const { readGeocode } = buildCache();
    assert.equal(readGeocode("0.0000,0.0000"), undefined);
  });

  test("an expired entry is a miss, and does not linger", () => {
    const { cache, rememberGeocode, readGeocode } = buildCache();
    const t0 = Date.now();
    rememberGeocode("a", addr(1), t0);
    assert.equal(readGeocode("a", t0 + TTL - 1), addr(1).address && cache.get("a").value);
    assert.equal(
      readGeocode("a", t0 + TTL + 1),
      undefined,
      "an entry past its TTL was served",
    );
    assert.equal(
      cache.has("a"),
      false,
      "the expired entry is still holding a slot after being read",
    );
  });

  test("reading does not change what is stored", () => {
    const { cache, rememberGeocode, readGeocode } = buildCache();
    rememberGeocode("a", addr(1));
    const before = cache.get("a").expires;
    readGeocode("a");
    assert.equal(cache.size, 1);
    assert.equal(cache.get("a").expires, before, "reading extended the TTL");
    assert.deepEqual(cache.get("a").value, addr(1));
  });
});

describe("M-46 · the bound evicts, it does not reset", () => {
  test("the cache never exceeds its limit", () => {
    const { cache, rememberGeocode } = buildCache({ max: 10 });
    for (let i = 0; i < 500; i++) rememberGeocode(`k${i}`, addr(i));
    assert.ok(cache.size <= 10, `cache grew to ${cache.size}`);
  });

  test("reaching the limit does NOT empty the cache", () => {
    const { cache, rememberGeocode } = buildCache({ max: 10 });
    for (let i = 0; i < 10; i++) rememberGeocode(`k${i}`, addr(i));
    assert.equal(cache.size, 10);

    rememberGeocode("k10", addr(10)); // the entry that used to trigger clear()
    assert.ok(
      cache.size >= 9,
      `the whole cache was dropped to make room for one entry (size ${cache.size})`,
    );
  });

  test("the newest entry survives, the oldest is the one that goes", () => {
    const { cache, rememberGeocode } = buildCache({ max: 5 });
    for (let i = 0; i < 5; i++) rememberGeocode(`k${i}`, addr(i));
    rememberGeocode("k5", addr(5));

    assert.equal(cache.has("k5"), true, "the entry just written was evicted");
    assert.equal(cache.has("k0"), false, "the oldest entry was kept");
    for (const k of ["k1", "k2", "k3", "k4"]) {
      assert.equal(cache.has(k), true, `${k} was thrown away needlessly`);
    }
  });

  test("an entry that keeps being read is kept over one that is not", () => {
    const { cache, rememberGeocode, readGeocode } = buildCache({ max: 3 });
    rememberGeocode("hot", addr(1));
    rememberGeocode("cold", addr(2));
    rememberGeocode("c", addr(3));

    readGeocode("hot"); // used again — must outlive "cold"
    rememberGeocode("d", addr(4));

    assert.equal(cache.has("hot"), true, "a live, repeatedly-read entry was evicted");
    assert.equal(cache.has("cold"), false, "the least recently used entry survived");
  });

  test("expired entries are reclaimed before a live one is evicted", () => {
    const { cache, rememberGeocode } = buildCache({ max: 4 });
    const t0 = Date.now();
    rememberGeocode("old1", addr(1), t0);
    rememberGeocode("old2", addr(2), t0);
    rememberGeocode("live1", addr(3), t0 + TTL + 1000);
    rememberGeocode("live2", addr(4), t0 + TTL + 1000);

    // old1/old2 are past their TTL by now; the newcomer must take THEIR slots.
    rememberGeocode("live3", addr(5), t0 + TTL + 2000);

    assert.equal(cache.has("live1"), true, "a live entry was evicted while dead ones sat there");
    assert.equal(cache.has("live2"), true);
    assert.equal(cache.has("live3"), true);
    assert.equal(cache.has("old1"), false, "an expired entry is still occupying a slot");
  });

  test("a long run of unique coordinates stays bounded and keeps the recent ones", () => {
    const { cache, rememberGeocode } = buildCache({ max: 50 });
    for (let i = 0; i < 20_000; i++) rememberGeocode(`k${i}`, addr(i));
    assert.ok(cache.size <= 50, `unbounded growth: ${cache.size}`);
    assert.equal(cache.has("k19999"), true, "the most recent lookup was not retained");
    assert.equal(cache.has("k19998"), true);
  });

  test("overwriting an existing key does not evict anything", () => {
    const { cache, rememberGeocode } = buildCache({ max: 3 });
    rememberGeocode("a", addr(1));
    rememberGeocode("b", addr(2));
    rememberGeocode("c", addr(3));
    rememberGeocode("a", addr(9));
    assert.equal(cache.size, 3);
    assert.deepEqual(cache.get("a").value, addr(9));
    assert.equal(cache.has("b"), true, "a refresh of an existing key evicted a neighbour");
  });
});

describe("M-46 · the wholesale clear is gone and the contract is unchanged", () => {
  test("nothing empties the geocode cache in one go any more", () => {
    assert.doesNotMatch(
      ROUTES,
      /geocodeCache\.clear\(\)/,
      "the cache still resets itself instead of evicting",
    );
  });

  test("the limit and the TTL are unchanged", () => {
    assert.match(ROUTES, /const GEOCODE_CACHE_MAX = 5000;/);
    assert.match(ROUTES, /const GEOCODE_CACHE_TTL_MS = 24 \* 60 \* 60 \* 1000;/);
  });

  test("the cache key is still the coordinate rounded to four places", () => {
    assert.match(
      ROUTES,
      /const cacheKey = `\$\{lat\.toFixed\(4\)\},\$\{lng\.toFixed\(4\)\}`;/,
      "the rounding changed, which would silently invalidate every stored entry",
    );
  });

  test("the endpoint still answers from the cache before calling Google", () => {
    const at = ROUTES.indexOf('app.get("/api/reverse-geocode"');
    assert.ok(at > 0, "the endpoint moved");
    const body = ROUTES.slice(at, ROUTES.indexOf("app.get(", at + 10));
    assert.ok(
      body.indexOf("readGeocode(") < body.indexOf("fetchJsonWithTimeout"),
      "the cache is consulted after the paid call, which defeats it",
    );
    assert.match(body, /rememberGeocode\(/, "a resolved address is no longer stored");
  });
});
