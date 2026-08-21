import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { aggregateDailyOrderTrend, startOfVendorAnalyticsPeriod } from "../../server/vendorAnalytics.ts";

const root = join(import.meta.dirname, "../..");
const read = (file) => readFileSync(join(root, file), "utf8");
const now = new Date("2026-08-21T12:00:00.000Z");

describe("Sprint 7 · Daily Orders Trend", () => {
  test("1. aggregates delivered orders by real calendar day", () => {
    const result = aggregateDailyOrderTrend([
      { status: "delivered", createdAt: "2026-08-21T08:00:00.000Z" },
      { status: "delivered", createdAt: "2026-08-21T09:00:00.000Z" },
      { status: "delivered", createdAt: "2026-08-20T09:00:00.000Z" },
      { status: "cancelled", createdAt: "2026-08-21T10:00:00.000Z" },
    ], "week", now);

    assert.deepEqual(result, [
      { date: "2026-08-20", orders: 1 },
      { date: "2026-08-21", orders: 2 },
    ]);
  });

  test("2. applies the same period semantics as Vendor Wallet", () => {
    assert.equal(startOfVendorAnalyticsPeriod("today", now).toISOString(), "2026-08-21T00:00:00.000Z");
    assert.equal(startOfVendorAnalyticsPeriod("week", now).toISOString(), "2026-08-14T12:00:00.000Z");
    assert.equal(startOfVendorAnalyticsPeriod("month", now).toISOString(), "2026-08-01T00:00:00.000Z");
    assert.equal(startOfVendorAnalyticsPeriod("all", now), null);

    const result = aggregateDailyOrderTrend([
      { status: "delivered", createdAt: "2026-08-14T11:59:59.000Z" },
      { status: "delivered", createdAt: "2026-08-14T12:00:00.000Z" },
    ], "week", now);
    assert.deepEqual(result, [{ date: "2026-08-14", orders: 1 }]);
  });

  test("3. keeps vendor isolation in the authenticated Backend route", () => {
    const source = read("server/vendor.ts");
    const start = source.indexOf('router.get("/api/vendor/analytics"');
    const end = source.indexOf("export default router", start);
    const route = source.slice(start, end);

    assert.match(route, /requireVendor/);
    assert.match(route, /const vid = \(req as any\)\.vendorId/);
    assert.match(route, /where\("vendorId", "==", vid\)/);
    assert.doesNotMatch(route, /req\.query\.vendorId|req\.body\.vendorId/);
  });

  test("4. returns an explainable empty series instead of fabricated points", () => {
    assert.deepEqual(aggregateDailyOrderTrend([], "week", now), []);
    assert.deepEqual(aggregateDailyOrderTrend([
      { status: "cancelled", createdAt: "2026-08-21T08:00:00.000Z" },
      { status: "delivered", createdAt: "not-a-date" },
    ], "week", now), []);
  });

  test("5. exposes dailyOrders and the selected period through the existing API contract", () => {
    const backend = read("server/vendor.ts");
    const client = read("client/screens/VendorAnalyticsScreen.tsx");
    assert.match(backend, /dailyOrders/);
    assert.match(backend, /period/);
    assert.match(client, /url\.searchParams\.set\("period", period\)/);
    assert.match(client, /dailyOrders/);
  });

  test("6. maps the real series to the existing chart without finance fields", () => {
    const client = read("client/screens/VendorAnalyticsScreen.tsx");
    const helper = read("server/vendorAnalytics.ts");
    assert.match(client, /<BarChart data=\{dailyOrders\} valueKey="orders" \/>/);
    assert.match(client, /الطلبات اليومية/);
    assert.doesNotMatch(helper, /revenue|subtotal|commission|wallet|ledger|settlement|pricing/i);
  });
});
