import os from "node:os";

export function getSystemSnapshot() {
  const mem = process.memoryUsage();
  const cpus = os.cpus();
  const load = os.loadavg();
  const freeMem = os.freemem();
  const totalMem = os.totalmem();

  let totalIdle = 0, totalTick = 0;
  for (const cpu of cpus) {
    for (const type in cpu.times) totalTick += cpu.times[type];
    totalIdle += cpu.times.idle;
  }
  const cpuUsedPct = Math.round((1 - totalIdle / totalTick) * 100);

  return {
    ts: Date.now(),
    cpuCount: cpus.length,
    cpuUsedPct,
    loadAvg1: load[0].toFixed(2),
    loadAvg5: load[1].toFixed(2),
    memTotalMb: Math.round(totalMem / 1024 / 1024),
    memFreeMb: Math.round(freeMem / 1024 / 1024),
    memUsedMb: Math.round((totalMem - freeMem) / 1024 / 1024),
    memUsedPct: Math.round(((totalMem - freeMem) / totalMem) * 100),
    heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
    heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
    rssMb: Math.round(mem.rss / 1024 / 1024),
    externalMb: Math.round(mem.external / 1024 / 1024),
  };
}

export class SystemMonitor {
  constructor(intervalMs = 1000) {
    this.intervalMs = intervalMs;
    this.snapshots = [];
    this._timer = null;
  }

  start() {
    this.snapshots = [];
    this._timer = setInterval(() => {
      this.snapshots.push(getSystemSnapshot());
    }, this.intervalMs);
  }

  stop() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    return this.summary();
  }

  summary() {
    if (this.snapshots.length === 0) return getSystemSnapshot();
    const cpus = this.snapshots.map(s => s.cpuUsedPct);
    const mems = this.snapshots.map(s => s.memUsedPct);
    const heaps = this.snapshots.map(s => s.heapUsedMb);
    const avg = arr => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
    const max = arr => Math.max(...arr);
    const last = this.snapshots[this.snapshots.length - 1];
    return {
      ...last,
      cpuAvgPct: avg(cpus),
      cpuMaxPct: max(cpus),
      memAvgPct: avg(mems),
      memMaxPct: max(mems),
      heapAvgMb: avg(heaps),
      heapMaxMb: max(heaps),
      samples: this.snapshots.length,
      timeline: this.snapshots,
    };
  }
}
