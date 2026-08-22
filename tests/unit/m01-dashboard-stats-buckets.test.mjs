/**
 * M-01 — «إحصاءات اليوم/الأسبوع/الشهر تساوي الإجمالي دائماً».
 *
 * `/api/admin/dashboard-stats` buckets orders with
 *
 *     const created = o.createdAt || "";
 *     if (created >= todayStart) ...        // todayStart is an ISO STRING
 *
 * `createdAt` is a Firestore `Timestamp`, not a string. `>=` between an object and
 * a string coerces the object with `toString()`, which for a Timestamp yields
 * `"Timestamp(seconds=…, nanoseconds=…)"`. Comparing that to `"2026-08-22T…"` is a
 * lexicographic comparison of `"T"` (0x54) against `"2"` (0x32) — so it is true for
 * EVERY order, forever. today === week === month === total, and "today's revenue"
 * is all revenue ever earned. Those are the numbers the dashboard shows and the
 * numbers operational decisions are taken on.
 *
 * That the field really is a Timestamp is not an assumption: the sibling handler
 * twenty lines below, `/api/admin/operations`, reads the same field through
 * `timestampMillis(o.createdAt)` — the shared converter added precisely because
 * these values are Timestamps with legacy ISO/Date rows mixed in. `dashboard-stats`
 * is the one place that was left comparing raw.
 *
 * Nothing here re-implements the endpoint. The real `app.get(...)` call is lifted
 * out of server/routes.ts, transpiled, and executed against a Firestore double
 * whose documents carry faithfully-shaped Timestamp objects.
 *
 * Run:  node --test tests/unit/m01-dashboard-stats-buckets.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments } from "./_source.mjs";
// The shipped converter, imported rather than reimplemented — it is the thing the
// fix is supposed to route through, so the test must exercise the real one.
import { timestampMillis } from "../../server/time.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const read = (p) => readFileSync(join(root, p), "utf8");

const ROUTES = stripComments(read("server/routes.ts"));
const ts = (await import(join(root, "node_modules/typescript/lib/typescript.js")))
  .default;

// ── lifting ──────────────────────────────────────────────────────────────────

/**
 * Slice out a whole `app.get("…", …)` call expression by matching parentheses.
 * Comments are already blanked; only string and template literals can hide a paren.
 */
function liftCall(src, marker) {
  const at = src.indexOf(marker);
  assert.notEqual(at, -1, `moved or renamed: ${JSON.stringify(marker)}`);
  const open = src.indexOf("(", at);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === "\\") { j += 2; continue; }
        if (src[j] === c) break;
        j += 1;
      }
      i = j;
      continue;
    }
    if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return src.slice(at, i + 1);
  }
  throw new Error(`unbalanced parens after ${marker}`);
}

/** The REAL handler, with its two module dependencies injected. */
function buildHandler(source) {
  const js = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText;
  let handler = null;
  const app = { get: (_path, h) => { handler = h; } };
  new Function("app", "getFirestore", "Filter", "timestampMillis", js)(
    app,
    () => FIRESTORE,
    FILTER,
    timestampMillis,
  );
  assert.equal(typeof handler, "function", "the handler was not registered");
  return handler;
}

// ── a Firestore double ───────────────────────────────────────────────────────

/**
 * A stand-in for `Timestamp` that matches the real class where this test depends
 * on it: `toMillis()` for the converter, and `toString()` for the coercion the bug
 * relies on. The real firebase-admin Timestamp prints exactly this shape.
 */
function stamp(ms) {
  const seconds = Math.floor(ms / 1000);
  const nanoseconds = (ms % 1000) * 1e6;
  return {
    toMillis: () => ms,
    toDate: () => new Date(ms),
    toString: () => `Timestamp(seconds=${seconds}, nanoseconds=${nanoseconds})`,
  };
}

const FILTER = {
  or: (...cs) => ({ __or: cs }),
  where: (f, op, v) => ({ f, op, v }),
};

let FIRESTORE = null;

/** Minimal query surface: the chain dashboard-stats actually calls. */
function makeDb({ orders = [], counts = {}, vendors = {} } = {}) {
  const countOf = (name) => counts[name] ?? 0;

  const query = (name, state = {}) => ({
    where: (a) =>
      query(name, {
        ...state,
        // The only `.where()` on a counted collection is drivers-online, and the
        // only Filter.or is the restaurant classification.
        key: typeof a === "object" && a.__or ? "restaurant" : "online",
      }),
    orderBy: () => query(name, state),
    select: () => query(name, state),
    limit: (n) => query(name, { ...state, limit: n }),
    startAfter: (doc) => query(name, { ...state, after: doc.__i }),
    count: () => ({
      get: async () => ({
        data: () => ({
          count: state.key ? countOf(`${name}:${state.key}`) : countOf(name),
        }),
      }),
    }),
    get: async () => {
      const from = state.after == null ? 0 : state.after + 1;
      const slice = orders.slice(from, from + (state.limit ?? orders.length));
      const docs = slice.map((data, k) => ({
        __i: from + k,
        id: `o${from + k}`,
        data: () => data,
      }));
      return { docs, size: docs.length, empty: docs.length === 0 };
    },
  });

  return {
    collection: (name) => ({
      ...query(name),
      doc: (id) => ({ __vendor: id }),
    }),
    getAll: async (...refs) =>
      refs.map((r) => ({
        id: r.__vendor,
        exists: !!vendors[r.__vendor],
        data: () => vendors[r.__vendor] ?? {},
      })),
  };
}

/** Run the real handler and return the JSON body it sends. */
async function run(handler, db) {
  FIRESTORE = db;
  let body = null;
  let status = 200;
  await handler(
    {},
    {
      json: (b) => { body = b; return b; },
      status: (s) => { status = s; return { json: (b) => { body = b; } }; },
    },
  );
  assert.equal(status, 200, `handler failed: ${JSON.stringify(body)}`);
  return body;
}

// ── the scenario ─────────────────────────────────────────────────────────────

const DAY = 86400000;
const now = Date.now();
const midday = (offsetDays) => now - offsetDays * DAY;

/**
 * Three orders placed a few hours ago and two placed sixty days ago. `today`,
 * `week` and `month` must each count only what falls inside them.
 *
 * The three recent ones are placed two hours back rather than "now" so the test
 * does not depend on the wall clock crossing midnight between two statements.
 */
const RECENT_HOURS = 2;
const recentMs = now - RECENT_HOURS * 3600000;
const startOfToday = new Date(
  new Date(now).getFullYear(),
  new Date(now).getMonth(),
  new Date(now).getDate(),
).getTime();
/** Only meaningful when "two hours ago" is still the same calendar day. */
const RECENT_IS_TODAY = recentMs >= startOfToday;

const asStamp = (data) => ({ ...data, createdAt: stamp(data.at) });
const asIso = (data) => ({ ...data, createdAt: new Date(data.at).toISOString() });
const asDate = (data) => ({ ...data, createdAt: new Date(data.at) });

const ROWS = [
  { at: recentMs, status: "delivered", total: 10000, vendorId: "v1" },
  { at: recentMs, status: "delivered", total: 5000, vendorId: "v1" },
  { at: recentMs, status: "pending", total: 3000, vendorId: "v2" },
  { at: midday(60), status: "delivered", total: 90000, vendorId: "v1" },
  { at: midday(60), status: "cancelled", total: 7000, vendorId: "v2" },
];

const COUNTS = {
  users: 12,
  drivers: 4,
  "drivers:online": 2,
  vendors: 3,
  "vendors:restaurant": 1,
  products: 40,
};

const HANDLER_SRC = liftCall(ROUTES, 'app.get("/api/admin/dashboard-stats"');

async function stats(shape) {
  const handler = buildHandler(HANDLER_SRC);
  return run(
    handler,
    makeDb({
      orders: ROWS.map(shape),
      counts: COUNTS,
      vendors: { v1: { name: "متجر أ" }, v2: { name: "متجر ب" } },
    }),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
describe("M-01 · the period buckets must not collapse into the total", () => {
  test("Firestore Timestamp rows: today counts today, not everything", async () => {
    const s = await stats(asStamp);
    assert.equal(s.orders.total, 5, "all five orders must still be counted");
    if (RECENT_IS_TODAY) {
      assert.equal(
        s.orders.today,
        3,
        "today's bucket swallowed the sixty-day-old orders — the Timestamp is " +
          "being compared against an ISO string",
      );
    }
    assert.equal(s.orders.week, 3, "the week bucket swallowed 60-day-old orders");
    assert.equal(s.orders.month, 3, "the month bucket swallowed 60-day-old orders");
  });

  test("Firestore Timestamp rows: today's revenue is today's, not all revenue", async () => {
    const s = await stats(asStamp);
    assert.equal(s.revenue.total, 105000, "lifetime revenue must be unchanged");
    if (RECENT_IS_TODAY) {
      assert.equal(
        s.revenue.today,
        15000,
        "today's revenue included a delivery from sixty days ago",
      );
    }
  });

  test("the collapse is visible as an equality, and must not hold", async () => {
    const s = await stats(asStamp);
    assert.notEqual(
      s.orders.month,
      s.orders.total,
      "month === total is the exact symptom M-01 describes",
    );
  });
});

describe("M-01 · legacy row shapes keep working", () => {
  // The converter exists because these three shapes coexist in the collection.
  test("ISO string rows bucket correctly", async () => {
    const s = await stats(asIso);
    assert.equal(s.orders.total, 5);
    assert.equal(s.orders.week, 3);
    assert.equal(s.orders.month, 3);
  });

  test("Date rows bucket correctly", async () => {
    const s = await stats(asDate);
    assert.equal(s.orders.total, 5);
    assert.equal(s.orders.week, 3);
    assert.equal(s.orders.month, 3);
  });

  test("a row with no createdAt is counted in the total but in no period", async () => {
    const handler = buildHandler(HANDLER_SRC);
    const s = await run(
      handler,
      makeDb({
        orders: [{ status: "pending", total: 1000, vendorId: "v1" }],
        counts: COUNTS,
        vendors: {},
      }),
    );
    assert.equal(s.orders.total, 1);
    assert.equal(s.orders.today, 0, "an undated order must not land in today");
    assert.equal(s.orders.week, 0);
    assert.equal(s.orders.month, 0);
  });
});

describe("M-01 · everything else the endpoint reports is unchanged", () => {
  test("statuses, counts and top vendors are untouched by the bucketing fix", async () => {
    const s = await stats(asStamp);
    assert.equal(s.orders.delivered, 3);
    assert.equal(s.orders.cancelled, 1);
    assert.equal(s.orders.active, 1);
    assert.equal(s.users, 12);
    assert.deepEqual(s.drivers, { total: 4, online: 2 });
    assert.deepEqual(s.vendors, { total: 3, restaurants: 1, stores: 2 });
    assert.equal(s.products, 40);
    assert.deepEqual(s.topVendors, [
      { id: "v1", name: "متجر أ", orders: 3 },
      { id: "v2", name: "متجر ب", orders: 2 },
    ]);
  });
});

describe("M-01 · the sibling handler already does it right", () => {
  test("/api/admin/operations reads createdAt through the shared converter", () => {
    const at = ROUTES.indexOf('app.get("/api/admin/operations"');
    assert.ok(at > 0, "the operations endpoint moved");
    const body = ROUTES.slice(at, at + 3000);
    assert.match(body, /timestampMillis\(o\.createdAt\)/);
  });

  test("dashboard-stats no longer compares a raw createdAt to a string", () => {
    const at = ROUTES.indexOf('app.get("/api/admin/dashboard-stats"');
    const body = ROUTES.slice(at, ROUTES.indexOf('app.get("/api/admin/operations"'));
    assert.doesNotMatch(
      body,
      /const created = o\.createdAt \|\| ""/,
      "the raw string comparison is back",
    );
    assert.match(body, /timestampMillis\(/, "the shared converter is not used");
  });
});
