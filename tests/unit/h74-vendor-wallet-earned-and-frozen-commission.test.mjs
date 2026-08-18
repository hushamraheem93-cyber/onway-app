/**
 * H-74 — "the store's wallet counts undelivered orders as revenue, uses a
 * `delivering` status that does not exist in the schema, and re-prices historical
 * sales at the CURRENT commission — so past profits move when the rate changes."
 *
 * Three defects, one endpoint: GET /api/vendor/wallet in server/vendor.ts.
 * Every other vendor money path was checked and already filters `delivered`
 * (/api/vendor/stats, /api/vendor/analytics, /api/admin/financial-reports) or
 * reads the ledger (/api/vendor/statement).
 *
 * These tests EXECUTE the shipped handler. It is lifted out of vendor.ts by
 * matching the router registration, transpiled, and run against an in-memory
 * Firestore double. No emulator, no credentials, no production data. Every phone
 * number is synthetic.
 *
 * The money rule being pinned:
 *
 *   EARNED   = delivered only, the same rule the settlement engine accrues on.
 *   IN-FLIGHT= picked_up / in_delivery, reported but never counted as earned.
 *   PRICE    = frozen per order — settlement record first, then the order's own
 *              snapshot, and the current rate only for an order carrying neither.
 *
 * Run:  node --test tests/unit/h74-vendor-wallet-earned-and-frozen-commission.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const read = (p) => readFileSync(join(root, p), "utf8");

const VENDOR = read("server/vendor.ts");
const FIREBASE = read("server/firebase.ts");

// ─── lifting the handler ─────────────────────────────────────────────────────

/** The async callback registered for a given router path. */
function liftHandler(src, routePath) {
  const sf = ts.createSourceFile("vendor.ts", src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let found = null;
  const walk = (n) => {
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === "get" &&
      n.arguments[0] &&
      ts.isStringLiteral(n.arguments[0]) &&
      n.arguments[0].text === routePath
    ) {
      const fn = n.arguments[n.arguments.length - 1];
      if (fn && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) found = fn.getText(sf);
    }
    ts.forEachChild(n, walk);
  };
  walk(sf);
  assert.ok(found, `could not lift the handler for ${routePath}`);
  return found;
}

const HANDLER_SRC = liftHandler(VENDOR, "/api/vendor/wallet");

/** commissionPercentOf, lifted so the test uses the project's real default. */
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
const ORDER_VALIDATION = read("server/orderValidation.ts");
const DEFAULT_COMMISSION_PERCENT = Number(
  (ORDER_VALIDATION.match(/DEFAULT_COMMISSION_PERCENT\s*=\s*(\d+(?:\.\d+)?)/) ?? [])[1],
);

function runHandler(db, { vendorId, period = "all" }) {
  const decls = [
    liftFn(ORDER_VALIDATION, "commissionPercentOf"),
    `const DEFAULT_COMMISSION_PERCENT = ${DEFAULT_COMMISSION_PERCENT};`,
    `const handler = ${HANDLER_SRC};`,
    "return handler;",
  ].join("\n");
  const js = ts.transpileModule(decls, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const deps = {
    getFirestore: () => db,
    settlementId: (orderId, type) => `${orderId}__${type}`,
    console: { error() {}, warn() {}, log() {} },
  };
  const handler = new Function(...Object.keys(deps), js)(...Object.values(deps));

  const req = { query: { period }, vendorId };
  return new Promise((resolve, reject) => {
    const res = {
      json: (body) => resolve({ status: 200, body }),
      status: (code) => ({ json: (body) => resolve({ status: code, body }) }),
    };
    handler(req, res).catch(reject);
  });
}

// ─── Firestore double ────────────────────────────────────────────────────────

function makeDb({ orders = {}, vendorProducts = {}, vendors = {}, settlements = {} } = {}) {
  const cols = { orders, vendorProducts, vendors, settlements };
  const asDocs = (col, pred = () => true) =>
    Object.entries(cols[col] ?? {})
      .filter(([, v]) => pred(v))
      .map(([id, v]) => ({ id, data: () => v, exists: true }));

  const collection = (name) => {
    const q = (pred) => ({
      where: (f, op, val) =>
        q((v) => pred(v) && (op === "array-contains" ? (v[f] ?? []).includes(val) : v[f] === val)),
      orderBy: () => q(pred),
      limit: () => q(pred),
      get: async () => ({ docs: asDocs(name, pred), empty: asDocs(name, pred).length === 0 }),
    });
    return {
      ...q(() => true),
      doc: (id) => ({
        get: async () => {
          const v = cols[name]?.[id];
          return { exists: v !== undefined, id, data: () => v };
        },
      }),
    };
  };
  return { collection };
}

// ─── fixtures ────────────────────────────────────────────────────────────────

const VID = "vnd_test";
const CUSTOMER = "07700000061"; // synthetic

const order = (id, status, subtotal, extra = {}) => ({
  [id]: {
    status,
    vendorId: VID,
    vendorIds: [VID],
    phoneNumber: CUSTOMER,
    createdAt: new Date("2026-03-01T10:00:00Z"),
    items: [{ productId: "p1", price: subtotal, quantity: 1 }],
    ...extra,
  },
});

const PRODUCTS = { p1: { vendorId: VID } };
const vendorAt = (pct) => ({ [VID]: { storeName: "STORE", commissionPercent: pct } });

// ═════════════════════════════════════════════════════════════════════════════
describe("H-74 · A+C. only delivered orders are earned revenue", () => {
  test("A. a pending order contributes nothing", async () => {
    const db = makeDb({
      orders: { ...order("o1", "pending", 10000) },
      vendorProducts: PRODUCTS,
      vendors: vendorAt(10),
    });
    const { body } = await runHandler(db, { vendorId: VID });
    assert.equal(body.totalRevenue, 0, "a pending order was counted as revenue");
    assert.equal(body.totalOrders, 0);
  });

  for (const status of ["pending", "confirmed", "preparing", "ready", "cancelled", "issue"]) {
    test(`a ${status} order is neither earned nor in-flight`, async () => {
      const db = makeDb({
        orders: { ...order("o1", status, 10000) },
        vendorProducts: PRODUCTS,
        vendors: vendorAt(10),
      });
      const { body } = await runHandler(db, { vendorId: VID });
      assert.equal(body.totalRevenue, 0, `${status} counted as earned`);
      assert.equal(body.inFlightRevenue, 0, `${status} counted as in-flight`);
    });
  }

  for (const status of ["picked_up", "in_delivery"]) {
    test(`a ${status} order is reported in-flight, not earned`, async () => {
      const db = makeDb({
        orders: { ...order("o1", status, 10000) },
        vendorProducts: PRODUCTS,
        vendors: vendorAt(10),
      });
      const { body } = await runHandler(db, { vendorId: VID });
      assert.equal(body.totalRevenue, 0,
        `${status} is still counted as money the store has earned`);
      assert.equal(body.inFlightRevenue, 10000, `${status} vanished from the vendor's view`);
      assert.equal(body.inFlightOrders, 1);
      // C-2's complaint was that in-flight orders DISAPPEARED. They must not.
      assert.equal(body.recentSales.length, 1);
      assert.equal(body.recentSales[0].earned, false);
    });
  }

  test("C. a delivered order is counted exactly once", async () => {
    const db = makeDb({
      orders: { ...order("o1", "delivered", 10000) },
      vendorProducts: PRODUCTS,
      vendors: vendorAt(10),
    });
    const { body } = await runHandler(db, { vendorId: VID });
    assert.equal(body.totalRevenue, 10000);
    assert.equal(body.totalOrders, 1);
    assert.equal(body.recentSales.length, 1, "the order was listed more than once");
    // The order matches BOTH the vendorIds and vendorId queries; the union must dedupe.
    assert.equal(body.dailySales.reduce((s, d) => s + d.revenue, 0), 10000);
  });

  test("the daily chart and the total agree", async () => {
    const db = makeDb({
      orders: {
        ...order("o1", "delivered", 10000),
        ...order("o2", "in_delivery", 7000),
        ...order("o3", "pending", 5000),
      },
      vendorProducts: PRODUCTS,
      vendors: vendorAt(10),
    });
    const { body } = await runHandler(db, { vendorId: VID });
    assert.equal(body.totalRevenue, 10000);
    assert.equal(body.dailySales.reduce((s, d) => s + d.revenue, 0), 10000,
      "the chart includes orders the total does not");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-74 · B. `delivering` is not a status and is never treated as one", () => {
  test("it is absent from the order-status schema", () => {
    const schema = FIREBASE.match(/status: "pending" \| [^;]+;/)?.[0] ?? "";
    assert.ok(schema.length > 0, "the order status union could not be found");
    assert.ok(!schema.includes('"delivering"'),
      "`delivering` was added to the schema — this test's premise changed");
    assert.ok(schema.includes('"in_delivery"'), "the canonical in-flight status is gone");
  });

  test("no money path in vendor.ts treats it as a status value", () => {
    // Comments legitimately explain the old bug, so read string LITERALS only.
    const sf = ts.createSourceFile("vendor.ts", VENDOR, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const hits = [];
    const walk = (n) => {
      if (ts.isStringLiteral(n) && n.text === "delivering") hits.push(n.getText(sf));
      ts.forEachChild(n, walk);
    };
    walk(sf);
    assert.deepEqual(hits, [], "`delivering` is being used as a value again");
  });

  test("an order carrying it is ignored, not silently earned", async () => {
    const db = makeDb({
      orders: { ...order("o1", "delivering", 10000) },
      vendorProducts: PRODUCTS,
      vendors: vendorAt(10),
    });
    const { body } = await runHandler(db, { vendorId: VID });
    assert.equal(body.totalRevenue, 0, "a bogus status was counted as earned revenue");
    assert.equal(body.inFlightRevenue, 0);
  });

  test("the statuses that do count are exactly the schema's", async () => {
    const schema = FIREBASE.match(/status: "pending" \| [^;]+;/)[0];
    for (const s of ["delivered", "picked_up", "in_delivery"]) {
      assert.ok(schema.includes(`"${s}"`), `${s} is used for money but is not in the schema`);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-74 · D+E+F+G. the past is priced when it happened", () => {
  /** An order delivered long ago, settled at 10%. */
  const settledAt10 = {
    orders: { ...order("old", "delivered", 100000) },
    vendorProducts: PRODUCTS,
    settlements: {
      "old__vendor": {
        accountType: "vendor", accountId: VID, orderId: "old",
        grossAmount: 100000, commission: 10000,
      },
    },
  };

  test("D. an order settled at 10% stays 10% after the rate becomes 15%", async () => {
    const before = await runHandler(makeDb({ ...settledAt10, vendors: vendorAt(10) }), { vendorId: VID });
    const after = await runHandler(makeDb({ ...settledAt10, vendors: vendorAt(15) }), { vendorId: VID });

    assert.equal(before.body.recentSales[0].commissionRate, 10);
    assert.equal(after.body.recentSales[0].commissionRate, 10,
      "raising the current rate re-priced an order that was already settled");
    assert.equal(after.body.recentSales[0].commissionAmount, 10000);
    assert.equal(after.body.recentSales[0].netEarning, 90000,
      "the store's past profit changed when the setting changed");
    assert.equal(after.body.recentSales[0].rateSource, "settlement");
  });

  test("D. lowering the rate does not inflate the past either", async () => {
    const after = await runHandler(makeDb({ ...settledAt10, vendors: vendorAt(5) }), { vendorId: VID });
    assert.equal(after.body.recentSales[0].commissionRate, 10);
    assert.equal(after.body.recentSales[0].netEarning, 90000);
  });

  test("E. an order's own snapshot is honoured when there is no settlement yet", async () => {
    const db = makeDb({
      orders: { ...order("o1", "delivered", 100000, { vendorCommissionPercent: 10 }) },
      vendorProducts: PRODUCTS,
      vendors: vendorAt(15),
    });
    const { body } = await runHandler(db, { vendorId: VID });
    assert.equal(body.recentSales[0].commissionRate, 10, "the order's frozen rate was ignored");
    assert.equal(body.recentSales[0].rateSource, "order");
    assert.equal(body.recentSales[0].netEarning, 90000);
  });

  test("E. a frozen AMOUNT alone is enough to price the line", async () => {
    const db = makeDb({
      orders: { ...order("o1", "delivered", 100000, { vendorCommissionAmount: 12000 }) },
      vendorProducts: PRODUCTS,
      vendors: vendorAt(15),
    });
    const { body } = await runHandler(db, { vendorId: VID });
    assert.equal(body.recentSales[0].commissionAmount, 12000);
    assert.equal(body.recentSales[0].commissionRate, 12);
    assert.equal(body.recentSales[0].rateSource, "order");
  });

  test("F. an order with no snapshot uses the current rate, and says so", async () => {
    const db = makeDb({
      orders: { ...order("new", "delivered", 100000) },
      vendorProducts: PRODUCTS,
      vendors: vendorAt(15),
    });
    const { body } = await runHandler(db, { vendorId: VID });
    assert.equal(body.recentSales[0].commissionRate, 15,
      "a fresh order should be priced at the store's current rate");
    assert.equal(body.recentSales[0].rateSource, "current",
      "a recomputed figure must not be reported as frozen");
    assert.equal(body.recentSales[0].netEarning, 85000);
  });

  test("F+D. old and new orders sit side by side at their own rates", async () => {
    const db = makeDb({
      orders: {
        ...order("old", "delivered", 100000),
        ...order("new", "delivered", 100000, { createdAt: new Date("2026-06-01T10:00:00Z") }),
      },
      vendorProducts: PRODUCTS,
      vendors: vendorAt(15),
      settlements: {
        "old__vendor": { accountType: "vendor", accountId: VID, orderId: "old", grossAmount: 100000, commission: 10000 },
      },
    });
    const { body } = await runHandler(db, { vendorId: VID });
    const byId = Object.fromEntries(body.recentSales.map((s) => [s.id, s]));
    assert.equal(byId.old.commissionRate, 10, "the historical order was re-priced");
    assert.equal(byId.new.commissionRate, 15, "the new order did not get the new rate");
  });

  test("G. recomputing is stable — same inputs, same numbers, every time", async () => {
    const build = () => makeDb({ ...settledAt10, vendors: vendorAt(15) });
    const runs = [];
    for (let i = 0; i < 4; i++) runs.push((await runHandler(build(), { vendorId: VID })).body);
    for (const r of runs) {
      assert.deepEqual(
        r.recentSales.map((s) => [s.id, s.commissionRate, s.commissionAmount, s.netEarning]),
        runs[0].recentSales.map((s) => [s.id, s.commissionRate, s.commissionAmount, s.netEarning]),
      );
    }
  });

  test("another store's settlement never prices this store's line", async () => {
    const db = makeDb({
      orders: { ...order("o1", "delivered", 100000) },
      vendorProducts: PRODUCTS,
      vendors: vendorAt(15),
      settlements: {
        // Same order, different vendor — a multi-store order.
        "o1__vendor": { accountType: "vendor", accountId: "vnd_someone_else", orderId: "o1", grossAmount: 100000, commission: 40000 },
      },
    });
    const { body } = await runHandler(db, { vendorId: VID });
    assert.notEqual(body.recentSales[0].commissionAmount, 40000,
      "this store was billed using another store's settlement");
    assert.equal(body.recentSales[0].rateSource, "current");
  });

  test("the internal frozen fields do not leak into the response", async () => {
    const db = makeDb({
      orders: { ...order("o1", "delivered", 100000, { vendorCommissionPercent: 10 }) },
      vendorProducts: PRODUCTS,
      vendors: vendorAt(15),
    });
    const { body } = await runHandler(db, { vendorId: VID });
    assert.equal(body.recentSales[0].frozenPercent, undefined);
    assert.equal(body.recentSales[0].frozenAmount, undefined);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-74 · H. no money path re-prices history from the current setting", () => {
  const walletSrc = HANDLER_SRC;

  test("the wallet's per-sale price is not the current rate", () => {
    // The old line was: netEarning: Math.round(o.subtotal * (1 - commissionRate / 100))
    assert.doesNotMatch(
      walletSrc,
      /netEarning:\s*Math\.round\(o\.subtotal \* \(1 - commissionRate \/ 100\)\)/,
      "every recent sale is priced at the store's current rate again",
    );
    assert.match(walletSrc, /rateSource/, "the wallet no longer reports where a rate came from");
    assert.match(walletSrc, /settlementId\(o\.id, "vendor"\)/,
      "the wallet stopped reading the frozen settlement commission");
  });

  test("the settlement engine still prefers the frozen amount", () => {
    const ROUTES = read("server/routes.ts");
    assert.match(
      ROUTES,
      /\(order as any\)\.vendorCommissionAmount \?\?\s*\n?\s*Math\.round\(\(orderValue \* commissionPercentOf/,
      "the accrual stopped preferring the order's frozen commission",
    );
  });

  test("order creation still freezes the rate for new orders", () => {
    const ROUTES = read("server/routes.ts");
    assert.match(ROUTES, /orderData\.vendorCommissionPercent = vendorRate;/);
    assert.match(ROUTES, /orderData\.vendorCommissionAmount = Math\.round\(restaurantSubtotal \* \(vendorRate \/ 100\)\);/);
  });

  test("the other vendor money endpoints still count delivered only", () => {
    // /api/vendor/stats and /api/vendor/analytics were already correct; this
    // keeps them that way rather than leaving the rule true in one place only.
    assert.match(VENDOR, /if \(status === "delivered"\) totalRevenue \+= subtotal;/,
      "/api/vendor/stats stopped restricting revenue to delivered orders");
    assert.match(VENDOR, /\.where\("status", "==", "delivered"\)/,
      "/api/vendor/analytics stopped restricting to delivered orders");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-74 · the H-72 financial identity is untouched", () => {
  test("the vendor account is still the document id, never a phone", () => {
    assert.match(VENDOR, /createSettlementRequest\("vendor", vid, storeName\)/);
    assert.match(VENDOR, /getAccountStatement\("vendor", \(req as any\)\.vendorId\)/);
  });

  test("the wallet builds no account id and touches no ledger", () => {
    for (const forbidden of ["ledgerId(", "accountKey(", "settlementLedger", "walletId"]) {
      assert.ok(!HANDLER_SRC.includes(forbidden),
        `the wallet endpoint reaches into ${forbidden} — it is a read-only view`);
    }
  });

  test("it reads the settlements collection, and writes nothing", () => {
    assert.match(HANDLER_SRC, /collection\("settlements"\)\.doc\(/);
    for (const write of [".set(", ".update(", ".delete(", ".add("]) {
      assert.ok(!HANDLER_SRC.includes(write), `the wallet endpoint performs a write: ${write}`);
    }
  });
});
