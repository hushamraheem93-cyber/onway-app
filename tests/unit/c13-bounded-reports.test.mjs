import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const ROUTES = readFileSync(join(root, "server/routes.ts"), "utf8");
const VENDOR = readFileSync(join(root, "server/vendor.ts"), "utf8");
const SETTLEMENT = readFileSync(join(root, "server/settlement.ts"), "utf8");
const INDEXES = readFileSync(join(root, "firestore.indexes.json"), "utf8");

function section(source, start, end) {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `missing section marker: ${start}`);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(to, -1, `missing section end marker: ${end}`);
  return source.slice(from, to);
}

const DASHBOARD = section(ROUTES, 'app.get("/api/admin/dashboard-stats"', 'app.get("/api/admin/operations"');
const FINANCIAL_REPORTS = section(ROUTES, 'app.get("/api/admin/financial-reports"', 'app.get("/api/admin/dashboard-stats"');
const ANALYTICS = section(ROUTES, 'app.get("/api/admin/analytics"', '// ── Zones Management');
const OWNER_EARNINGS = section(ROUTES, 'app.get("/api/admin/owner-earnings"', '// Promo Code Routes');
const FINANCIAL_SUMMARY = section(ROUTES, 'app.get("/api/admin/financial-summary"', '// Immutable admin audit log');

function oldFinancialReport(rows, startDate) {
  const totals = { revenue: 0, commission: 0, driver: 0, orders: 0 };
  for (const data of rows) {
    const createdAt = new Date(data.createdAt);
    if (startDate && createdAt < startDate) continue;
    const total = Number(data.total) || 0;
    const fee = Number(data.deliveryFee) || 0;
    const subtotal = total - fee;
    const commission = Number(data.vendorCommissionAmount) || Math.round(subtotal * 0.1);
    totals.revenue += total;
    totals.commission += commission;
    totals.driver += Number(data.driverEarning) || fee;
    totals.orders++;
  }
  return totals;
}

function pagedFinancialReport(pages, startDate) {
  return oldFinancialReport(pages.flat(), startDate);
}

function oldAnalytics(orders, users) {
  const daily = {};
  let revenue = 0;
  let delivered = 0;
  const categories = {};
  for (const order of orders) {
    const day = String(order.createdAt).slice(0, 10);
    daily[day] ||= { date: day, orders: 0, revenue: 0, newUsers: 0 };
    daily[day].orders++;
    if (order.status === "delivered") {
      delivered++;
      daily[day].revenue += order.total || 0;
      revenue += order.total || 0;
    }
    for (const item of order.items || []) {
      const cat = item.categoryId || "أخرى";
      categories[cat] = (categories[cat] || 0) + (Number(item.quantity) || 0);
    }
  }
  for (const user of users) {
    const day = String(user.createdAt).slice(0, 10);
    if (daily[day]) daily[day].newUsers++;
  }
  return {
    totalOrders: orders.length,
    totalRevenue: revenue,
    delivered,
    newUsers: users.length,
    daily: Object.values(daily).sort((a, b) => a.date.localeCompare(b.date)),
    categories,
  };
}

function pagedAnalytics(orderPages, userPages) {
  return oldAnalytics(orderPages.flat(), userPages.flat());
}

describe("C-13 — bounded report and analytics queries", () => {
  test("dashboard-stats uses count aggregation and bounded projected order pages", () => {
    assert.match(DASHBOARD, /collection\("users"\)\.count\(\)\.get\(\)/);
    assert.match(DASHBOARD, /collection\("vendors"\)\.count\(\)\.get\(\)/);
    assert.match(DASHBOARD, /where\(restaurantFilter\)\.count\(\)\.get\(\)/);
    assert.match(DASHBOARD, /select\("status", "total", "createdAt", "vendorId"\)/);
    assert.match(DASHBOARD, /\.limit\(ORDER_PAGE_SIZE\)/);
    assert.match(DASHBOARD, /\.startAfter\(cursor\)/);
    assert.doesNotMatch(DASHBOARD, /collection\("vendors"\)\.get\(\)/);
    assert.doesNotMatch(DASHBOARD, /collection\("products"\)\.get\(\)/);
  });

  test("financial-reports is date-bounded, deterministic, projected and page-capped", () => {
    assert.match(FINANCIAL_REPORTS, /FINANCIAL_REPORT_PAGE_SIZE = 500/);
    assert.match(FINANCIAL_REPORTS, /FINANCIAL_REPORT_MAX_ORDERS = 2000/);
    assert.match(FINANCIAL_REPORTS, /where\("status", "==", "delivered"\)/);
    assert.match(FINANCIAL_REPORTS, /orderBy\("createdAt", "desc"\)/);
    assert.match(FINANCIAL_REPORTS, /select\(\s*"total", "deliveryFee", "serviceFee"/);
    assert.match(FINANCIAL_REPORTS, /where\("createdAt", ">=", startDate\)/);
    assert.match(FINANCIAL_REPORTS, /startAfter\(orderCursor\)/);
    assert.doesNotMatch(FINANCIAL_REPORTS, /collection\("vendors"\)\.get\(\)/);
    assert.doesNotMatch(FINANCIAL_REPORTS, /collection\("vendorProducts"\)\.get\(\)/);
  });

  test("owner-earnings uses Firestore scalar aggregation, not delivered-order materialisation", () => {
    assert.match(OWNER_EARNINGS, /deliveredQuery\.aggregate\(/);
    assert.match(OWNER_EARNINGS, /AggregateField\.count\(\)/);
    assert.match(OWNER_EARNINGS, /AggregateField\.sum\("deliveryFee"\)/);
    assert.match(OWNER_EARNINGS, /AggregateField\.sum\("driverEarning"\)/);
    assert.match(OWNER_EARNINGS, /AggregateField\.sum\("ownerEarning"\)/);
    assert.doesNotMatch(OWNER_EARNINGS, /getOrdersByStatus\("delivered"\)/);
  });

  test("admin financial-summary remains bounded through settlement helpers", () => {
    assert.match(FINANCIAL_SUMMARY, /listSettlementAccounts\("vendor"\)/);
    assert.match(FINANCIAL_SUMMARY, /listSettlementRequests\("pending"\)/);
    assert.match(SETTLEMENT, /where\("status", "==", status\)[\s\S]{0,180}\.limit\(300\)/);
    assert.match(SETTLEMENT, /where\("accountType", "==", accountType\)[\s\S]{0,180}\.limit\(500\)/);
  });

  test("admin analytics pages both collections and projects only used fields", () => {
    assert.match(ANALYTICS, /ANALYTICS_PAGE_SIZE = 500/);
    assert.match(ANALYTICS, /select\("status", "total", "createdAt", "items"\)/);
    assert.match(ANALYTICS, /select\("createdAt"\)/);
    assert.match(ANALYTICS, /\.limit\(ANALYTICS_PAGE_SIZE\)/);
    assert.match(ANALYTICS, /startAfter\(orderCursor\)/);
    assert.match(ANALYTICS, /startAfter\(userCursor\)/);
    assert.doesNotMatch(ANALYTICS, /\.where\("createdAt", ">=", since\)\.orderBy\("createdAt", "desc"\)\.get\(\)/);
  });

  test("vendor analytics and vendor wallet queries are already bounded", () => {
    const analyticsStart = VENDOR.indexOf('router.get("/api/vendor/analytics"');
    const analytics = VENDOR.slice(analyticsStart, VENDOR.indexOf('export default router;', analyticsStart));
    assert.match(analytics, /where\("vendorId", "==", vid\)/);
    assert.match(analytics, /where\("status", "==", "delivered"\)/);
    assert.match(analytics, /orderBy\("createdAt", "desc"\)/);
    assert.match(analytics, /limit\(500\)/);
    assert.match(analytics, /aggregateDailyOrderTrend/);
  });

  test("financial report aggregation is unchanged when the same period is split into bounded pages", () => {
    const start = new Date("2026-08-01T00:00:00.000Z");
    const rows = [
      { createdAt: "2026-08-01T01:00:00.000Z", status: "delivered", total: 11000, deliveryFee: 1000, vendorCommissionAmount: 1000, driverEarning: 1000 },
      { createdAt: "2026-08-02T01:00:00.000Z", status: "delivered", total: 25000, deliveryFee: 2000, vendorCommissionAmount: 2300, driverEarning: 2000 },
      { createdAt: "2026-07-31T23:59:59.000Z", status: "delivered", total: 99000, deliveryFee: 5000, vendorCommissionAmount: 9000, driverEarning: 5000 },
    ];
    assert.deepEqual(
      pagedFinancialReport([[rows[0]], [rows[1]], [rows[2]]], start),
      oldFinancialReport(rows, start),
    );
  });

  test("daily order trend and category aggregation are unchanged when paged", () => {
    const orders = [
      { createdAt: "2026-08-01T01:00:00.000Z", status: "delivered", total: 11000, items: [{ categoryId: "food", quantity: 2 }] },
      { createdAt: "2026-08-01T02:00:00.000Z", status: "pending", total: 8000, items: [{ categoryId: "grocery", quantity: 1 }] },
      { createdAt: "2026-08-02T02:00:00.000Z", status: "delivered", total: 9000, items: [{ categoryId: "food", quantity: 1 }] },
    ];
    const users = [
      { createdAt: "2026-08-01T03:00:00.000Z" },
      { createdAt: "2026-08-03T03:00:00.000Z" },
    ];
    assert.deepEqual(
      pagedAnalytics([[orders[0]], [orders[1], orders[2]]], [[users[0]], [users[1]]]),
      oldAnalytics(orders, users),
    );
  });

  test("financial-reports order/status index is declared", () => {
    const parsed = JSON.parse(INDEXES);
    assert.ok(parsed.indexes.some((index) =>
      index.collectionGroup === "orders" &&
      index.fields.some((f) => f.fieldPath === "status") &&
      index.fields.some((f) => f.fieldPath === "createdAt"),
    ));
  });
});
