import { api, testPhone } from "../utils/helpers.mjs";
import { SystemMonitor } from "./system-monitor.mjs";

const DRIVER_COUNT = 30;
const UPDATES_PER_DRIVER = 10;

function randomBaghdadCoord() {
  return {
    lat: 33.2778 + (Math.random() - 0.5) * 0.2,
    lng: 44.3661 + (Math.random() - 0.5) * 0.2,
  };
}

export async function runGpsSimulation() {
  console.log("\n🗺  GPS Simulation — " + DRIVER_COUNT + " drivers × " + UPDATES_PER_DRIVER + " updates");

  const phones = Array.from({ length: DRIVER_COUNT }, () => testPhone());
  const mon = new SystemMonitor(1000);
  mon.start();

  const t0 = performance.now();
  let ok = 0, fail = 0;
  const latencies = [];

  const updateRounds = UPDATES_PER_DRIVER;
  for (let round = 0; round < updateRounds; round++) {
    const batch = phones.map(phone => {
      const { lat, lng } = randomBaghdadCoord();
      const start = performance.now();
      return api("POST", "/api/driver/location", { phoneNumber: phone, lat, lng })
        .then(r => {
          latencies.push(Math.round(performance.now() - start));
          if (r.status === 200) ok++;
          else fail++;
        })
        .catch(() => {
          fail++;
          latencies.push(5000);
        });
    });
    await Promise.all(batch);
    await new Promise(r => setTimeout(r, 100));
  }

  const elapsed = Math.round(performance.now() - t0);
  latencies.sort((a, b) => a - b);
  const totalUpdates = DRIVER_COUNT * updateRounds;
  const avg = Math.round(latencies.reduce((a, b) => a + b, 0) / (latencies.length || 1));
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;
  const rps = Math.round((totalUpdates / elapsed) * 1000);

  const sys = mon.stop();
  console.log(`  → ${totalUpdates} GPS updates | OK:${ok} Fail:${fail} | avg:${avg}ms p95:${p95}ms p99:${p99}ms | ${rps} RPS`);
  console.log(`  → CPU: ${sys.cpuAvgPct}% avg | RAM: ${sys.memUsedMb}MB | Heap: ${sys.heapUsedMb}MB`);

  return {
    drivers: DRIVER_COUNT,
    updatesPerDriver: updateRounds,
    totalUpdates,
    ok,
    fail,
    avg,
    p95,
    p99,
    rps,
    elapsed,
    errorRate: Math.round((fail / totalUpdates) * 100),
    sys,
  };
}
