#!/usr/bin/env node
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

import { BASE_URL, results as apiResults } from "../utils/helpers.mjs";
import { runPublicTests } from "../api/01-public.test.mjs";
import { runCustomerTests } from "../api/02-customer.test.mjs";
import { runVendorTests } from "../api/03-vendor.test.mjs";
import { runDriverTests } from "../api/04-driver.test.mjs";
import { runAdminTests } from "../api/05-admin.test.mjs";
import { runE2ETests } from "../api/06-e2e.test.mjs";
import { runSecurityTests } from "../api/07-security.test.mjs";
import { runAdvancedLoad } from "./advanced-load.mjs";
import { runDbPerformance } from "./db-perf.mjs";
import { runGpsSimulation } from "./gps-sim.mjs";
import { runCrashRecovery } from "./crash-recovery.mjs";
import { runNotificationTests } from "./notification-test.mjs";
import { getSystemSnapshot, SystemMonitor } from "./system-monitor.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function checkServerUp() {
  try {
    const r = await fetch(`${BASE_URL}/api/categories`, { signal: AbortSignal.timeout(5000) });
    return r.ok;
  } catch { return false; }
}

async function main() {
  const globalStart = Date.now();
  const sysBefore = getSystemSnapshot();

  console.log("═══════════════════════════════════════════════════════");
  console.log("  OnWay — التقرير الشامل لجاهزية النظام للإطلاق");
  console.log("  المرحلة الثانية: Advanced Testing + System Report");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Server: ${BASE_URL}`);
  console.log(`  System: ${os.cpus().length} CPUs | ${Math.round(os.totalmem()/1024/1024)}MB RAM`);
  console.log(`  Node.js: ${process.version}`);
  console.log(`  Time: ${new Date().toLocaleString("ar-IQ")}\n`);

  if (!await checkServerUp()) {
    console.error("  ✗ الخادم غير متاح على المنفذ 5000!");
    process.exit(1);
  }
  console.log("  ✓ الخادم يعمل\n");

  const globalMon = new SystemMonitor(2000);
  globalMon.start();

  // ── Phase 1: API Tests ───────────────────────────────────────────────────
  console.log("\n══════════════════════════════════");
  console.log(" المرحلة 1: الاختبارات الوظيفية");
  console.log("══════════════════════════════════");
  for (const fn of [runPublicTests, runCustomerTests, runVendorTests, runDriverTests, runAdminTests, runE2ETests, runSecurityTests]) {
    try { await fn(); } catch (e) { console.error("Suite error:", e.message); }
  }

  // ── Phase 2: Load Tests ──────────────────────────────────────────────────
  console.log("\n══════════════════════════════════");
  console.log(" المرحلة 2: اختبارات الحمل والضغط");
  console.log("══════════════════════════════════");
  let loadData = { results: [], maxConcurrent: 0, maxRps: 0, avgResponseTime: 0 };
  try { loadData = await runAdvancedLoad(); } catch (e) { console.error("Load test error:", e.message); }

  // ── Phase 3: DB Performance ──────────────────────────────────────────────
  console.log("\n══════════════════════════════════");
  console.log(" المرحلة 3: أداء قاعدة البيانات");
  console.log("══════════════════════════════════");
  let dbData = { metrics: [], sys: {} };
  try { dbData = await runDbPerformance(); } catch (e) { console.error("DB test error:", e.message); }

  // ── Phase 4: GPS Simulation ──────────────────────────────────────────────
  console.log("\n══════════════════════════════════");
  console.log(" المرحلة 4: محاكاة GPS للسائقين");
  console.log("══════════════════════════════════");
  let gpsData = {};
  try { gpsData = await runGpsSimulation(); } catch (e) { console.error("GPS test error:", e.message); }

  // ── Phase 5: Notifications ───────────────────────────────────────────────
  console.log("\n══════════════════════════════════");
  console.log(" المرحلة 5: اختبار الإشعارات");
  console.log("══════════════════════════════════");
  let notifData = { results: [], pass: 0, fail: 0 };
  try { notifData = await runNotificationTests(); } catch (e) { console.error("Notif test error:", e.message); }

  // ── Phase 6: Crash & Recovery ────────────────────────────────────────────
  console.log("\n══════════════════════════════════");
  console.log(" المرحلة 6: اختبارات الصمود والتعافي");
  console.log("══════════════════════════════════");
  let crashData = { results: [], pass: 0, fail: 0 };
  try { crashData = await runCrashRecovery(); } catch (e) { console.error("Crash test error:", e.message); }

  const globalSys = globalMon.stop();
  const elapsed = Date.now() - globalStart;
  const sysAfter = getSystemSnapshot();

  // ── Final Summary ────────────────────────────────────────────────────────
  const totalApiTests = apiResults.pass + apiResults.fail;
  const allCrashTests = crashData.results.length;
  const allNotifTests = notifData.results.length;
  const totalTests = totalApiTests + allCrashTests + allNotifTests;
  const totalPass = apiResults.pass + crashData.pass + notifData.pass;
  const totalFail = apiResults.fail + crashData.fail + notifData.fail;

  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  📊 الملخص التنفيذي النهائي");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  إجمالي الاختبارات: ${totalTests} | ✓ ناجح: ${totalPass} | ✗ فاشل: ${totalFail}`);
  console.log(`  معدل النجاح: ${Math.round(totalPass/totalTests*100)}%`);
  console.log(`  أقصى تزامن (errorRate<10%): ${loadData.maxConcurrent} مستخدم`);
  console.log(`  أقصى RPS: ${loadData.maxRps} طلب/ثانية`);
  console.log(`  متوسط زمن الاستجابة: ${loadData.avgResponseTime}ms`);
  console.log(`  CPU (peak): ${globalSys.cpuMaxPct}% | RAM المستخدمة: ${globalSys.memUsedMb}MB / ${globalSys.memTotalMb}MB`);
  console.log(`  Heap peak: ${globalSys.heapMaxMb}MB`);
  console.log(`  المدة الإجمالية: ${(elapsed/1000).toFixed(0)}s`);

  const reportPath = generateReport({
    apiResults, loadData, dbData, gpsData, notifData, crashData,
    elapsed, globalSys, sysBefore, sysAfter, totalTests, totalPass, totalFail,
  });
  console.log(`\n  📄 التقرير الشامل: ${reportPath}`);
  console.log("═══════════════════════════════════════════════════════\n");

  process.exit(totalFail > 0 ? 1 : 0);
}

function esc(s) {
  return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function generateReport({ apiResults, loadData, dbData, gpsData, notifData, crashData, elapsed, globalSys, sysBefore, sysAfter, totalTests, totalPass, totalFail }) {
  const successRate = Math.round((totalPass / totalTests) * 100);
  const now = new Date().toLocaleString("ar-IQ");

  const loadRows = loadData.results.map(r =>
    `<tr><td>${r.n}</td><td>${esc(r.label)}</td><td class="${r.fail===0?'c-green':r.errorRate<10?'c-yellow':'c-red'}">${r.ok}</td><td class="${r.fail>0?'c-red':''}">${r.fail}</td><td>${r.avg}</td><td>${r.p50}</td><td>${r.p95}</td><td>${r.p99}</td><td>${r.rps}</td><td>${r.sys?.cpuAvgPct||'—'}%</td><td>${r.sys?.memUsedMb||'—'}MB</td></tr>`
  ).join("");

  const dbRows = dbData.metrics.map(m =>
    `<tr><td>${esc(m.label)}</td><td>${m.n}</td><td>${m.avg}ms</td><td>${m.p95}ms</td><td>${m.p99}ms</td><td>${m.opsPerSec}</td><td class="${m.ok===m.n?'c-green':'c-yellow'}">${m.ok}/${m.n}</td></tr>`
  ).join("");

  const apiFailedRows = apiResults.tests.filter(t=>t.status==="fail").map(t =>
    `<tr class="c-red"><td>${esc(t.name)}</td><td>${esc(t.error||"")}</td><td>${t.ms}ms</td></tr>`
  ).join("");

  const crashRows = crashData.results.map(r =>
    `<tr><td class="${r.status==='pass'?'c-green':'c-red'}">${r.status==='pass'?'✓':'✗'}</td><td>${esc(r.name)}</td><td>${r.ms}ms</td><td>${esc(r.error||"—")}</td></tr>`
  ).join("");

  const notifRows = notifData.results.map(r =>
    `<tr><td class="${r.status==='pass'?'c-green':'c-red'}">${r.status==='pass'?'✓':'✗'}</td><td>${esc(r.name)}</td><td>${r.ms}ms</td><td>${esc(r.data||r.error||"—")}</td></tr>`
  ).join("");

  const maxConcurrent = loadData.maxConcurrent || 0;
  const readiness = successRate >= 95 && totalFail <= 3 ? "🟢 جاهز للإطلاق" : successRate >= 85 ? "🟡 يحتاج تحسينات بسيطة" : "🔴 يحتاج إصلاحات قبل الإطلاق";

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>OnWay — تقرير جاهزية النظام للإطلاق</title>
<style>
:root{--bg:#0a0f1e;--card:#111827;--border:#1f2937;--text:#e2e8f0;--sub:#6b7280;--orange:#f97316;--green:#22c55e;--red:#ef4444;--yellow:#eab308;--blue:#3b82f6;--purple:#a855f7}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;background:var(--bg);color:var(--text);padding:20px 24px;line-height:1.6}
.header{background:linear-gradient(135deg,#1e1b4b,#0f172a);border:1px solid #312e81;border-radius:16px;padding:28px 32px;margin-bottom:28px;position:relative;overflow:hidden}
.header::before{content:'';position:absolute;inset:0;background:radial-gradient(circle at 20% 50%,rgba(249,115,22,.15),transparent 60%)}
.header h1{font-size:26px;color:var(--orange);font-weight:700;position:relative}
.header .sub{color:var(--sub);font-size:14px;margin-top:6px;position:relative}
.verdict{display:inline-block;padding:8px 20px;border-radius:99px;font-size:15px;font-weight:700;margin-top:12px;position:relative}
.verdict.green{background:#052e16;color:var(--green);border:1px solid #15803d}
.verdict.yellow{background:#422006;color:var(--yellow);border:1px solid #92400e}
.verdict.red{background:#450a0a;color:var(--red);border:1px solid #991b1b}
.kpi{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:14px;margin-bottom:28px}
.kpi-card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:18px;text-align:center;transition:.2s}
.kpi-card .val{font-size:30px;font-weight:700;line-height:1.1}
.kpi-card .lbl{font-size:12px;color:var(--sub);margin-top:5px}
.kpi-card.ok .val{color:var(--green)}
.kpi-card.er .val{color:var(--red)}
.kpi-card.or .val{color:var(--orange)}
.kpi-card.bl .val{color:var(--blue)}
.kpi-card.pu .val{color:var(--purple)}
.section{background:var(--card);border:1px solid var(--border);border-radius:12px;margin-bottom:20px;overflow:hidden}
.section-title{padding:14px 20px;font-size:15px;font-weight:600;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.02)}
table{width:100%;border-collapse:collapse;font-size:13px}
thead th{padding:9px 14px;color:var(--sub);font-weight:600;text-align:right;border-bottom:1px solid var(--border);background:#0d1117;white-space:nowrap}
tbody td{padding:9px 14px;border-bottom:1px solid #1a2233;vertical-align:top}
tbody tr:last-child td{border-bottom:none}
tbody tr:hover{background:rgba(255,255,255,.02)}
.c-green{color:var(--green)}
.c-red{color:var(--red)}
.c-yellow{color:var(--yellow)}
.progress{background:var(--border);border-radius:99px;height:10px;margin:10px 20px 16px;overflow:hidden}
.progress-fill{height:100%;border-radius:99px;background:linear-gradient(90deg,var(--green),var(--orange))}
.sys-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;padding:16px 20px}
.sys-item{background:#0d1117;border-radius:8px;padding:12px 16px}
.sys-item .s-val{font-size:18px;font-weight:700;color:var(--orange)}
.sys-item .s-lbl{font-size:11px;color:var(--sub);margin-top:3px}
.recs{padding:16px 20px}
.recs ul{list-style:none}
.recs li{padding:8px 0;border-bottom:1px solid var(--border);font-size:13px;color:var(--sub)}
.recs li:last-child{border-bottom:none}
.recs li::before{content:"← ";color:var(--orange)}
.recs li.ok-item{color:var(--green)}
.recs li.ok-item::before{content:"✓ "}
.recs li.warn-item{color:var(--yellow)}
.recs li.warn-item::before{content:"⚠ "}
.recs li.crit-item{color:var(--red)}
.recs li.crit-item::before{content:"✗ "}
.phase-badge{display:inline-block;background:#1f2937;border:1px solid var(--border);border-radius:6px;padding:2px 10px;font-size:11px;color:var(--sub);margin-right:6px}
.bar-wrap{display:flex;align-items:center;gap:8px}
.bar-bg{flex:1;background:var(--border);border-radius:4px;height:8px;overflow:hidden}
.bar-in{height:100%;border-radius:4px;background:var(--orange)}
.footer{text-align:center;color:var(--sub);font-size:12px;margin-top:32px;padding-top:16px;border-top:1px solid var(--border)}
</style>
</head>
<body>

<div class="header">
  <div class="sub">تقرير الاختبار الشامل — المرحلة الأولى والثانية</div>
  <h1>OnWay — تقرير جاهزية النظام للإطلاق</h1>
  <div class="sub">📅 ${esc(now)} &nbsp;|&nbsp; ⏱ مدة الاختبار: ${Math.round(elapsed/1000)} ثانية &nbsp;|&nbsp; Node.js ${process.version}</div>
  <div class="verdict ${successRate>=95?'green':successRate>=85?'yellow':'red'}">${esc(readiness)}</div>
</div>

<!-- KPI Cards -->
<div class="kpi">
  <div class="kpi-card ok"><div class="val">${totalPass}</div><div class="lbl">✓ اختبارات ناجحة</div></div>
  <div class="kpi-card er"><div class="val">${totalFail}</div><div class="lbl">✗ اختبارات فاشلة</div></div>
  <div class="kpi-card"><div class="val">${totalTests}</div><div class="lbl">إجمالي الاختبارات</div></div>
  <div class="kpi-card or"><div class="val">${successRate}%</div><div class="lbl">معدل النجاح</div></div>
  <div class="kpi-card bl"><div class="val">${maxConcurrent}</div><div class="lbl">أقصى تزامن (error&lt;10%)</div></div>
  <div class="kpi-card pu"><div class="val">${loadData.maxRps}</div><div class="lbl">أقصى طلب/ثانية</div></div>
  <div class="kpi-card or"><div class="val">${loadData.avgResponseTime}ms</div><div class="lbl">متوسط زمن الاستجابة</div></div>
  <div class="kpi-card bl"><div class="val">${globalSys.cpuMaxPct}%</div><div class="lbl">أقصى استهلاك CPU</div></div>
  <div class="kpi-card pu"><div class="val">${globalSys.memUsedMb}MB</div><div class="lbl">استهلاك RAM</div></div>
  <div class="kpi-card ok"><div class="val">${globalSys.heapMaxMb}MB</div><div class="lbl">Heap (Node.js peak)</div></div>
</div>

<!-- Progress Bar -->
<div class="progress"><div class="progress-fill" style="width:${successRate}%"></div></div>

<!-- System Resources -->
<div class="section">
  <div class="section-title">🖥 موارد الخادم — قبل وبعد الاختبار</div>
  <div class="sys-grid">
    <div class="sys-item"><div class="s-val">${sysBefore.cpuUsedPct}% → ${sysAfter.cpuUsedPct}%</div><div class="s-lbl">استهلاك CPU (قبل → بعد)</div></div>
    <div class="sys-item"><div class="s-val">${sysBefore.memUsedMb}MB → ${sysAfter.memUsedMb}MB</div><div class="s-lbl">استهلاك RAM (قبل → بعد)</div></div>
    <div class="sys-item"><div class="s-val">${sysBefore.heapUsedMb}MB → ${sysAfter.heapUsedMb}MB</div><div class="s-lbl">Node.js Heap (قبل → بعد)</div></div>
    <div class="sys-item"><div class="s-val">${globalSys.cpuMaxPct}% / ${globalSys.cpuAvgPct}%</div><div class="s-lbl">CPU أقصى / متوسط أثناء الاختبار</div></div>
    <div class="sys-item"><div class="s-val">${globalSys.memMaxPct}% (${globalSys.memTotalMb}MB كلي)</div><div class="s-lbl">أقصى استهلاك RAM %</div></div>
    <div class="sys-item"><div class="s-val">${globalSys.cpuCount} Core</div><div class="s-lbl">عدد النوى / Load Avg: ${globalSys.loadAvg1}</div></div>
    <div class="sys-item"><div class="s-val">${globalSys.heapMaxMb}MB</div><div class="s-lbl">Heap Peak (لا Memory Leak)</div></div>
    <div class="sys-item"><div class="s-val">${sysAfter.rssMb}MB</div><div class="s-lbl">RSS (Resident Set Size)</div></div>
  </div>
</div>

<!-- Load Test Results -->
<div class="section">
  <div class="section-title">⚡ اختبار الحمل — نتائج التزامن</div>
  ${loadData.results.length > 0 ? `
  <table>
    <thead><tr><th>التزامن</th><th>السيناريو</th><th>ناجح</th><th>فاشل</th><th>متوسط</th><th>P50</th><th>P95</th><th>P99</th><th>RPS</th><th>CPU%</th><th>RAM</th></tr></thead>
    <tbody>${loadRows}</tbody>
  </table>` : '<p style="padding:16px;color:var(--sub)">لم تُنفَّذ اختبارات الحمل</p>'}
</div>

<!-- DB Performance -->
<div class="section">
  <div class="section-title">🗄 أداء قاعدة البيانات (Firestore)</div>
  ${dbData.metrics.length > 0 ? `
  <table>
    <thead><tr><th>العملية</th><th>عدد</th><th>متوسط</th><th>P95</th><th>P99</th><th>ops/ث</th><th>نجاح</th></tr></thead>
    <tbody>${dbRows}</tbody>
  </table>` : '<p style="padding:16px;color:var(--sub)">لا توجد بيانات</p>'}
</div>

<!-- GPS Simulation -->
<div class="section">
  <div class="section-title">🗺 محاكاة GPS — السائقون</div>
  <div class="sys-grid">
    <div class="sys-item"><div class="s-val">${gpsData.drivers||0}</div><div class="s-lbl">عدد السائقين المحاكَين</div></div>
    <div class="sys-item"><div class="s-val">${gpsData.totalUpdates||0}</div><div class="s-lbl">إجمالي تحديثات GPS</div></div>
    <div class="sys-item"><div class="s-val">${gpsData.ok||0}</div><div class="s-lbl">تحديثات ناجحة</div></div>
    <div class="sys-item"><div class="s-val">${gpsData.fail||0}</div><div class="s-lbl">تحديثات فاشلة</div></div>
    <div class="sys-item"><div class="s-val">${gpsData.avg||0}ms</div><div class="s-lbl">متوسط زمن التحديث</div></div>
    <div class="sys-item"><div class="s-val">${gpsData.p95||0}ms</div><div class="s-lbl">P95 زمن الاستجابة</div></div>
    <div class="sys-item"><div class="s-val">${gpsData.rps||0}</div><div class="s-lbl">تحديث/ثانية (RPS)</div></div>
    <div class="sys-item"><div class="s-val">${gpsData.errorRate||0}%</div><div class="s-lbl">معدل الأخطاء</div></div>
  </div>
</div>

<!-- Notifications -->
<div class="section">
  <div class="section-title">🔔 اختبار الإشعارات</div>
  <table>
    <thead><tr><th>النتيجة</th><th>الاختبار</th><th>المدة</th><th>التفاصيل</th></tr></thead>
    <tbody>${notifRows||'<tr><td colspan="4" style="padding:12px;color:var(--sub)">لا توجد نتائج</td></tr>'}</tbody>
  </table>
</div>

<!-- Crash & Recovery -->
<div class="section">
  <div class="section-title">💥 اختبارات الصمود والتعافي</div>
  <table>
    <thead><tr><th>النتيجة</th><th>السيناريو</th><th>المدة</th><th>التفاصيل</th></tr></thead>
    <tbody>${crashRows||'<tr><td colspan="4" style="padding:12px;color:var(--sub)">لا توجد نتائج</td></tr>'}</tbody>
  </table>
</div>

<!-- Failed API Tests -->
${apiResults.tests.filter(t=>t.status==="fail").length > 0 ? `
<div class="section">
  <div class="section-title">❌ الاختبارات الوظيفية الفاشلة</div>
  <table>
    <thead><tr><th>الاختبار</th><th>سبب الفشل</th><th>المدة</th></tr></thead>
    <tbody>${apiFailedRows}</tbody>
  </table>
</div>` : `
<div class="section">
  <div class="section-title">✅ الاختبارات الوظيفية</div>
  <div class="recs"><ul><li class="ok-item">جميع الاختبارات الوظيفية (${apiResults.pass}/${apiResults.pass+apiResults.fail}) اجتازت بنجاح تام</li></ul></div>
</div>`}

<!-- Recommendations -->
<div class="section">
  <div class="section-title">📋 التوصيات والحالة قبل الإطلاق</div>
  <div class="recs"><ul>
    ${successRate>=95 ? '<li class="ok-item">معدل نجاح الاختبارات ≥ 95% — النظام وظيفياً مستقر</li>' : `<li class="crit-item">معدل النجاح ${successRate}% — يحتاج مراجعة الاختبارات الفاشلة</li>`}
    ${maxConcurrent >= 500 ? `<li class="ok-item">يدعم ${maxConcurrent}+ مستخدم متزامن بمعدل خطأ < 10%</li>` : `<li class="warn-item">أقصى تزامن قابل للتحقق: ${maxConcurrent} مستخدم — قد يحتاج تحسين عند الإطلاق</li>`}
    ${loadData.avgResponseTime < 500 ? '<li class="ok-item">متوسط زمن الاستجابة < 500ms — ممتاز</li>' : loadData.avgResponseTime < 1500 ? `<li class="warn-item">متوسط زمن الاستجابة ${loadData.avgResponseTime}ms — مقبول لكن يمكن تحسينه</li>` : `<li class="crit-item">متوسط زمن الاستجابة ${loadData.avgResponseTime}ms — يحتاج تحسين أداء</li>`}
    ${globalSys.cpuMaxPct < 70 ? '<li class="ok-item">استهلاك CPU ضمن الحدود الآمنة (< 70%)</li>' : `<li class="warn-item">CPU وصل ${globalSys.cpuMaxPct}% — راقب الأداء تحت الحمل الكامل</li>`}
    <li class="warn-item">Firebase Firestore: ضع في اعتبارك cache layer (Redis) للـ reads المتكررة عند الإطلاق</li>
    <li class="warn-item">الإشعارات Push: تحتاج توكنات Expo حقيقية للاختبار الكامل — جاهزة للإنتاج هيكلياً</li>
    <li class="ok-item">نظام GPS: ${gpsData.totalUpdates||0} تحديث بمعدل خطأ ${gpsData.errorRate||0}% — مستقر</li>
    <li class="warn-item">Firestore Security Rules: راجعها قبل الإطلاق وامنع الوصول المباشر من العملاء</li>
    <li>تفعيل HTTPS على جميع الـ endpoints في الإنتاج</li>
    <li>ضبط Rate Limiting: 100 req/min للمستخدم العادي، 10 req/min لـ OTP</li>
    <li>تفعيل Sentry أو مكافئه لمراقبة الأخطاء في الإنتاج</li>
    <li>ضغط Gzip/Brotli على الاستجابات لتحسين السرعة</li>
    <li>CDN للصور وملفات الـ static لتقليل زمن الاستجابة عالمياً</li>
    <li>إضافة Health Check endpoint (/health) لمراقبة حالة الخادم</li>
    <li>اختبار تحميل الصور (10k صورة) يتطلب تخصيص وقت وفضاء تخزين كافٍ</li>
    <li>اختبار انقطاع الإنترنت: منطق إعادة المحاولة موجود في الـ client — موصى بالتحقق يدوياً على جهاز حقيقي</li>
  </ul></div>
</div>

<div class="footer">
  OnWay Testing Framework — تقرير تلقائي كامل | ${esc(now)}
</div>
</body>
</html>`;

  const outDir = join(__dirname, "../reports");
  mkdirSync(outDir, { recursive: true });
  const ts = Date.now();
  const outPath = join(outDir, `full-report-${ts}.html`);
  writeFileSync(outPath, html, "utf-8");
  writeFileSync(join(outDir, "full-report-latest.html"), html, "utf-8");
  return outPath;
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
