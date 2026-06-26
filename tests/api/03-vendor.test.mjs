import { api, vendorApi, assertStatus, runSuite, assert, getVendorToken, BASE_URL } from "../utils/helpers.mjs";

const DEMO_VENDOR_PHONE = "07700000001";
const CLEANUP_PRODUCTS = [];

export async function runVendorTests() {
  let vendorToken = null;
  let vendorId = null;
  let createdProductId = null;

  await runSuite("🏪 Vendor — Authentication", [
    ["POST /api/vendor/mobile-auth with demo vendor returns token", async () => {
      const r = await api("POST", "/api/vendor/mobile-auth", { phoneNumber: DEMO_VENDOR_PHONE });
      assertStatus(r, 200, "vendor mobile-auth");
      if (!r.body?.token) throw new Error("No token returned");
      vendorToken = r.body.token;
      vendorId = r.body.vendor?.id;
    }],
    ["POST /api/vendor/mobile-auth with unknown phone returns null token", async () => {
      const r = await api("POST", "/api/vendor/mobile-auth", { phoneNumber: "07799998888" });
      assertStatus(r, 200, "mobile-auth unknown");
      assert(r.body?.token === null, "Token should be null for unknown phone");
    }],
    ["POST /api/vendor/mobile-auth without phone returns 400", async () => {
      const r = await api("POST", "/api/vendor/mobile-auth", {});
      assertStatus(r, 400, "mobile-auth no phone");
    }],
  ]);

  await runSuite("🏪 Vendor — Products", [
    ["GET /api/vendor/products requires auth", async () => {
      const r = await api("GET", "/api/vendor/products");
      if (r.status !== 401 && r.status !== 403) throw new Error(`Expected 401/403, got ${r.status}`);
    }],
    ["GET /api/vendor/products with token returns products list", async () => {
      if (!vendorToken) throw new Error("No vendor token");
      const r = await vendorApi("GET", "/api/vendor/products", undefined, vendorToken);
      assertStatus(r, 200, "vendor products");
      const list = Array.isArray(r.body) ? r.body : r.body?.products;
      if (!Array.isArray(list)) throw new Error(`Expected array, got: ${JSON.stringify(r.body)?.slice(0,100)}`);
    }],
    ["POST /api/vendor/products — multipart/form-data endpoint requires real image upload", async () => {
      if (!vendorToken) throw new Error("No vendor token");
      const formData = new FormData();
      formData.append("name", "[TEST] منتج اختبار تلقائي");
      formData.append("price", "9999");
      formData.append("category", "مشروبات");
      formData.append("description", "وصف تجريبي - يُحذف تلقائياً");
      const pixelPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
      const blob = new Blob([pixelPng], { type: "image/png" });
      formData.append("image", blob, "test.png");
      const res = await fetch(`${BASE_URL}/api/vendor/products`, {
        method: "POST",
        headers: { Authorization: `Bearer ${vendorToken}` },
        body: formData,
      });
      let body = null;
      try { body = await res.json(); } catch {}
      if (res.status !== 200 && res.status !== 201) {
        throw new Error(`Expected 200/201, got ${res.status}: ${JSON.stringify(body)}`);
      }
      createdProductId = body?.id || body?.productId;
      if (createdProductId) CLEANUP_PRODUCTS.push(createdProductId);
    }],
    ["PATCH /api/vendor/products/:id/availability toggles availability", async () => {
      if (!vendorToken || !createdProductId) {
        console.warn("    ⚠ Skipping: no product created in previous step");
        return;
      }
      const r = await vendorApi("PATCH", `/api/vendor/products/${createdProductId}/availability`, {
        inStock: false,
      }, vendorToken);
      if (r.status !== 200 && r.status !== 404) throw new Error(`Unexpected status ${r.status}`);
    }],
    ["PUT /api/vendor/products/:id updates product", async () => {
      if (!vendorToken || !createdProductId) {
        console.warn("    ⚠ Skipping: no product created in previous step");
        return;
      }
      const r = await vendorApi("PUT", `/api/vendor/products/${createdProductId}`, {
        name: "[TEST] منتج اختبار مُعدَّل",
        price: 8888,
        description: "وصف محدّث",
        inStock: true,
        status: "pending",
        category: "مشروبات",
      }, vendorToken);
      if (r.status !== 200 && r.status !== 404) throw new Error(`Unexpected status ${r.status}`);
    }],
  ]);

  await runSuite("🏪 Vendor — Stats & Wallet", [
    ["GET /api/vendor/stats returns stats object", async () => {
      if (!vendorToken) throw new Error("No vendor token");
      const r = await vendorApi("GET", "/api/vendor/stats", undefined, vendorToken);
      assertStatus(r, 200, "vendor stats");
      assert(typeof r.body === "object", "Expected object");
    }],
    ["GET /api/vendor/wallet returns wallet data", async () => {
      if (!vendorToken) throw new Error("No vendor token");
      const r = await vendorApi("GET", "/api/vendor/wallet", undefined, vendorToken);
      if (r.status !== 200 && r.status !== 404) throw new Error(`Unexpected status ${r.status}`);
    }],
    ["GET /api/vendor/orders returns orders list", async () => {
      if (!vendorToken) throw new Error("No vendor token");
      const r = await vendorApi("GET", "/api/vendor/orders", undefined, vendorToken);
      assertStatus(r, 200, "vendor orders");
      const list = Array.isArray(r.body) ? r.body : r.body?.orders;
      if (!Array.isArray(list)) throw new Error(`Expected array, got: ${JSON.stringify(r.body)?.slice(0,100)}`);
    }],
  ]);

  await runSuite("🧹 Vendor — Cleanup", [
    ["DELETE test products", async () => {
      if (!vendorToken) return;
      for (const pid of CLEANUP_PRODUCTS) {
        const r = await vendorApi("DELETE", `/api/vendor/products/${pid}`, undefined, vendorToken);
        if (r.status !== 200 && r.status !== 404) {
          console.warn(`    ⚠ Could not delete product ${pid}: ${r.status}`);
        }
      }
    }],
  ]);
}
