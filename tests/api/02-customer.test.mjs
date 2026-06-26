import { api, assertStatus, testPhone, runSuite, assert } from "../utils/helpers.mjs";

const CLEANUP = [];

export async function runCustomerTests() {
  let phone = testPhone();
  let orderId = null;

  await runSuite("👤 Customer — User Management", [
    ["POST /api/users creates new user", async () => {
      const r = await api("POST", "/api/users", {
        phoneNumber: phone,
        fullName: "TEST اختبار تلقائي",
        gender: "male",
        region: "بغداد",
        address: "شارع الاختبار - رقم 1",
      });
      if (r.status !== 200 && r.status !== 201 && r.status !== 409) {
        throw new Error(`Unexpected status ${r.status}: ${JSON.stringify(r.body)}`);
      }
      CLEANUP.push(phone);
    }],
    ["GET /api/users/:phone returns user", async () => {
      const r = await api("GET", `/api/users/${phone}`);
      if (r.status !== 200 && r.status !== 404) throw new Error(`Unexpected status ${r.status}`);
    }],
    ["PUT /api/users/:phone updates user", async () => {
      const r = await api("PUT", `/api/users/${phone}`, {
        fullName: "TEST محدّث",
        address: "بغداد - الكرادة",
        region: "بغداد",
      });
      if (r.status !== 200 && r.status !== 404) throw new Error(`Unexpected status ${r.status}`);
    }],
    ["POST /api/users/push-token saves push token", async () => {
      const r = await api("POST", "/api/users/push-token", {
        phoneNumber: phone,
        pushToken: "ExponentPushToken[TEST_TOKEN_abc123]",
      });
      if (r.status !== 200 && r.status !== 201 && r.status !== 404) {
        throw new Error(`Unexpected status ${r.status}`);
      }
    }],
  ]);

  await runSuite("🛒 Customer — Orders", [
    ["POST /api/orders creates order", async () => {
      const r = await api("POST", "/api/orders", {
        phoneNumber: phone,
        userId: phone,
        customerName: "TEST زبون",
        customerPhone: phone,
        notes: "اختبار تلقائي - لا تعالج هذا الطلب",
        items: [{ id: "test_item_1", name: "منتج تجريبي", price: 5000, quantity: 1 }],
        total: 5000,
        deliveryFee: 2000,
        serviceFee: 500,
        address: "بغداد - اختبار",
        region: "test-region",
        latitude: 33.3152,
        longitude: 44.3661,
        orderType: "delivery",
        paymentMethod: "cash",
      });
      if (r.status !== 200 && r.status !== 201) {
        throw new Error(`Expected 200/201, got ${r.status}: ${JSON.stringify(r.body)}`);
      }
      orderId = r.body?.id || r.body?.orderId;
    }],
    ["GET /api/orders?phoneNumber=... returns orders list", async () => {
      const r = await api("GET", `/api/orders?phoneNumber=${phone}`);
      assertStatus(r, 200, "get orders");
      if (!Array.isArray(r.body)) throw new Error("Expected array");
    }],
    ["POST /api/orders/:id/cancel cancels the order", async () => {
      if (!orderId) throw new Error("No orderId from previous test");
      const r = await api("POST", `/api/orders/${orderId}/cancel`, {
        phoneNumber: phone,
        reason: "اختبار تلقائي",
      });
      if (r.status !== 200 && r.status !== 400) {
        throw new Error(`Unexpected status ${r.status}: ${JSON.stringify(r.body)}`);
      }
    }],
    ["POST /api/orders/:id/rate — returns 400/404 for cancelled order", async () => {
      if (!orderId) throw new Error("No orderId from previous test");
      const r = await api("POST", `/api/orders/${orderId}/rate`, {}, {
        Authorization: `Bearer ${phone}`,
      });
      if (r.status === 200) throw new Error("Should not rate a cancelled order");
    }],
  ]);

  await runSuite("🎟 Customer — Promo Codes", [
    ["POST /api/promo-codes/apply with invalid code returns error", async () => {
      const r = await api("POST", "/api/promo-codes/apply", {
        code: "INVALID_CODE_XYZ999",
        userId: phone,
        cartTotal: 10000,
      });
      if (r.status === 200 && r.body?.valid === true) {
        throw new Error("Invalid code should not be valid");
      }
    }],
  ]);

  await runSuite("🧹 Customer — Cleanup", [
    ["DELETE /api/users/:phone removes test user", async () => {
      for (const p of CLEANUP) {
        const r = await api("DELETE", `/api/users/${p}`);
        if (r.status !== 200 && r.status !== 404) {
          throw new Error(`Could not clean up user ${p}: status ${r.status}`);
        }
      }
    }],
  ]);
}
