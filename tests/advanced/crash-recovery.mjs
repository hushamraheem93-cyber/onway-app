import { api, adminApi, testPhone, runSuite, runTest } from "../utils/helpers.mjs";

export async function runCrashRecovery() {
  console.log("\n💥 Crash & Recovery Tests");
  const results = [];

  async function test(name, fn) {
    const t0 = performance.now();
    try {
      await fn();
      const ms = Math.round(performance.now() - t0);
      results.push({ name, status: "pass", ms });
      console.log(`  ✓ ${name} (${ms}ms)`);
    } catch (err) {
      const ms = Math.round(performance.now() - t0);
      results.push({ name, status: "fail", ms, error: err.message });
      console.log(`  ✗ ${name} (${ms}ms)\n    → ${err.message}`);
    }
  }

  await test("Duplicate order same phone — no server crash", async () => {
    const phone = testPhone();
    const orderBody = {
      phoneNumber: phone, userId: phone, customerName: "CRASH TEST",
      customerPhone: phone, notes: "crash test duplicate",
      items: [{ id: "x1", name: "test", price: 1000, quantity: 1 }],
      total: 1000, deliveryFee: 0, serviceFee: 0,
      address: "test", region: "test", orderType: "delivery",
    };
    const [r1, r2, r3] = await Promise.all([
      api("POST", "/api/orders", orderBody),
      api("POST", "/api/orders", orderBody),
      api("POST", "/api/orders", orderBody),
    ]);
    if (r1.status === 500 || r2.status === 500 || r3.status === 500) {
      throw new Error("Server returned 500 on concurrent duplicate orders");
    }
    const ids = [r1.body?.id, r2.body?.id, r3.body?.id].filter(Boolean);
    for (const id of ids) {
      await api("POST", `/api/orders/${id}/cancel`, { phoneNumber: phone, reason: "crash test" });
    }
  });

  await test("Rapid successive requests same endpoint — no crash", async () => {
    const promises = Array.from({ length: 50 }, () => api("GET", "/api/categories"));
    const results = await Promise.all(promises);
    const crashed = results.filter(r => r.status === 500).length;
    if (crashed > 0) throw new Error(`${crashed} requests returned 500`);
  });

  await test("Malformed JSON body — graceful error", async () => {
    const res = await fetch("http://localhost:5000/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ this is not valid json !!!",
    });
    if (res.status === 500) throw new Error("Malformed JSON caused 500");
  });

  await test("Extremely large payload — no memory crash", async () => {
    const bigPayload = { notes: "X".repeat(500000), items: [], phoneNumber: testPhone() };
    const r = await api("POST", "/api/orders", bigPayload);
    if (r.status === 500) throw new Error("Large payload caused 500");
  });

  await test("Missing required auth fields — proper 4xx response", async () => {
    const r = await api("POST", "/api/vendor/mobile-auth", {});
    if (r.status !== 400) throw new Error(`Expected 400, got ${r.status}`);
  });

  await test("Non-existent resource lookup — proper 404/200", async () => {
    const r = await api("GET", "/api/users/00000000000_NONEXISTENT");
    if (r.status === 500) throw new Error("Non-existent user lookup caused 500");
  });

  await test("Rapid admin CRUD cycle — categories", async () => {
    const ops = [];
    for (let i = 0; i < 5; i++) {
      ops.push(adminApi("POST", "/api/admin/categories", { name: `[CRASH_TEST] ${i}`, sortOrder: 9999 }));
    }
    const created = await Promise.all(ops);
    const ids = created.map(r => r.body?.id).filter(Boolean);
    await Promise.all(ids.map(id => adminApi("DELETE", `/api/admin/categories/${id}`)));
    if (ids.length === 0) throw new Error("No categories were created");
  });

  await test("Concurrent GET and POST — no data race", async () => {
    const reads = Array.from({ length: 20 }, () => api("GET", "/api/categories"));
    const writes = Array.from({ length: 3 }, () =>
      adminApi("POST", "/api/admin/categories", { name: "[RACE_TEST]", sortOrder: 9998 })
    );
    const all = await Promise.allSettled([...reads, ...writes]);
    const errors = all.filter(r => r.status === "fulfilled" && r.value?.status === 500).length;
    if (errors > 0) throw new Error(`${errors} requests returned 500 during concurrent read/write`);
    const writeResults = all.slice(reads.length).map(r => r.value?.body?.id).filter(Boolean);
    await Promise.all(writeResults.map(id => adminApi("DELETE", `/api/admin/categories/${id}`)));
  });

  await test("Invalid order ID status update — graceful handling", async () => {
    const r = await adminApi("PUT", "/api/admin/orders/FAKE_ORDER_999999/status", { status: "confirmed" });
    if (r.status === 500) throw new Error("Invalid order ID status update caused 500");
  });

  await test("Concurrent user creation same phone — idempotent", async () => {
    const phone = testPhone();
    const body = { phoneNumber: phone, fullName: "CRASH TEST", gender: "male", region: "test", address: "test" };
    const [r1, r2] = await Promise.all([api("POST", "/api/users", body), api("POST", "/api/users", body)]);
    if (r1.status === 500 || r2.status === 500) throw new Error("Concurrent user creation caused 500");
    await api("DELETE", `/api/users/${phone}`);
  });

  await test("Order cancel already cancelled — idempotent", async () => {
    const phone = testPhone();
    const r = await api("POST", "/api/orders", {
      phoneNumber: phone, userId: phone, customerName: "CANCEL TEST", customerPhone: phone,
      items: [{ id: "x", name: "x", price: 1000, quantity: 1 }],
      total: 1000, deliveryFee: 0, serviceFee: 0, address: "test", region: "test", orderType: "delivery",
    });
    if (!r.body?.id) throw new Error("Order not created");
    const id = r.body.id;
    await api("POST", `/api/orders/${id}/cancel`, { phoneNumber: phone, reason: "test" });
    const r2 = await api("POST", `/api/orders/${id}/cancel`, { phoneNumber: phone, reason: "double cancel" });
    if (r2.status === 500) throw new Error("Double cancel caused 500");
  });

  const pass = results.filter(r => r.status === "pass").length;
  const fail = results.filter(r => r.status === "fail").length;
  console.log(`\n  Crash & Recovery: ${pass}/${results.length} passed`);
  return { results, pass, fail };
}
