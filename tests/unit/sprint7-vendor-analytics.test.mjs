import fs from "node:fs";
import test from "node:test";

const assert = await import("node:assert/strict");
const root = new URL("../..", import.meta.url).pathname;
const screen = fs.readFileSync(`${root}/client/screens/VendorAnalyticsScreen.tsx`, "utf8");
const vendor = fs.readFileSync(`${root}/server/vendor.ts`, "utf8");
const packageJson = JSON.parse(fs.readFileSync(`${root}/package.json`, "utf8"));
const analyticsStart = vendor.indexOf('router.get("/api/vendor/analytics"');
const analyticsEnd = vendor.indexOf("export default router", analyticsStart);
const analyticsRoute = vendor.slice(analyticsStart, analyticsEnd);
const performanceStart = screen.indexOf("{/* Performance */}");
const performanceEnd = screen.indexOf("{/* Recent sales */}", performanceStart);
const performanceBlock = screen.slice(performanceStart, performanceEnd);

test("Vendor analytics metrics come from existing backend contracts", () => {
  assert.ok(analyticsStart >= 0);
  assert.match(analyticsRoute, /requireVendor/);
  assert.match(analyticsRoute, /const vid = \(req as any\)\.vendorId/);
  assert.match(analyticsRoute, /where\("vendorId", "==", vid\)/);
  assert.match(analyticsRoute, /status", "==", "delivered/);
  assert.match(analyticsRoute, /bestSellers/);
  assert.match(screen, /queryKey: \["\/api\/vendor\/analytics", vendorId, period\]/);
  assert.match(screen, /Authorization: `Bearer \$\{vendorToken\}`/);
});

test("Best Products uses the backend ranking and shows a real empty state", () => {
  assert.match(analyticsRoute, /productCount/);
  assert.match(analyticsRoute, /item\.quantity/);
  assert.match(analyticsRoute, /sort\(\(a, b\) => b\.count - a\.count\)/);
  assert.match(analyticsRoute, /slice\(0, 5\)/);
  assert.match(screen, /analytics\?\.bestSellers \?\? \[\]/);
  assert.match(screen, /لا توجد منتجات مباعة بعد/);
  assert.match(screen, /أفضل المنتجات — آخر 7 أيام/);
});

test("Average Order Value uses the existing earned-order definition", () => {
  const walletStart = vendor.indexOf('router.get("/api/vendor/wallet"');
  const walletEnd = vendor.indexOf("// ── Vendor Analytics", walletStart);
  const walletRoute = vendor.slice(walletStart, walletEnd);
  assert.match(walletRoute, /const totalRevenue = earnedOrders\.reduce/);
  assert.match(walletRoute, /const totalOrders = earnedOrders\.length/);
  assert.match(walletRoute, /const avgOrderValue = totalOrders > 0 \? totalRevenue \/ totalOrders : 0/);
  assert.match(screen, /avgOrderValue/);
  assert.match(screen, /متوسط الطلب/);
});

test("Revenue trend is rendered from backend dailySales without fabricated series", () => {
  assert.match(screen, /const dailySales = data\?\.dailySales \?\? \[\]/);
  assert.match(screen, /<BarChart data=\{dailySales\} \/>/);
  assert.match(screen, /المبيعات اليومية — من بيانات الطلبات المكتملة/);
  assert.match(screen, /لا توجد مبيعات مكتملة ضمن الفترة المختارة/);
  assert.doesNotMatch(performanceBlock, /forecast|prediction|توقع|تنبؤ/i);
});

test("Orders trend is aggregated by Backend and mapped to the existing chart", () => {
  assert.match(analyticsRoute, /dailyOrders/);
  assert.match(analyticsRoute, /aggregateDailyOrderTrend/);
  assert.match(analyticsRoute, /period/);
  assert.match(screen, /url\.searchParams\.set\("period", period\)/);
  assert.match(screen, /const dailyOrders = analytics\?\.dailyOrders \?\? \[\]/);
  assert.match(screen, /<BarChart data=\{dailyOrders\} valueKey="orders" \/>/);
  assert.doesNotMatch(screen, /لم يتم اختراع رسم أو أرقام بديلة/);
});

test("Sprint 5 UI states are reused for Analytics loading, error, retry and empty", () => {
  assert.match(screen, /import \{ EmptyState \} from "@\/components\/EmptyState"/);
  assert.match(screen, /import \{ ErrorState, LoadingState \} from "@\/components\/ScreenState"/);
  assert.match(screen, /LoadingState label="جاري تحميل أفضل المنتجات/);
  assert.match(screen, /ErrorState/);
  assert.match(screen, /refetchAnalytics/);
  assert.match(screen, /EmptyState/);
});

test("Vendor analytics remains isolated and read-only", () => {
  assert.doesNotMatch(analyticsRoute, /req\.query\.vendorId|req\.body\.vendorId/);
  assert.doesNotMatch(analyticsRoute, /\.set\(|\.update\(|\.delete\(|\.add\(/);
  assert.match(analyticsRoute, /const vid = \(req as any\)\.vendorId/);
  assert.match(screen, /Authorization: `Bearer \$\{vendorToken\}`/);
});

test("RTL and lightweight chart implementation remain compatible with the project", () => {
  assert.match(screen, /flexDirection: "row-reverse"/);
  assert.match(screen, /FontFamily\.cairoBold/);
  assert.match(screen, /AppColors\.primary/);
  assert.equal(packageJson.dependencies["react-native-svg"], "15.12.1");
  assert.doesNotMatch(JSON.stringify(packageJson.dependencies), /victory|recharts|skia/i);
});

test("Sprint 7 does not touch protected financial identifiers or write paths", () => {
  assert.doesNotMatch(performanceBlock, /walletId|ledgerId|accountId|accountKey|settlementLedger|commission|pricing|deliveryFee/i);
  assert.doesNotMatch(analyticsRoute, /walletId|ledgerId|accountId|accountKey|settlementLedger/);
  assert.match(screen, /LedgerStatementCard/);
  assert.match(screen, /SettlementHistoryList/);
});
