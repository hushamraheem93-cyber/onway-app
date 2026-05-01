#!/usr/bin/env node
/**
 * Onway — Full-cycle integration test
 *
 * Tests the complete 4-party order lifecycle:
 *   Customer → creates order
 *   Vendor   → confirmed → preparing → ready
 *   Admin    → approves driver + assigns driver to order
 *   Driver   → goes online → accepts → starts delivery → completes
 *   Customer → rates vendor
 *
 * Usage:
 *   node tests/integration-test.js [--base-url http://localhost:5000]
 *
 * Env vars (same as server):  ADMIN_USERNAME  ADMIN_PASSWORD
 */

import { createHmac } from "crypto";

// ── Config ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const baseIdx = args.indexOf("--base-url");
const BASE = baseIdx !== -1 ? args[baseIdx + 1] : "http://localhost:5000";

const ADMIN_USER = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASS = process.env.ADMIN_PASSWORD || "";
const ADMIN_COOKIE = (() => {
  const secret = `${ADMIN_USER}:${ADMIN_PASS}`;
  return createHmac("sha256", secret).update("onway_admin").digest("hex");
})();

// Unique per run to avoid collisions
const RUN = Date.now().toString().slice(-6);
const CUSTOMER_PHONE = `07901${RUN}`;
const DRIVER_PHONE   = `07911${RUN}`;
const VENDOR_PHONE   = `07921${RUN}`;

// ── Helpers ─────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
const errors = [];

function log(msg)  { process.stdout.write(`  ${msg}\n`); }
function ok(label) { passed++; log(`\x1b[32m✔\x1b[0m  ${label}`); }
function fail(label, detail) {
  failed++;
  log(`\x1b[31m✘\x1b[0m  ${label}${detail ? `: ${detail}` : ""}`);
  errors.push({ label, detail });
}

async function req(method, path, body, headers = {}) {
  const url = `${BASE}${path}`;
  const opts = { method, headers: { "Content-Type": "application/json", ...headers } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  let data;
  try { data = await r.json(); } catch { data = {}; }
  return { status: r.status, data };
}

const adminH = () => ({ Cookie: `onway_admin_session=${ADMIN_COOKIE}` });
const vendorH = (t) => ({ Authorization: `Bearer ${t}` });
const custH   = (t) => ({ Authorization: `Bearer ${t}` });

async function step(label, fn) {
  try {
    const result = await fn();
    ok(label);
    return result;
  } catch (e) {
    fail(label, e.message || String(e));
    return null;
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n\x1b[1m Onway Integration Test — run ${RUN}\x1b[0m`);
  console.log(` Base URL : ${BASE}`);
  console.log(` Admin    : ${ADMIN_USER}\n`);

  // ── 0. Health ──────────────────────────────────────────────────────────────
  console.log("\x1b[1m[0] Health\x1b[0m");
  const alive = await step("Server is reachable", async () => {
    const { status } = await req("GET", "/api/stores");
    assert(status < 500, `Status ${status}`);
    return true;
  });
  if (!alive) { summary(); return; }

  // ── 1. Admin session ───────────────────────────────────────────────────────
  console.log("\n\x1b[1m[1] Admin session\x1b[0m");
  const adminOk = await step("Admin /api/admin/orders responds 200", async () => {
    const { status } = await req("GET", "/api/admin/orders", null, adminH());
    assert(status === 200, `Got ${status} — check ADMIN_USERNAME / ADMIN_PASSWORD env vars`);
    return true;
  });
  if (adminOk === null) { summary(); return; }

  // ── 2. Vendor registration & approval ─────────────────────────────────────
  console.log("\n\x1b[1m[2] Vendor setup\x1b[0m");

  let vendorId, vendorToken;

  await step("Vendor registers via /api/vendor/register", async () => {
    const { status, data } = await req("POST", "/api/vendor/register", {
      storeName: `متجر اختبار ${RUN}`,
      businessType: "grocery",
      phoneNumber: VENDOR_PHONE,
      password: "test1234",
      ownerName: `صاحب ${RUN}`,
      address: "شارع الاختبار",
    });
    assert(status === 201, `${status} ${JSON.stringify(data)}`);
    vendorId = data.vendor?.id;
    vendorToken = data.token;
    assert(vendorId, "No vendorId in response");
    assert(vendorToken, "No token in response");
    log(`     → vendorId: ${vendorId}`);
  });

  await step("Admin approves vendor partner", async () => {
    assert(vendorId, "No vendorId from previous step");
    const { status, data } = await req("PUT", `/api/admin/vendor-partners/${vendorId}/status`,
      { status: "active", note: "اختبار تلقائي" }, adminH());
    assert(status === 200, `${status} ${JSON.stringify(data)}`);
  });

  // ── 3. Driver setup ────────────────────────────────────────────────────────
  console.log("\n\x1b[1m[3] Driver setup\x1b[0m");
  let driverId;

  await step("Create driver account via /api/drivers", async () => {
    const { status, data } = await req("POST", "/api/drivers", {
      phoneNumber: DRIVER_PHONE,
      fullName: `سائق اختبار ${RUN}`,
      firstName: "سائق",
      nationalIdImage: "/uploads/test-placeholder.webp",
    });
    assert(status === 200 || status === 201, `${status} ${JSON.stringify(data)}`);
    driverId = data.id || data.phoneNumber;
    log(`     → driverId: ${driverId}`);
  });

  await step("Admin approves driver (status: approved)", async () => {
    // Fetch driver list to get id
    const { status: ls, data: ld } = await req("GET", "/api/admin/drivers", null, adminH());
    assert(ls === 200, `List status ${ls}`);
    const drivers = Array.isArray(ld) ? ld : [];
    const driver = drivers.find(d => d.phoneNumber === DRIVER_PHONE);
    assert(driver, `Driver ${DRIVER_PHONE} not found in list`);
    const dId = driver.id || driver.phoneNumber;
    const { status, data } = await req("PUT", `/api/admin/drivers/${dId}/status`,
      { status: "approved" }, adminH());
    assert(status === 200, `${status} ${JSON.stringify(data)}`);
  });

  // ── 4. Customer OTP flow ───────────────────────────────────────────────────
  console.log("\n\x1b[1m[4] Customer auth\x1b[0m");
  let customerToken;

  await step("Send OTP for customer phone", async () => {
    const { status } = await req("POST", "/api/auth/send-otp", { phoneNumber: CUSTOMER_PHONE });
    assert(status === 200, `${status}`);
  });

  await step("Verify OTP — bypass active, any code accepted", async () => {
    const { status, data } = await req("POST", "/api/auth/verify-otp", {
      phoneNumber: CUSTOMER_PHONE,
      code: "0000",  // endpoint uses 'code' field
    });
    assert(status === 200, `${status} ${JSON.stringify(data)}`);
    customerToken = data.customerToken || data.token;
    assert(customerToken, "No customerToken in response");
  });

  // ── 5. Create order ────────────────────────────────────────────────────────
  console.log("\n\x1b[1m[5] Order creation\x1b[0m");
  let orderId;

  await step("Customer creates order", async () => {
    assert(customerToken, "No customer token from previous step");
    const { status, data } = await req("POST", "/api/orders", {
      phoneNumber: CUSTOMER_PHONE,
      customerName: `زبون اختبار ${RUN}`,
      region: "Baghdad",
      address: "حي الاختبار، شارع 17",
      vendorId: vendorId || "test-vendor",
      items: [
        { id: "item1", name: "منتج اختبار", quantity: 2, price: 1500 },
        { id: "item2", name: "منتج ثانٍ",   quantity: 1, price: 3000 },
      ],
      total: 6000,
      deliveryFee: 2000,
      restaurantSubtotal: 6000,
    }, custH(customerToken));
    assert(status === 200 || status === 201, `${status} ${JSON.stringify(data)}`);
    orderId = data.id || data.orderId;
    assert(orderId, "No orderId in response");
    log(`     → orderId: ${orderId}`);
  });
  if (!orderId) { summary(); return; }

  // ── 6. Vendor order lifecycle ──────────────────────────────────────────────
  console.log("\n\x1b[1m[6] Vendor order lifecycle (pending→confirmed→preparing→ready)\x1b[0m");

  for (const targetStatus of ["confirmed", "preparing", "ready"]) {
    await step(`Vendor → ${targetStatus}`, async () => {
      assert(vendorToken, "No vendor token");
      const body = { status: targetStatus };
      if (targetStatus === "confirmed") Object.assign(body, { estimatedMinutes: 20 });
      const { status: s, data } = await req("PATCH", `/api/vendor/orders/${orderId}/status`,
        body, vendorH(vendorToken));
      assert(s === 200, `${s} ${JSON.stringify(data)}`);
    });
  }

  // ── 7. Driver assignment ───────────────────────────────────────────────────
  console.log("\n\x1b[1m[7] Driver assignment\x1b[0m");

  await step("Driver goes online", async () => {
    const { status, data } = await req("POST", "/api/driver/toggle-online",
      { phoneNumber: DRIVER_PHONE, isOnline: true });
    assert(status === 200, `${status} ${JSON.stringify(data)}`);
  });

  await step("Admin assigns driver to order", async () => {
    const { status, data } = await req("POST", `/api/admin/orders/${orderId}/assign-driver`,
      { driverPhone: DRIVER_PHONE }, adminH());
    assert(status === 200, `${status} ${JSON.stringify(data)}`);
  });

  // ── 8. Driver delivery flow ────────────────────────────────────────────────
  console.log("\n\x1b[1m[8] Driver delivery\x1b[0m");

  await step("Driver accepts order", async () => {
    const { status, data } = await req("POST", "/api/driver/accept-order",
      { phoneNumber: DRIVER_PHONE, orderId });
    assert(status === 200, `${status} ${JSON.stringify(data)}`);
  });

  await step("Driver starts delivery (→ in_delivery)", async () => {
    const { status, data } = await req("POST", "/api/driver/start-delivery",
      { phoneNumber: DRIVER_PHONE, orderId });
    assert(status === 200, `${status} ${JSON.stringify(data)}`);
  });

  await step("Driver completes order (→ delivered)", async () => {
    const { status, data } = await req("POST", "/api/driver/complete-order",
      { phoneNumber: DRIVER_PHONE, orderId });
    assert(status === 200, `${status} ${JSON.stringify(data)}`);
  });

  // ── 9. Verify final status via admin orders list ───────────────────────────
  console.log("\n\x1b[1m[9] Order verification\x1b[0m");

  await step("Admin orders list contains order with status 'delivered'", async () => {
    const { status, data } = await req("GET", "/api/admin/orders", null, adminH());
    assert(status === 200, `${status}`);
    const allOrders = Array.isArray(data) ? data : (data.orders || []);
    const order = allOrders.find(o => o.id === orderId);
    assert(order, `Order ${orderId} not found`);
    assert(order.status === "delivered", `Expected delivered, got ${order.status}`);
    log(`     → status: ${order.status} ✓`);
  });

  await step("Customer orders list shows delivered order", async () => {
    const { status, data } = await req("GET", `/api/orders?phoneNumber=${CUSTOMER_PHONE}`);
    assert(status === 200, `${status}`);
    const orders = Array.isArray(data) ? data : [];
    const order = orders.find(o => o.id === orderId);
    assert(order, `Order not found in customer list`);
    assert(order.status === "delivered", `Status ${order.status}`);
  });

  // ── 10. Customer rates vendor ──────────────────────────────────────────────
  console.log("\n\x1b[1m[10] Customer rating\x1b[0m");

  await step("Customer submits vendor rating (5 stars)", async () => {
    assert(customerToken, "No customer token");
    const { status, data } = await req("POST", `/api/orders/${orderId}/rate`,
      { rating: 5, comment: "ممتاز — اختبار تلقائي" }, custH(customerToken));
    assert(status === 200, `${status} ${JSON.stringify(data)}`);
  });

  await step("Duplicate rating returns 409 Conflict", async () => {
    const { status } = await req("POST", `/api/orders/${orderId}/rate`,
      { rating: 3 }, custH(customerToken));
    assert(status === 409, `Expected 409, got ${status}`);
  });

  // ── 11. Vendor orders list ─────────────────────────────────────────────────
  console.log("\n\x1b[1m[11] Vendor orders list\x1b[0m");

  await step("Vendor orders list includes our delivered order", async () => {
    const { status, data } = await req("GET", "/api/vendor/orders",
      null, vendorH(vendorToken));
    assert(status === 200, `${status}`);
    const orders = data.orders || data;
    assert(Array.isArray(orders), "Response not an array");
    const found = orders.find(o => o.id === orderId);
    assert(found, `Order ${orderId} not in vendor list`);
    assert(found.status === "delivered", `Status: ${found.status}`);
  });

  // ── 12. Image deduplication ────────────────────────────────────────────────
  console.log("\n\x1b[1m[12] Image deduplication (content hash)\x1b[0m");

  await step("Upload same image twice returns same URL (content-hash dedup)", async () => {
    // Minimal valid 1×1 white RGBA PNG — well-known bytes, deterministic
    const PNG_HEX =
      "89504e470d0a1a0a"   // PNG signature
    + "0000000d49484452"   // IHDR chunk (13 bytes)
    + "00000001"           // width=1
    + "00000001"           // height=1
    + "08020000"           // 8-bit, color type 2 (RGB), no interlace
    + "0090771800"         // CRC (pre-computed)
    + "0000000c"           // IDAT chunk (12 bytes)
    + "49444154"           // "IDAT"
    + "08d76360f8ff"       // zlib header + compressed white pixel
    + "000000020001"       // zlib adler32
    + "e221bc33"           // IDAT CRC
    + "0000000049454e44"   // IEND chunk (0 bytes)
    + "ae426082";          // IEND CRC

    // Use a simple 4-byte repeating pattern as the "image" — not a real PNG.
    // We only need the server to save identical bytes both times; the
    // application/octet-stream mimetype is in the upload allow-list.
    const imgBytes = Buffer.from(PNG_HEX.replace(/\s/g, ""), "hex");
    const boundary = `----Boundary${RUN}`;
    const header = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="image"; filename="deduptest.webp"\r\n` +
      `Content-Type: image/webp\r\n\r\n`
    );
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([header, imgBytes, footer]);

    async function upload() {
      const r = await fetch(`${BASE}/api/admin/upload-image`, {
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          Cookie: `onway_admin_session=${ADMIN_COOKIE}`,
        },
        body,
      });
      return r.json();
    }

    const first  = await upload();
    assert(first.url, `First upload failed: ${JSON.stringify(first)}`);

    const second = await upload();
    assert(second.url, `Second upload failed: ${JSON.stringify(second)}`);

    assert(first.url === second.url,
      `Dedup failed — 1st: ${first.url} / 2nd: ${second.url}`);
    log(`     → deduped URL: ${first.url}${second.deduped ? " (deduped=true)" : ""}`);
  });

  // ── Done ───────────────────────────────────────────────────────────────────
  summary();
}

function summary() {
  const total = passed + failed;
  const color = failed === 0 ? "\x1b[32m" : "\x1b[31m";
  console.log(`\n${"─".repeat(52)}`);
  console.log(`\x1b[1m Results: ${color}${passed}/${total} passed\x1b[0m`);
  if (errors.length > 0) {
    console.log("\nFailed steps:");
    errors.forEach(e => console.log(`  • ${e.label}: ${e.detail || ""}`));
  }
  console.log();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error("\nUnhandled error:", e);
  process.exit(1);
});
