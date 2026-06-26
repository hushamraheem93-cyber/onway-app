import { api, adminApi, runSuite, runTest } from "../utils/helpers.mjs";
import { SystemMonitor } from "./system-monitor.mjs";

async function measureBatch(label, n, taskFn) {
  const t0 = performance.now();
  const results = [];
  for (let i = 0; i < n; i++) {
    const r = await taskFn(i);
    results.push(r);
  }
  const elapsed = Math.round(performance.now() - t0);
  const times = results.map(r => r.ms).sort((a, b) => a - b);
  const avg = Math.round(times.reduce((a, b) => a + b, 0) / (times.length || 1));
  const p50 = times[Math.floor(times.length * 0.50)] || 0;
  const p95 = times[Math.floor(times.length * 0.95)] || 0;
  const p99 = times[Math.floor(times.length * 0.99)] || 0;
  const ok = results.filter(r => r.ok).length;
  console.log(`  → ${label}: ${n} ops | avg:${avg}ms p95:${p95}ms p99:${p99}ms | ${ok}/${n} OK | total:${elapsed}ms`);
  return { label, n, avg, p50, p95, p99, ok, elapsed, opsPerSec: Math.round((n / elapsed) * 1000) };
}

async function timedApiCall(method, path, body, headers) {
  const t0 = performance.now();
  try {
    const res = await api(method, path, body, headers);
    return { ok: res.status < 400, status: res.status, ms: Math.round(performance.now() - t0) };
  } catch {
    return { ok: false, status: 0, ms: Math.round(performance.now() - t0) };
  }
}

const CREATED_IDS = { categories: [], areas: [], users: [] };

export async function runDbPerformance() {
  console.log("\n🗄  Database Performance Tests");
  const metrics = [];
  const mon = new SystemMonitor(1000);
  mon.start();

  const m1 = await measureBatch("Sequential READ /api/categories", 20, async () => timedApiCall("GET", "/api/categories"));
  metrics.push(m1);

  const m2 = await measureBatch("Sequential READ /api/banners", 20, async () => timedApiCall("GET", "/api/banners"));
  metrics.push(m2);

  const m3 = await measureBatch("Sequential READ /api/products", 20, async () => timedApiCall("GET", "/api/products"));
  metrics.push(m3);

  const m4 = await measureBatch("Sequential READ /api/admin/orders (large)", 10, async () => {
    const t0 = performance.now();
    const res = await adminApi("GET", "/api/admin/orders");
    return { ok: res.status === 200, ms: Math.round(performance.now() - t0) };
  });
  metrics.push(m4);

  const m5 = await measureBatch("Sequential READ /api/admin/drivers", 10, async () => {
    const t0 = performance.now();
    const res = await adminApi("GET", "/api/admin/drivers");
    return { ok: res.status === 200, ms: Math.round(performance.now() - t0) };
  });
  metrics.push(m5);

  console.log("\n  ─ Write Performance ─");

  const m6 = await measureBatch("WRITE: Create delivery areas (10)", 10, async (i) => {
    const t0 = performance.now();
    const res = await adminApi("POST", "/api/admin/delivery-areas", { name: `[TEST_DB] منطقة ${i}`, fee: 1000 + i * 100, active: false });
    if (res.body?.id) CREATED_IDS.areas.push(res.body.id);
    return { ok: res.status < 300, ms: Math.round(performance.now() - t0) };
  });
  metrics.push(m6);

  const m7 = await measureBatch("WRITE: Create categories (10)", 10, async (i) => {
    const t0 = performance.now();
    const res = await adminApi("POST", "/api/admin/categories", { name: `[TEST_DB] فئة ${i}`, sortOrder: 9990 + i });
    if (res.body?.id) CREATED_IDS.categories.push(res.body.id);
    return { ok: res.status < 300, ms: Math.round(performance.now() - t0) };
  });
  metrics.push(m7);

  console.log("\n  ─ Cleanup ─");
  let cleaned = 0;
  for (const id of CREATED_IDS.areas) {
    await adminApi("DELETE", `/api/admin/delivery-areas/${id}`);
    cleaned++;
  }
  for (const id of CREATED_IDS.categories) {
    await adminApi("DELETE", `/api/admin/categories/${id}`);
    cleaned++;
  }
  console.log(`  → Cleaned up ${cleaned} test records`);

  const sys = mon.stop();
  console.log(`\n  CPU: avg ${sys.cpuAvgPct}% / peak ${sys.cpuMaxPct}% | RAM: ${sys.memUsedMb}MB / ${sys.memTotalMb}MB`);

  return { metrics, sys };
}
