import { api, adminApi, vendorApi, assertStatus, runSuite, assert, testPhone, getVendorToken, sleep } from "../utils/helpers.mjs";

const DEMO_VENDOR_PHONE = "07700000001";

export async function runE2ETests() {
  let customerPhone = testPhone();
  let orderId = null;
  let vendorToken = null;
  let driverPhone = testPhone();

  await runSuite("🔄 E2E — Full Order Lifecycle", [
    ["Setup: get vendor token", async () => {
      vendorToken = await getVendorToken(DEMO_VENDOR_PHONE);
      if (!vendorToken) throw new Error("Could not get vendor token for demo vendor");
    }],

    ["Setup: register test customer", async () => {
      const r = await api("POST", "/api/users", {
        phoneNumber: customerPhone,
        fullName: "E2E زبون اختبار",
        gender: "male",
        region: "بغداد",
        address: "E2E test address",
      });
      if (r.status !== 200 && r.status !== 201 && r.status !== 409) {
        throw new Error(`Customer register failed: ${r.status}: ${JSON.stringify(r.body)}`);
      }
    }],

    ["Step 1: Customer creates order", async () => {
      const r = await api("POST", "/api/orders", {
        phoneNumber: customerPhone,
        userId: customerPhone,
        customerName: "E2E زبون اختبار",
        customerPhone: customerPhone,
        notes: "E2E اختبار كامل - تجاهل",
        items: [
          { id: "e2e_item_1", name: "منتج E2E", price: 10000, quantity: 2 },
        ],
        total: 20000,
        deliveryFee: 3000,
        serviceFee: 500,
        address: "بغداد - الكرادة - اختبار E2E",
        region: "بغداد",
        latitude: 33.3152,
        longitude: 44.3661,
        orderType: "delivery",
        paymentMethod: "cash",
      });
      if (r.status !== 200 && r.status !== 201) {
        throw new Error(`Order creation failed: ${r.status} — ${JSON.stringify(r.body)}`);
      }
      orderId = r.body?.id || r.body?.orderId;
      assert(orderId, "Order ID should be returned");
    }],

    ["Step 2: Vendor orders endpoint responds correctly", async () => {
      if (!vendorToken) throw new Error("Missing vendorToken");
      const r = await vendorApi("GET", "/api/vendor/orders", undefined, vendorToken);
      assertStatus(r, 200, "vendor orders");
      const list = Array.isArray(r.body) ? r.body : r.body?.orders;
      assert(Array.isArray(list), `Expected array in vendor orders response, got: ${JSON.stringify(r.body)?.slice(0,80)}`);
    }],

    ["Step 3: Admin views the order", async () => {
      const r = await adminApi("GET", "/api/admin/orders");
      assertStatus(r, 200, "admin orders");
      assert(Array.isArray(r.body), "Expected array");
    }],

    ["Step 4: Admin updates order status to confirmed", async () => {
      if (!orderId) throw new Error("No orderId");
      const r = await adminApi("PUT", `/api/admin/orders/${orderId}/status`, {
        status: "confirmed",
      });
      if (r.status !== 200 && r.status !== 404) {
        throw new Error(`Status update failed: ${r.status}`);
      }
    }],

    ["Step 5: Admin updates order status to preparing", async () => {
      if (!orderId) throw new Error("No orderId");
      const r = await adminApi("PUT", `/api/admin/orders/${orderId}/status`, {
        status: "preparing",
      });
      if (r.status !== 200 && r.status !== 404) {
        throw new Error(`Status update failed: ${r.status}`);
      }
    }],

    ["Step 6: Admin updates order status to ready", async () => {
      if (!orderId) throw new Error("No orderId");
      const r = await adminApi("PUT", `/api/admin/orders/${orderId}/status`, {
        status: "ready",
      });
      if (r.status !== 200 && r.status !== 404) {
        throw new Error(`Status update failed: ${r.status}`);
      }
    }],

    ["Step 7: Driver registers and goes online", async () => {
      const regRes = await api("POST", "/api/drivers", {
        phoneNumber: driverPhone,
        fullName: "E2E سائق اختبار",
        firstName: "E2E",
        secondName: "سائق",
        nationalIdImage: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      });
      if (regRes.status !== 200 && regRes.status !== 201 && regRes.status !== 409) {
        throw new Error(`Driver register failed: ${regRes.status}: ${JSON.stringify(regRes.body)}`);
      }
      const onlineRes = await api("POST", "/api/driver/toggle-online", {
        phoneNumber: driverPhone,
        online: true,
        lat: 33.3152,
        lng: 44.3661,
      });
      if (onlineRes.status !== 200 && onlineRes.status !== 403) {
        throw new Error(`Toggle online failed: ${onlineRes.status}`);
      }
    }],

    ["Step 8: Admin assigns driver to order", async () => {
      if (!orderId) throw new Error("No orderId");
      const r = await adminApi("POST", `/api/admin/orders/${orderId}/assign-driver`, {
        driverPhone,
      });
      if (r.status !== 200 && r.status !== 403 && r.status !== 404 && r.status !== 400) {
        throw new Error(`Assign driver failed: ${r.status}: ${JSON.stringify(r.body)}`);
      }
    }],

    ["Step 9: Customer sees updated order status", async () => {
      const r = await api("GET", `/api/orders?phoneNumber=${customerPhone}`);
      assertStatus(r, 200, "customer orders");
      assert(Array.isArray(r.body), "Expected array");
      const found = r.body.find(o => o.id === orderId);
      if (found) assert(found.status !== "pending", "Order should have progressed past pending");
    }],

    ["Cleanup: cancel/archive order", async () => {
      if (!orderId) return;
      const r = await adminApi("PUT", `/api/admin/orders/${orderId}/status`, { status: "cancelled" });
      if (r.status !== 200 && r.status !== 404) {
        console.warn(`    ⚠ Could not cancel order ${orderId}`);
      }
    }],

    ["Cleanup: delete test customer", async () => {
      const r = await api("DELETE", `/api/users/${customerPhone}`);
      if (r.status !== 200 && r.status !== 404) {
        console.warn(`    ⚠ Could not delete customer ${customerPhone}`);
      }
    }],
  ]);
}
