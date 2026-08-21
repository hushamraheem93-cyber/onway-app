import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("../..", import.meta.url).pathname;
const adminHtml = fs.readFileSync(`${root}/server/templates/admin.html`, "utf8");
const routes = fs.readFileSync(`${root}/server/routes.ts`, "utf8");
const serverIndex = fs.readFileSync(`${root}/server/index.ts`, "utf8");
const adminAuthorization = fs.readFileSync(`${root}/server/adminAuthorization.ts`, "utf8");
const mapScriptStart = adminHtml.indexOf("function isValidMapLocation");
const mapScriptEnd = adminHtml.indexOf("function closeTrackingModal");
const mapScript = adminHtml.slice(mapScriptStart, mapScriptEnd);
const financeFiles = [
  "server/financialLedger.ts",
  "server/settlement.ts",
  "server/walletIdentity.ts",
].map((file) => ({ file, source: fs.readFileSync(`${root}/${file}`, "utf8") }));

test("Live Operations Map uses the existing Admin Web surface and provider", () => {
  assert.match(adminHtml, /id="dashboard-section"/);
  assert.match(adminHtml, /id="gps-map"/);
  assert.match(adminHtml, /خريطة العمليات الحية/);
  assert.match(adminHtml, /leaflet@1\.9\.4/);
  assert.match(adminHtml, /tile\.openstreetmap\.org/);
});

test("map consumes the existing driver locations and active batches APIs", () => {
  assert.match(adminHtml, /fetch\(API_BASE \+ '\/admin\/driver-locations'\)/);
  assert.match(adminHtml, /fetch\(API_BASE \+ '\/admin\/active-batches'\)/);
  assert.match(adminHtml, /Promise\.all\(\[/);
  assert.match(routes, /app\.get\("\/api\/admin\/driver-locations"/);
  assert.match(routes, /app\.get\("\/api\/admin\/active-batches"/);
});

test("marker details join locations to active batches without inventing an API", () => {
  assert.match(adminHtml, /loc\.currentBatchId/);
  assert.match(adminHtml, /batchesById/);
  assert.match(adminHtml, /batch\.orders/);
  assert.match(adminHtml, /o\.status/);
  assert.match(adminHtml, /loc\.updatedAt/);
  assert.doesNotMatch(mapScript, /loc\.currentOrderId/);
});

test("invalid coordinates are excluded and zero-zero is never a fallback", () => {
  assert.match(adminHtml, /function isValidMapLocation\(loc\)/);
  assert.match(adminHtml, /Number\.isFinite\(lat\)/);
  assert.match(adminHtml, /Number\.isFinite\(lng\)/);
  assert.match(adminHtml, /lat === 0 && lng === 0/);
  assert.match(adminHtml, /\.filter\(isValidMapLocation\)/);
});

test("the map uses only existing driver statuses and backend stale boundary", () => {
  assert.match(routes, /status: queuedDriver\?\.currentBatchId \? "busy" : "available"/);
  assert.match(routes, /now - loc\.updatedAt > 5 \* 60 \* 1000/);
  assert.match(adminHtml, /loc\.status === 'busy'/);
  assert.match(adminHtml, /مشغول/);
  assert.match(adminHtml, /متاح/);
  assert.match(adminHtml, /getTimeAgo\(Number\(loc\.updatedAt\)\)/);
});

test("loading, empty and error states are explicit", () => {
  assert.match(adminHtml, /id="map-loading-state"/);
  assert.match(adminHtml, /id="map-error-state"/);
  assert.match(adminHtml, /id="map-no-drivers"/);
  assert.match(adminHtml, /جاري تحميل مواقع السائقين والدفعات/);
  assert.match(adminHtml, /لا يوجد سائقون لديهم موقع صالح/);
  assert.match(adminHtml, /تعذّر تحميل مواقع السائقين أو الدفعات/);
  assert.match(adminHtml, /refreshDriverLocations\(true\)/);
});

test("polling updates markers in place and is cleaned when leaving Dashboard", () => {
  assert.match(adminHtml, /let _gpsRefreshInterval = null/);
  assert.match(adminHtml, /_gpsRefreshInterval = setInterval\(refreshDriverLocations, 15000\)/);
  assert.match(adminHtml, /function stopDashboardMapPolling\(\)/);
  assert.match(adminHtml, /clearInterval\(_gpsRefreshInterval\)/);
  assert.match(adminHtml, /if \(section === 'dashboard'\) startDashboardMapPolling\(\)/);
  assert.match(adminHtml, /else stopDashboardMapPolling\(\)/);
  assert.match(adminHtml, /setPopupContent\(popupHtml\)/);
  assert.doesNotMatch(adminHtml, /Start GPS polling when on dashboard[\s\S]*setInterval\(\(\) =>/);
});

test("Admin boundary protects both map data APIs", () => {
  assert.match(adminAuthorization, /driver-\(locations\|queue\|stats\|activity\)/);
  assert.match(adminAuthorization, /path === "\/active-batches"/);
  assert.match(adminHtml, /API_BASE \+ '\/admin\/driver-locations'/);
  assert.match(adminHtml, /API_BASE \+ '\/admin\/active-batches'/);
  assert.match(serverIndex, /app\.use\("\/api\/admin", createAdminBoundary\(isValidSession\)\)/);
});

test("no Sprint 6 map code references financial or driver-navigation logic", () => {
  const mapBlock = adminHtml.slice(adminHtml.indexOf("// ========== GPS Map"), adminHtml.indexOf("// ---- Tracking Modal ----"));
  assert.doesNotMatch(mapBlock, /wallet|ledger|settlement|pricing|commission|turn-by-turn/i);
  assert.doesNotMatch(mapBlock, /\/api\/driver\//);
  for (const { file, source } of financeFiles) {
    assert.ok(source.length > 0, `${file} should remain present`);
  }
});

test("existing batch endpoint exposes only actual batch/order fields used by the map", () => {
  assert.match(routes, /return \{ batchId: b\.id, driverPhone: b\.driverId, driverName, status: b\.status, orderCount: bos\.length, orders: bos \}/);
  assert.match(routes, /status: o\.status/);
  assert.match(routes, /deliverySequence: o\.deliverySequence/);
});
