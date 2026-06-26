import { BASE_URL, makeAdminCookie } from "../utils/helpers.mjs";
import { SystemMonitor } from "./system-monitor.mjs";

async function timedFetch(url, opts = {}) {
  const t0 = performance.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000), ...opts });
    return { ok: res.status < 400, status: res.status, ms: Math.round(performance.now() - t0) };
  } catch (err) {
    return { ok: false, status: 0, ms: Math.round(performance.now() - t0), error: err.message };
  }
}

async function runBatch(label, n, taskFn, monitor) {
  const t0 = performance.now();
  const promises = Array.from({ length: n }, () => taskFn());
  const outcomes = await Promise.allSettled(promises);
  const elapsed = Math.round(performance.now() - t0);
  const done = outcomes.map(o => o.status === "fulfilled" ? o.value : { ok: false, status: 0, ms: 0 });
  const ok = done.filter(d => d.ok).length;
  const fail = done.length - ok;
  const times = done.map(d => d.ms).sort((a, b) => a - b);
  const avg = Math.round(times.reduce((a, b) => a + b, 0) / (times.length || 1));
  const p50 = times[Math.floor(times.length * 0.50)] || 0;
  const p95 = times[Math.floor(times.length * 0.95)] || 0;
  const p99 = times[Math.floor(times.length * 0.99)] || 0;
  const min = times[0] || 0;
  const max = times[times.length - 1] || 0;
  const rps = Math.round((n / elapsed) * 1000);
  const sysSnap = monitor ? monitor.summary() : null;
  const icon = fail === 0 ? "✓" : fail < n * 0.1 ? "~" : "✗";
  console.log(`  ${icon} [${n} concurrent] ${label} | OK:${ok} Fail:${fail} | avg:${avg}ms p95:${p95}ms p99:${p99}ms | ${rps} RPS`);
  if (sysSnap) console.log(`     └─ CPU:${sysSnap.cpuAvgPct}% avg / ${sysSnap.cpuMaxPct}% peak | RAM:${sysSnap.memUsedMb}MB / ${sysSnap.memTotalMb}MB | Heap:${sysSnap.heapUsedMb}MB`);
  return { label, n, ok, fail, elapsed, avg, min, max, p50, p95, p99, rps, errorRate: Math.round((fail / n) * 100), sys: sysSnap };
}

export async function runAdvancedLoad() {
  console.log("\n⚡ Advanced Load Testing");
  const adminCookie = makeAdminCookie();
  const results = [];
  const endpoints = ["/api/categories", "/api/stores", "/api/products", "/api/banners", "/api/delivery-areas"];

  const levels = [100, 300, 500, 1000];
  for (const n of levels) {
    console.log(`\n  → Level ${n} concurrent users`);
    const mon = new SystemMonitor(500);
    mon.start();
    const r = await runBatch("GET /api/categories", n, () => timedFetch(`${BASE_URL}/api/categories`), mon);
    mon.stop();
    results.push({ ...r, scenario: "categories" });

    const mon2 = new SystemMonitor(500);
    mon2.start();
    const r2 = await runBatch("Mixed public endpoints", n, () => {
      const ep = endpoints[Math.floor(Math.random() * endpoints.length)];
      return timedFetch(`${BASE_URL}${ep}`);
    }, mon2);
    mon2.stop();
    results.push({ ...r2, scenario: "mixed_public" });

    const mon3 = new SystemMonitor(500);
    mon3.start();
    const r3 = await runBatch("GET /api/admin/orders (auth)", n, () =>
      timedFetch(`${BASE_URL}/api/admin/orders`, { headers: { Cookie: adminCookie } }), mon3);
    mon3.stop();
    results.push({ ...r3, scenario: "admin_orders" });

    if (r.p99 > 12000 || r.fail > n * 0.3) {
      console.log(`  ⚠ High latency/errors at level ${n} — stopping ramp`);
      break;
    }
  }

  const maxConcurrent = results.filter(r => r.fail === 0 || r.errorRate < 10).reduce((m, r) => Math.max(m, r.n), 0);
  const maxRps = Math.max(...results.map(r => r.rps));
  const avgResponseTime = Math.round(results.reduce((s, r) => s + r.avg, 0) / results.length);
  console.log(`\n  📊 Max concurrent (errorRate < 10%): ${maxConcurrent} | Max RPS: ${maxRps} | Avg RT: ${avgResponseTime}ms`);

  return { results, maxConcurrent, maxRps, avgResponseTime };
}
