import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("Vendor financial journey mounts statement and settlement history", async () => {
  const source = await read("client/screens/VendorAnalyticsScreen.tsx");
  assert.match(source, /LedgerStatementCard/);
  assert.match(source, /endpoint=\"\/api\/vendor\/statement\"/);
  assert.match(source, /Authorization: `Bearer \$\{vendorToken\}`/);
  assert.match(source, /SettlementHistoryList history=\{settlement\.history\}/);
  assert.match(source, /useSettlement\("vendor"\)/);
});

test("Driver financial journey mounts statement and settlement history", async () => {
  const source = await read("client/screens/DriverEarningsScreen.tsx");
  assert.match(source, /LedgerStatementCard endpoint=\"\/api\/driver\/statement\"/);
  assert.match(source, /SettlementHistoryList history=\{settlement\.history\}/);
  assert.match(source, /useSettlement\("driver"\)/);
  assert.match(source, /SettlementStatusBar/);
});

test("shared financial components retain explicit loading, empty, error and success paths", async () => {
  const ledger = await read("client/components/LedgerStatementCard.tsx");
  const history = await read("client/components/SettlementHistoryList.tsx");
  assert.match(ledger, /loading/);
  assert.match(ledger, /تعذّر تحميل الكشف/);
  assert.match(ledger, /لا توجد حركات مالية بعد/);
  assert.match(ledger, /كشف الحساب البنكي/);
  assert.match(history, /requests\.length === 0/);
  assert.match(history, /سجلّ التسويات/);
  assert.match(history, /completed/);
  assert.match(history, /partially_completed/);
  assert.match(history, /cancelled/);
});

test("settlement hook keeps vendor and driver API contracts and auth model", async () => {
  const source = await read("client/hooks/useSettlement.ts");
  assert.match(source, /\/api\/driver\/settlement/);
  assert.match(source, /\/api\/vendor\/settlement/);
  assert.match(source, /Authorization: `Bearer \$\{vendorToken\}`/);
  assert.match(source, /phoneNumber=\$\{encodeURIComponent\(phoneNumber\)\}/);
  assert.match(source, /\/history/);
  assert.match(source, /\/request/);
});

test("backend financial routes exist and remain wallet-scoped", async () => {
  const vendor = await read("server/vendor.ts");
  const routes = await read("server/routes.ts");
  assert.match(vendor, /\/api\/vendor\/statement/);
  assert.match(vendor, /\/api\/vendor\/settlement\/history/);
  assert.match(vendor, /\/api\/vendor\/settlement\/request/);
  assert.match(vendor, /vendorId/);
  assert.match(routes, /\/api\/driver\/statement/);
  assert.match(routes, /\/api\/driver\/settlement\/history/);
  assert.match(routes, /\/api\/driver\/settlement\/request/);
  assert.match(routes, /driverWalletId/);
});

test("Sprint 3 Driver Performance remains mounted and untouched by Sprint 4 scope", async () => {
  const performance = await read("client/screens/DriverPerformanceScreen.tsx");
  const navigation = await read("client/navigation/DriverTabNavigator.tsx");
  assert.match(performance, /\/api\/driver\/performance/);
  assert.match(navigation, /DriverPerformanceTab/);
  assert.match(navigation, /DriverPerformanceScreen/);
});

test("financial UI does not introduce client-side calculation or new money identifiers", async () => {
  const vendor = await read("client/screens/VendorAnalyticsScreen.tsx");
  const driver = await read("client/screens/DriverEarningsScreen.tsx");
  const combined = `${vendor}\n${driver}`;
  assert.doesNotMatch(combined, /settlementLedger\s*=|walletId\s*=|ledgerId\s*=|accountKey\s*=|accountId\s*=/);
  assert.match(combined, /formatPrice/);
});
