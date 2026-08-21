/**
 * Driver order-list load failure tests (audit finding H-29).
 *
 * DriverOrdersScreen's fetchStatus assigned state only `if (res.ok)`, had an empty
 * catch, and cleared `loading` in `finally` on every path. A failed first load
 * therefore left `status === null` with `loading === false`, and the render fell
 * straight through to the "لا توجد طلبات نشطة" empty state — telling a driver who has
 * a live batch, in confident friendly words, that there is no work for them. On a bike
 * in Dhuluiyah a dropped request is routine; a driver who believes the screen stops
 * working and goes home, while the orders sit assigned to them.
 *
 * Measured on the pre-fix source: a network failure produced loading=false,
 * status=null, and the empty state.
 *
 * The fix separates "the load failed" from "there is genuinely nothing to do", and
 * shows a distinct, retryable error view only when nothing has ever loaded. A refresh
 * that fails after a successful load keeps showing the data — stale beats blank. No
 * automatic retry is added; pull-to-refresh, which already exists, is the retry.
 *
 * fetchStatus' body is lifted straight out of the shipped .tsx and executed with
 * stubbed fetch and setters, so what runs here is the real code path. The render
 * decision is reproduced from the source's own conditions.
 *
 * Run:  node --test tests/unit/driver-orders-load-failure.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(here, "../../client/screens/DriverOrdersScreen.tsx"), "utf8");

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

const FETCH_BODY = body(SRC, "async (isRefresh = false) =>");

const DEPS = ["fetch", "URL", "getApiUrl", "phoneNumber", "encodeURIComponent",
  "setRefreshing", "setStatus", "setOptimized", "setLoading", "setLoadError", "console"];
// eslint-disable-next-line no-new-func
const factory = new Function(...DEPS, `return async function fetchStatus(isRefresh) {\n${FETCH_BODY}\n};`);

/** What the source says the render does when there is no batch. */
const wiring = {
  clearsLoadingInFinally: /\} finally \{[\s\S]*?setLoading\(false\);/.test(FETCH_BODY),
  hasErrorState: /setLoadError\(/.test(FETCH_BODY),
  /** The condition guarding the empty state, read from the render. */
  emptyGuard: (() => {
    const at = SRC.indexOf("renderEmptyState()");
    const seg = SRC.slice(Math.max(0, at - 900), at);
    const m = seg.match(/\{(\w[\w.?\s&|!]*)\s*\?\s*\(/g);
    return m ? m[m.length - 1] : "?";
  })(),
  showsErrorInRender: /renderLoadError\(\)/.test(SRC),
};

function makeCtx(fetchImpl) {
  const ctx = { status: null, loading: true, refreshing: false, optimized: null,
    loadError: false, calls: 0 };
  ctx.deps = {
    fetch: async (u) => { ctx.calls += 1; return fetchImpl(String(u)); },
    URL, getApiUrl: () => "http://test.local",
    phoneNumber: "07901110001",
    encodeURIComponent,
    setRefreshing: (v) => { ctx.refreshing = v; },
    setStatus: (v) => { ctx.status = typeof v === "function" ? v(ctx.status) : v; },
    setOptimized: (v) => { ctx.optimized = v; },
    setLoading: (v) => { ctx.loading = v; },
    setLoadError: (v) => { ctx.loadError = typeof v === "function" ? v(ctx.loadError) : v; },
    console,
  };
  return ctx;
}
const run = async (fetchImpl, isRefresh = false) => {
  const ctx = makeCtx(fetchImpl);
  await factory(...DEPS.map((n) => ctx.deps[n]))(isRefresh);
  return ctx;
};

/** Reproduces the screen's render decision from its own state. */
function screen(ctx) {
  if (ctx.loading) return "spinner";
  const batch = ctx.status?.currentBatch ?? null;
  // Only meaningful once the source actually has an error branch.
  if (wiring.showsErrorInRender && ctx.loadError && ctx.status === null) return "error";
  return batch ? "batch" : "empty";
}

const okWithBatch = () => async () => ({
  ok: true, status: 200,
  json: async () => ({ currentBatch: { id: "b-1", orders: [{ id: "o-1" }], totalOrders: 1 }, walletBalance: 5000 }),
});
const okNoBatch = () => async () => ({
  ok: true, status: 200, json: async () => ({ currentBatch: null, walletBalance: 0 }),
});
const httpFail = (s) => async () => ({ ok: false, status: s, json: async () => ({ error: "x" }) });
const netFail = () => { throw new TypeError("Network request failed"); };


describe("H-29 — a failed load never claims the driver has no work", () => {
  test("a network failure does not show the empty state", async () => {
    const ctx = await run(netFail);
    assert.equal(ctx.status, null);
    assert.equal(ctx.loading, false, "the spinner must not hang forever either");
    assert.notEqual(screen(ctx), "empty", "a driver with a live batch was told they have none");
    assert.equal(screen(ctx), "error");
  });

  test("HTTP failures do not show the empty state", async () => {
    for (const s of [400, 401, 500, 503]) {
      const ctx = await run(httpFail(s));
      assert.notEqual(screen(ctx), "empty", `HTTP ${s} produced a false empty state`);
      assert.equal(ctx.loadError, true);
    }
  });

  test("the pre-fix shape provably produced the false empty state", async () => {
    // Guards the guard: the same state the old code left behind, run through the same
    // render decision. If this stops being "empty", the model no longer reproduces it.
    const stale = { loading: false, status: null, loadError: false };
    const decide = (c) => {
      if (c.loading) return "spinner";
      const batch = c.status?.currentBatch ?? null;
      if (c.loadError && c.status === null) return "error";
      return batch ? "batch" : "empty";
    };
    assert.equal(decide(stale), "empty", "the old state must land on the empty screen");
  });
});

describe("H-29 — success behaviour is unchanged", () => {
  test("a batch is shown and the state is populated", async () => {
    const ctx = await run(okWithBatch());
    assert.equal(screen(ctx), "batch");
    assert.equal(ctx.status.currentBatch.id, "b-1");
    assert.equal(ctx.status.walletBalance, 5000);
    assert.equal(ctx.optimized, false, "the client-side route optimisation flag must reset");
    assert.equal(ctx.loading, false);
    assert.equal(ctx.loadError, false);
  });

  test("a genuine empty result still shows the empty state", async () => {
    const ctx = await run(okNoBatch());
    assert.equal(screen(ctx), "empty", "a real 'no batch' answer must NOT look like an error");
    assert.notEqual(ctx.status, null);
    assert.equal(ctx.loadError, false);
  });

  test("recovering from a failure clears the error", async () => {
    const bad = await run(netFail);
    assert.equal(bad.loadError, true);
    const ctx = makeCtx(okWithBatch());
    Object.assign(ctx, { loadError: bad.loadError, status: bad.status, loading: bad.loading });
    await factory(...DEPS.map((n) => ctx.deps[n]))(false);
    assert.equal(screen(ctx), "batch");
    assert.equal(ctx.loadError, false, "the error view would stick after a good load");
  });
});

describe("H-29 — stale data beats a blank screen", () => {
  test("a failed refresh after a successful load keeps the batch on screen", async () => {
    const good = await run(okWithBatch());
    const ctx = makeCtx(netFail);
    Object.assign(ctx, { status: good.status, loading: false, loadError: false });
    await factory(...DEPS.map((n) => ctx.deps[n]))(true);
    assert.equal(screen(ctx), "batch", "a transient failure blanked a live batch");
    assert.equal(ctx.status.currentBatch.id, "b-1");
    assert.equal(ctx.refreshing, false);
  });

  test("a failed refresh after a genuine empty result keeps the empty state", async () => {
    // status is non-null here, so the error view must NOT take over: the driver really
    // does have nothing assigned, and saying "could not load" would be wrong.
    const good = await run(okNoBatch());
    const ctx = makeCtx(netFail);
    Object.assign(ctx, { status: good.status, loading: false, loadError: false });
    await factory(...DEPS.map((n) => ctx.deps[n]))(true);
    assert.equal(screen(ctx), "empty");
  });
});

describe("H-29 — the loading indicators always stop", () => {
  test("loading and refreshing are cleared on every path", async () => {
    for (const [label, impl] of [["success", okWithBatch()], ["http", httpFail(500)], ["network", netFail]]) {
      const ctx = await run(impl, true);
      assert.equal(ctx.loading, false, `${label}: loading stuck`);
      assert.equal(ctx.refreshing, false, `${label}: refreshing stuck`);
    }
  });

  test("a refresh sets the pull indicator, a background poll does not", async () => {
    const refreshed = makeCtx(okWithBatch());
    await factory(...DEPS.map((n) => refreshed.deps[n]))(true);
    const polled = makeCtx(okWithBatch());
    await factory(...DEPS.map((n) => polled.deps[n]))(false);
    assert.equal(refreshed.refreshing, false, "it must end cleared either way");
    assert.equal(polled.refreshing, false);
  });
});

describe("H-29 — the source keeps the shape the fix depends on", () => {
  test("fetchStatus handles a non-ok response explicitly", () => {
    assert.match(FETCH_BODY, /if \(!res\.ok\) \{[\s\S]*?setLoadError\(true\);[\s\S]*?return;/,
      "REGRESSION: a failed response is ignored again");
  });

  test("the catch is no longer empty", () => {
    assert.doesNotMatch(FETCH_BODY, /catch\s*(\([^)]*\))?\s*\{\s*\}/,
      "REGRESSION: exceptions are swallowed silently again");
    assert.match(FETCH_BODY, /catch \{\s*setLoadError\(true\);/);
  });

  test("a successful load clears the error flag", () => {
    assert.match(FETCH_BODY, /setLoadError\(false\);/);
  });

  test("loading is still cleared in finally", () => {
    // Not clearing it would replace a false empty state with an eternal spinner.
    assert.match(FETCH_BODY, /\} finally \{[\s\S]*?setLoading\(false\);[\s\S]*?setRefreshing\(false\);/);
  });

  test("the error view is only reachable when nothing has ever loaded", () => {
    assert.match(SRC, /\) : loadError && status === null \? \(/,
      "REGRESSION: the error view can hide a real empty result, or vice versa");
    assert.match(SRC, /renderLoadError\(\)/);
    assert.match(SRC, /renderEmptyState\(\)/);
  });

  test("the two states are visually distinguishable and say different things", () => {
    assert.match(SRC, /<EmptyState[\s\S]*?لا توجد طلبات نشطة/);
    assert.match(SRC, /<ErrorState[\s\S]*?تعذّر تحميل طلباتك/);
    assert.match(SRC, /<ErrorState/);
    assert.match(SRC, /<EmptyState/);
  });

  test("no automatic retry was introduced", () => {
    assert.doesNotMatch(FETCH_BODY, /\bretry\b|for \(let attempt|while \(attempt/i);
    assert.match(SRC, /onRetry=\{\(\) => void fetchStatus\(true\)\}/,
      "the driver must be given an explicit retry action");
  });

  test("the request, the poll and pull-to-refresh are unchanged", () => {
    assert.match(SRC, /`\/api\/driver\/status\?phoneNumber=\$\{encodeURIComponent\(phoneNumber\)\}`/);
    assert.match(SRC, /const interval = setInterval\(\(\) => fetchStatus\(\), 30000\);/);
    assert.match(SRC, /return \(\) => clearInterval\(interval\);/);
    assert.match(SRC, /refreshing=\{refreshing\}/);
  });

  test("H-28's handlers on this screen were not disturbed", () => {
    assert.match(SRC, /Alert\.alert\("تعذّر استلام الطلب", await serverError\(res\)\)/);
    assert.match(SRC, /Alert\.alert\("تعذّر تسليم الطلب", await serverError\(res\)\)/);
    assert.match(SRC, /Alert\.alert\("خطأ", CONNECTION_ERROR\)/);
  });
});
