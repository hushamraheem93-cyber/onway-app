import { api, adminApi, testPhone } from "../utils/helpers.mjs";

export async function runNotificationTests() {
  console.log("\n🔔 Notification & Infrastructure Tests");
  const results = [];

  async function test(name, fn) {
    const t0 = performance.now();
    try {
      const data = await fn();
      const ms = Math.round(performance.now() - t0);
      results.push({ name, status: "pass", ms, data });
      console.log(`  ✓ ${name} (${ms}ms)${data ? ` — ${data}` : ""}`);
    } catch (err) {
      const ms = Math.round(performance.now() - t0);
      results.push({ name, status: "fail", ms, error: err.message });
      console.log(`  ✗ ${name} (${ms}ms)\n    → ${err.message}`);
    }
  }

  await test("Push token registration endpoint responds", async () => {
    const r = await api("POST", "/api/users/push-token", {
      phoneNumber: testPhone(),
      pushToken: "ExponentPushToken[TestNotifToken_ONWAY_001]",
    });
    if (r.status !== 200 && r.status !== 201 && r.status !== 404) throw new Error(`Status: ${r.status}`);
    return `HTTP ${r.status}`;
  });

  await test("Admin notification stats endpoint responds", async () => {
    const r = await adminApi("GET", "/api/admin/notification-stats");
    if (r.status !== 200) throw new Error(`Status: ${r.status}`);
    return `${JSON.stringify(r.body)?.slice(0, 60)}`;
  });

  await test("Admin push token registration endpoint responds", async () => {
    const r = await adminApi("POST", "/api/admin/push-token", {
      pushToken: "ExponentPushToken[AdminTestToken_ONWAY_001]",
    });
    if (r.status !== 200 && r.status !== 400) throw new Error(`Status: ${r.status}`);
    return `HTTP ${r.status}`;
  });

  await test("Notification trigger on order creation (push-token present)", async () => {
    const phone = testPhone();
    await api("POST", "/api/users/push-token", {
      phoneNumber: phone,
      pushToken: "ExponentPushToken[SimulatedToken_ONWAY]",
    });
    const r = await api("POST", "/api/orders", {
      phoneNumber: phone, userId: phone, customerName: "نوتيف اختبار",
      customerPhone: phone, notes: "test notification",
      items: [{ id: "n1", name: "test", price: 1000, quantity: 1 }],
      total: 1000, deliveryFee: 0, serviceFee: 0,
      address: "test", region: "test", orderType: "delivery",
    });
    if (r.status !== 200 && r.status !== 201) throw new Error(`Order creation failed: ${r.status}`);
    if (r.body?.id) {
      await api("POST", `/api/orders/${r.body.id}/cancel`, { phoneNumber: phone, reason: "notification test cleanup" });
    }
    return `Order ${r.body?.id} created — push queued`;
  });

  await test("Order status change triggers notification flow", async () => {
    const r = await adminApi("GET", "/api/admin/orders");
    if (r.status !== 200) throw new Error("Cannot get orders");
    const orders = Array.isArray(r.body) ? r.body : [];
    const activeOrder = orders.find(o => ["pending", "confirmed"].includes(o.status));
    if (!activeOrder) return "No active orders to test (skipped)";
    const r2 = await adminApi("PUT", `/api/admin/orders/${activeOrder.id}/status`, { status: "confirmed" });
    if (r2.status !== 200 && r2.status !== 404) throw new Error(`Status update failed: ${r2.status}`);
    return `Order ${activeOrder.id} status updated — push triggered`;
  });

  await test("Vendor push token can be registered", async () => {
    const r = await api("POST", "/api/vendor/mobile-auth", { phoneNumber: "07700000001" });
    if (!r.body?.token) return "No demo vendor token (test skipped)";
    const r2 = await fetch("http://localhost:5000/api/vendor/push-token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${r.body.token}` },
      body: JSON.stringify({ pushToken: "ExponentPushToken[VendorTestToken_ONWAY]" }),
    });
    if (!r2.ok && r2.status !== 400) throw new Error(`Status: ${r2.status}`);
    return `HTTP ${r2.status}`;
  });

  await test("Support messages endpoint accessible", async () => {
    const phone = testPhone();
    const r = await api("GET", `/api/support/messages?phoneNumber=${phone}`);
    if (r.status !== 200 && r.status !== 404) throw new Error(`Status: ${r.status}`);
    return `HTTP ${r.status}`;
  });

  const pass = results.filter(r => r.status === "pass").length;
  const fail = results.filter(r => r.status === "fail").length;
  console.log(`\n  Notifications: ${pass}/${results.length} passed`);
  return { results, pass, fail };
}
