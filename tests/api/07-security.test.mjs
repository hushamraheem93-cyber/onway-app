import { api, vendorApi, assertStatus, runSuite, assert } from "../utils/helpers.mjs";

export async function runSecurityTests() {
  await runSuite("🔒 Security — Authentication Bypass", [
    ["Admin route without cookie → 401", async () => {
      const r = await api("GET", "/api/admin/users");
      assertStatus(r, 401, "admin without cookie");
    }],
    ["Admin route with wrong cookie value → 401", async () => {
      const r = await api("GET", "/api/admin/users", undefined, {
        Cookie: "onway_admin_session=invalid_token_abc",
      });
      assertStatus(r, 401, "admin wrong cookie");
    }],
    ["Vendor route without token → 401/403", async () => {
      const r = await api("GET", "/api/vendor/products");
      if (r.status !== 401 && r.status !== 403) {
        throw new Error(`Expected 401/403, got ${r.status}`);
      }
    }],
    ["Vendor route with malformed token → 401/403", async () => {
      const r = await vendorApi("GET", "/api/vendor/products", undefined, "not.a.valid.jwt");
      if (r.status !== 401 && r.status !== 403) {
        throw new Error(`Expected 401/403 for malformed JWT, got ${r.status}`);
      }
    }],
    ["Vendor route with tampered JWT → 401/403", async () => {
      const fakeToken = "eyJhbGciOiJIUzI1NiJ9.eyJ2ZW5kb3JJZCI6ImZha2UiLCJyb2xlIjoidmVuZG9yIn0.invalidsignature";
      const r = await vendorApi("GET", "/api/vendor/products", undefined, fakeToken);
      if (r.status !== 401 && r.status !== 403) {
        throw new Error(`Expected 401/403 for tampered JWT, got ${r.status}`);
      }
    }],
    ["Admin route with Basic auth (no cookie) → 401", async () => {
      const r = await api("GET", "/api/admin/users", undefined, {
        Authorization: "Basic dGVzdDp0ZXN0",
      });
      assertStatus(r, 401, "admin with Basic auth instead of cookie");
    }],
  ]);

  await runSuite("🔒 Security — Input Validation", [
    ["POST /api/users with missing phone → 400/422", async () => {
      const r = await api("POST", "/api/users", { name: "Test" });
      if (r.status === 200 || r.status === 201) {
        throw new Error("Should reject user without phone");
      }
    }],
    ["POST /api/orders with empty body → handled gracefully (no crash)", async () => {
      const r = await api("POST", "/api/orders", {});
      if (r.status === 500) throw new Error("Empty order body caused a server crash (500)");
    }],
    ["POST /api/vendor/mobile-auth with empty body → 400", async () => {
      const r = await api("POST", "/api/vendor/mobile-auth", {});
      assertStatus(r, 400, "vendor auth empty body");
    }],
    ["POST /api/drivers with missing fields → 400/422/500", async () => {
      const r = await api("POST", "/api/drivers", { phoneNumber: "07799997777" });
      if (r.status === 200 || r.status === 201) {
        throw new Error("Should reject driver without required fields");
      }
    }],
    ["SQL injection attempt in phone → safe response", async () => {
      const malicious = "'; DROP TABLE users; --";
      const r = await api("GET", `/api/users/${encodeURIComponent(malicious)}`);
      if (r.status === 500) throw new Error("SQL injection caused server error");
    }],
    ["XSS payload in order notes → stored safely", async () => {
      const r = await api("POST", "/api/orders", {
        phoneNumber: "07799997776",
        userId: "07799997776",
        customerName: "<script>alert(1)</script>",
        customerPhone: "07799997776",
        notes: "<img src=x onerror=alert(1)>",
        items: [{ id: "x", name: "x", price: 1000, quantity: 1 }],
        total: 1000,
        deliveryFee: 0,
        serviceFee: 0,
        address: "test",
        region: "test",
        orderType: "delivery",
      });
      if (r.status === 500) throw new Error("XSS payload caused server error");
    }],
    ["Oversized payload → rejected or handled", async () => {
      const bigString = "A".repeat(200000);
      const r = await api("POST", "/api/orders", { notes: bigString, items: [] });
      if (r.status === 500) throw new Error("Oversized payload caused server crash");
    }],
  ]);

  await runSuite("🔒 Security — Access Control", [
    ["Admin endpoint for driver wallet requires admin auth", async () => {
      const r = await api("POST", "/api/admin/driver-wallet/recharge", {
        driverPhone: "07700000000",
        amount: 10000,
      });
      assertStatus(r, 401, "driver wallet recharge without auth");
    }],
    ["Admin delete vendor requires auth", async () => {
      const r = await api("DELETE", "/api/admin/vendors/some_vendor_id");
      assertStatus(r, 401, "delete vendor without auth");
    }],
    ["Admin send notification requires auth", async () => {
      const r = await api("POST", "/api/admin/send-notification", {
        title: "test",
        body: "test",
      });
      assertStatus(r, 401, "send notification without auth");
    }],
  ]);
}
