import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildDriverPerformance } from "../../server/driverPerformance.ts";

test("Driver Performance calculates the required metrics from server-owned data", () => {
  const result = buildDriverPerformance({
    activities: [
      { type: "accepted" },
      { type: "accepted" },
      { type: "rejected" },
    ],
    completedOrders: [
      { orderId: "completed-1", completedAt: "2026-08-21T10:30:00.000Z" },
    ],
    orders: [
      {
        id: "completed-1",
        status: "delivered",
        pickedUpAt: "2026-08-21T10:00:00.000Z",
        deliveredAt: "2026-08-21T10:30:00.000Z",
      },
      { id: "cancelled-1", status: "cancelled" },
    ],
    driver: { rating: 4.5, ratingCount: 2 },
  });

  assert.equal(result.acceptanceRate, 66.7);
  assert.equal(result.acceptedOffers, 2);
  assert.equal(result.rejectedOffers, 1);
  assert.equal(result.deliveryTimeMinutes, 30);
  assert.equal(result.deliveryTimeSampleSize, 1);
  assert.equal(result.rating, 4.5);
  assert.equal(result.ratingCount, 2);
  assert.equal(result.completedOrders, 1);
  assert.equal(result.cancelledOrders, 1);
});

test("unavailable metrics are explicit and never replaced with guessed values", () => {
  const result = buildDriverPerformance({
    activities: [],
    completedOrders: [],
    orders: [],
    driver: { rating: null, ratingCount: 0 },
  });

  assert.equal(result.acceptanceRate, null);
  assert.equal(result.deliveryTimeMinutes, null);
  assert.equal(result.rating, null);
  assert.equal(result.completedOrders, 0);
  assert.equal(result.cancelledOrders, 0);
  assert.equal(result.hasData, false);
  assert.deepEqual(result.availability, {
    acceptanceRate: false,
    deliveryTime: false,
    rating: false,
    completedVsCancelled: false,
  });
});

test("driver performance route is scoped to signed driverPhone and not display name", async () => {
  const source = await readFile(new URL("../../server/routes.ts", import.meta.url), "utf8");
  assert.match(source, /app\.get\("\/api\/driver\/performance"/);
  assert.match(source, /const phoneNumber = \(req as any\)\.driverPhone as string/);
  assert.match(source, /getDriverPerformanceOrders\(phoneNumber\)/);
  assert.doesNotMatch(source, /getDriverPerformanceOrders\(phoneNumber, driver\?\.fullName\)/);
  const firebase = await readFile(new URL("../../server/firebase.ts", import.meta.url), "utf8");
  const helperStart = firebase.indexOf("export async function getDriverPerformanceOrders");
  const helperEnd = firebase.indexOf("export async function createOrder", helperStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart);
  const helper = firebase.slice(helperStart, helperEnd);
  assert.match(helper, /where\("driverPhone", "==", driverPhone\)/);
  assert.doesNotMatch(helper, /where\("driverName"/);
});

test("Performance navigation is a driver tab and the screen has required states", async () => {
  const nav = await readFile(new URL("../../client/navigation/DriverTabNavigator.tsx", import.meta.url), "utf8");
  const screen = await readFile(new URL("../../client/screens/DriverPerformanceScreen.tsx", import.meta.url), "utf8");
  assert.match(nav, /DriverPerformanceTab/);
  assert.match(nav, /DriverPerformanceScreen/);
  assert.match(screen, /جاري تحميل الأداء/);
  assert.match(screen, /لا توجد بيانات أداء كافية حتى الآن/);
  assert.match(screen, /إعادة المحاولة/);
  assert.match(screen, /نسبة القبول/);
  assert.match(screen, /زمن التوصيل/);
  assert.match(screen, /التقييم/);
  assert.match(screen, /الطلبات المكتملة/);
  assert.match(screen, /ملغاة/);
});

test("delivery time falls back to recorded delivery logs when order timestamps are absent", () => {
  const result = buildDriverPerformance({
    activities: [],
    completedOrders: [{ orderId: "completed-logs", completedAt: "2026-08-21T11:20:00.000Z" }],
    orders: [{ id: "completed-logs", status: "delivered" }],
    deliveryLogs: [
      { orderId: "completed-logs", action: "in_delivery", createdAt: "2026-08-21T11:00:00.000Z" },
      { orderId: "completed-logs", action: "delivered", createdAt: "2026-08-21T11:20:00.000Z" },
    ],
  });

  assert.equal(result.deliveryTimeMinutes, 20);
  assert.equal(result.deliveryTimeSampleSize, 1);
});

test("Performance UI stays outside Finance and settlement surfaces", async () => {
  const screen = await readFile(new URL("../../client/screens/DriverPerformanceScreen.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(screen, /wallet|ledger|settlement|commission|driverEarning|amountOwed/i);
});
