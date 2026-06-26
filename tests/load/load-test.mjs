import { BASE_URL, makeAdminCookie, results } from "../utils/helpers.mjs";

async function timedFetch(url, opts = {}) {
  const t0 = performance.now();
  try {
    const res = await fetch(url, opts);
    const ms = Math.round(performance.now() - t0);
    return { ok: res.ok, status: res.status, ms, error: null };
  } catch (err) {
    const ms = Math.round(performance.now() - t0);
    return { ok: false, status: 0, ms, error: err.message };
  }
}

async function runConcurrent(label, n, taskFn) {
  const t0 = performance.now();
  const promises = Array.from({ length: n }, () => taskFn());
  const outcomes = await Promise.allSettled(promises);
  const elapsed = Math.round(performance.now() - t0);

  const done = outcomes.map(o => o.status === "fulfilled" ? o.value : { ok: false, status: 0, ms: 0, error: o.reason?.message });
  const ok = done.filter(d => d.ok).length;
  const fail = done.length - ok;
  const times = done.map(d => d.ms).sort((a, b) => a - b);
  const p50 = times[Math.floor(times.length * 0.5)] || 0;
  const p95 = times[Math.floor(times.length * 0.95)] || 0;
  const p99 = times[Math.floor(times.length * 0.99)] || 0;
  const avg = Math.round(times.reduce((s, t) => s + t, 0) / times.length);
  const rps = Math.round((n / elapsed) * 1000);

  const result = { label, n, ok, fail, elapsed, avg, p50, p95, p99, rps };

  const bar = ok === n ? "✓" : fail === n ? "✗" : "~";
  console.log(`  ${bar} [${label}] ${n} reqs | ${ok} OK / ${fail} fail | avg:${avg}ms p95:${p95}ms | ${rps} RPS`);

  return result;
}

export async function runLoadTests() {
  console.log("\n⚡ Load Testing");
  const loadResults = [];
  const adminCookie = makeAdminCookie();

  const scenarios = [
    { label: "GET /api/categories (10)", n: 10, fn: () => timedFetch(`${BASE_URL}/api/categories`) },
    { label: "GET /api/categories (50)", n: 50, fn: () => timedFetch(`${BASE_URL}/api/categories`) },
    { label: "GET /api/categories (100)", n: 100, fn: () => timedFetch(`${BASE_URL}/api/categories`) },
    { label: "GET /api/stores (50)", n: 50, fn: () => timedFetch(`${BASE_URL}/api/stores`) },
    { label: "GET /api/stores (100)", n: 100, fn: () => timedFetch(`${BASE_URL}/api/stores`) },
    { label: "GET /api/products (50)", n: 50, fn: () => timedFetch(`${BASE_URL}/api/products`) },
    { label: "GET /api/banners (100)", n: 100, fn: () => timedFetch(`${BASE_URL}/api/banners`) },
    { label: "GET /api/delivery-areas (100)", n: 100, fn: () => timedFetch(`${BASE_URL}/api/delivery-areas`) },
    { label: "Admin GET /api/admin/orders (50)", n: 50, fn: () => timedFetch(`${BASE_URL}/api/admin/orders`, { headers: { Cookie: adminCookie } }) },
    { label: "Mixed public (200)", n: 200, fn: () => {
      const endpoints = ["/api/categories", "/api/stores", "/api/products", "/api/banners", "/api/delivery-areas"];
      const ep = endpoints[Math.floor(Math.random() * endpoints.length)];
      return timedFetch(`${BASE_URL}${ep}`);
    }},
    { label: "Concurrent orders query (100)", n: 100, fn: () => timedFetch(`${BASE_URL}/api/orders?phoneNumber=07700000001`) },
  ];

  for (const s of scenarios) {
    const r = await runConcurrent(s.label, s.n, s.fn);
    loadResults.push(r);
  }

  console.log(`\n  📊 Load Test Summary`);
  console.log(`  ─────────────────────────────────────────────────`);
  let totalOk = 0, totalFail = 0;
  for (const r of loadResults) {
    totalOk += r.ok;
    totalFail += r.fail;
  }
  console.log(`  Total requests: ${totalOk + totalFail} | OK: ${totalOk} | Fail: ${totalFail}`);

  return loadResults;
}

export async function runStressTest() {
  console.log("\n💥 Stress Testing — Ramping Up");
  const stressResults = [];

  const levels = [100, 300, 500];
  for (const level of levels) {
    console.log(`\n  → Stress level: ${level} concurrent`);
    const r = await runConcurrent(
      `GET /api/categories x${level}`,
      level,
      () => timedFetch(`${BASE_URL}/api/categories`)
    );
    stressResults.push({ ...r, level });

    const r2 = await runConcurrent(
      `GET /api/stores x${level}`,
      level,
      () => timedFetch(`${BASE_URL}/api/stores`)
    );
    stressResults.push({ ...r2, level });

    if (r.p99 > 10000 || r2.p99 > 10000) {
      console.log(`  ⚠ P99 > 10s at level ${level} — stopping stress ramp`);
      break;
    }
  }

  return stressResults;
}
