#!/usr/bin/env node
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { results, BASE_URL } from "./utils/helpers.mjs";
import { runPublicTests } from "./api/01-public.test.mjs";
import { runCustomerTests } from "./api/02-customer.test.mjs";
import { runVendorTests } from "./api/03-vendor.test.mjs";
import { runDriverTests } from "./api/04-driver.test.mjs";
import { runAdminTests } from "./api/05-admin.test.mjs";
import { runE2ETests } from "./api/06-e2e.test.mjs";
import { runSecurityTests } from "./api/07-security.test.mjs";
import { runLoadTests, runStressTest } from "./load/load-test.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function checkServerUp() {
  try {
    const r = await fetch(`${BASE_URL}/api/categories`, { signal: AbortSignal.timeout(5000) });
    return r.ok;
  } catch {
    return false;
  }
}

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  OnWay — نظام الاختبار الشامل");
  console.log("═══════════════════════════════════════════════════");
  console.log(`  Server: ${BASE_URL}`);
  console.log(`  Time: ${new Date().toLocaleString("ar-IQ")}\n`);

  const up = await checkServerUp();
  if (!up) {
    console.error("  ✗ الخادم غير متاح على المنفذ 5000!");
    console.error("  تأكد من تشغيل: npm run server:prod");
    process.exit(1);
  }
  console.log("  ✓ الخادم يعمل\n");

  const args = process.argv.slice(2);
  const runAll = args.length === 0;
  const runLoad = args.includes("--load") || runAll;
  const runStress = args.includes("--stress") || runAll;
  const apiOnly = args.includes("--api");

  let loadResults = [];
  let stressResults = [];

  try {
    await runPublicTests();
  } catch (e) { console.error("Suite error:", e.message); }

  try {
    await runCustomerTests();
  } catch (e) { console.error("Suite error:", e.message); }

  try {
    await runVendorTests();
  } catch (e) { console.error("Suite error:", e.message); }

  try {
    await runDriverTests();
  } catch (e) { console.error("Suite error:", e.message); }

  try {
    await runAdminTests();
  } catch (e) { console.error("Suite error:", e.message); }

  try {
    await runE2ETests();
  } catch (e) { console.error("Suite error:", e.message); }

  try {
    await runSecurityTests();
  } catch (e) { console.error("Suite error:", e.message); }

  if (!apiOnly && runLoad) {
    try {
      loadResults = await runLoadTests();
    } catch (e) { console.error("Load test error:", e.message); }
  }

  if (!apiOnly && runStress) {
    try {
      stressResults = await runStressTest();
    } catch (e) { console.error("Stress test error:", e.message); }
  }

  const elapsed = Date.now() - results.startTime;
  const total = results.pass + results.fail;

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  📊 ملخص النتائج النهائية");
  console.log("═══════════════════════════════════════════════════");
  console.log(`  إجمالي الاختبارات: ${total}`);
  console.log(`  ✓ ناجح: ${results.pass}`);
  console.log(`  ✗ فاشل: ${results.fail}`);
  console.log(`  معدل النجاح: ${total > 0 ? Math.round((results.pass / total) * 100) : 0}%`);
  console.log(`  المدة: ${(elapsed / 1000).toFixed(1)}s`);

  const reportPath = generateHtmlReport(results, loadResults, stressResults, elapsed);
  console.log(`\n  📄 تقرير HTML: ${reportPath}`);
  console.log("═══════════════════════════════════════════════════\n");

  process.exit(results.fail > 0 ? 1 : 0);
}

function generateHtmlReport(results, loadResults, stressResults, elapsed) {
  const total = results.pass + results.fail;
  const successRate = total > 0 ? Math.round((results.pass / total) * 100) : 0;
  const now = new Date().toLocaleString("ar-IQ");

  const testRows = results.tests.map(t => {
    const icon = t.status === "pass" ? "✓" : "✗";
    const cls = t.status === "pass" ? "pass" : "fail";
    const err = t.error ? `<br><small class="error-msg">${escHtml(t.error)}</small>` : "";
    return `<tr class="${cls}"><td>${icon}</td><td>${escHtml(t.name)}</td><td>${t.ms}ms</td>${err ? `<td>${err}</td>` : "<td>—</td>"}</tr>`;
  }).join("\n");

  const loadRows = loadResults.map(r =>
    `<tr><td>${escHtml(r.label)}</td><td>${r.n}</td><td class="${r.fail === 0 ? "pass" : "warn"}">${r.ok}</td><td>${r.fail}</td><td>${r.avg}ms</td><td>${r.p50}ms</td><td>${r.p95}ms</td><td>${r.p99}ms</td><td>${r.rps}</td></tr>`
  ).join("\n");

  const stressRows = stressResults.map(r =>
    `<tr><td>${r.level}</td><td>${escHtml(r.label)}</td><td class="${r.fail === 0 ? "pass" : "warn"}">${r.ok}</td><td>${r.fail}</td><td>${r.p95}ms</td><td>${r.p99}ms</td><td>${r.rps}</td></tr>`
  ).join("\n");

  const failedTests = results.tests.filter(t => t.status === "fail");
  const failedSection = failedTests.length > 0 ? `
    <h2>❌ الاختبارات الفاشلة</h2>
    <table>
      <thead><tr><th>الاختبار</th><th>السبب</th></tr></thead>
      <tbody>
        ${failedTests.map(t => `<tr class="fail"><td>${escHtml(t.name)}</td><td class="error-msg">${escHtml(t.error || "")}</td></tr>`).join("\n")}
      </tbody>
    </table>` : "<p style='color:#10b981;font-weight:bold'>✓ جميع الاختبارات نجحت!</p>";

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>OnWay — تقرير الاختبار الشامل</title>
<style>
  :root { --orange:#E86520; --green:#10b981; --red:#ef4444; --yellow:#f59e0b; --bg:#0f172a; --card:#1e293b; --text:#e2e8f0; --sub:#94a3b8; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'Segoe UI',Tahoma,sans-serif; background:var(--bg); color:var(--text); padding:24px; }
  h1 { color:var(--orange); font-size:28px; margin-bottom:4px; }
  h2 { color:var(--text); font-size:18px; margin:28px 0 12px; border-right:4px solid var(--orange); padding-right:10px; }
  .meta { color:var(--sub); font-size:14px; margin-bottom:28px; }
  .summary { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:16px; margin-bottom:32px; }
  .card { background:var(--card); border-radius:12px; padding:20px; text-align:center; }
  .card .num { font-size:36px; font-weight:700; }
  .card .lbl { font-size:13px; color:var(--sub); margin-top:4px; }
  .card.ok .num { color:var(--green); }
  .card.err .num { color:var(--red); }
  .card.rate .num { color:var(--orange); }
  .card.time .num { color:#60a5fa; }
  table { width:100%; border-collapse:collapse; background:var(--card); border-radius:10px; overflow:hidden; margin-bottom:24px; font-size:14px; }
  thead th { background:#0f172a; padding:10px 14px; color:var(--sub); font-weight:600; text-align:right; }
  tbody tr:nth-child(even) { background:#162032; }
  td { padding:9px 14px; border-bottom:1px solid #1e293b; }
  tr.pass td:first-child { color:var(--green); font-weight:700; }
  tr.fail td:first-child { color:var(--red); font-weight:700; }
  tr.warn td { color:var(--yellow); }
  .pass { color:var(--green); }
  .fail { color:var(--red); }
  .warn { color:var(--yellow); }
  .error-msg { color:#fb7185; font-size:12px; }
  .progress-bar { background:#1e293b; border-radius:99px; height:12px; margin-bottom:24px; overflow:hidden; }
  .progress-fill { height:100%; background:linear-gradient(90deg,var(--green),var(--orange)); border-radius:99px; transition:width .5s; }
  .badge { display:inline-block; padding:2px 10px; border-radius:99px; font-size:12px; font-weight:600; }
  .badge-pass { background:#052e16; color:var(--green); }
  .badge-fail { background:#450a0a; color:var(--red); }
  .recs { background:var(--card); border-radius:10px; padding:20px; }
  .recs li { margin:8px 0; color:var(--sub); font-size:14px; }
  .recs li::before { content:"→ "; color:var(--orange); }
</style>
</head>
<body>
<h1>OnWay — تقرير الاختبار الشامل</h1>
<p class="meta">تاريخ التشغيل: ${now} | المدة الإجمالية: ${(elapsed/1000).toFixed(1)} ثانية</p>

<div class="summary">
  <div class="card ok"><div class="num">${results.pass}</div><div class="lbl">✓ ناجح</div></div>
  <div class="card err"><div class="num">${results.fail}</div><div class="lbl">✗ فاشل</div></div>
  <div class="card"><div class="num">${total}</div><div class="lbl">إجمالي الاختبارات</div></div>
  <div class="card rate"><div class="num">${successRate}%</div><div class="lbl">معدل النجاح</div></div>
  <div class="card time"><div class="num">${(elapsed/1000).toFixed(1)}s</div><div class="lbl">وقت التنفيذ</div></div>
</div>

<div class="progress-bar"><div class="progress-fill" style="width:${successRate}%"></div></div>

${failedSection}

<h2>📋 نتائج الاختبارات التفصيلية</h2>
<table>
  <thead><tr><th>النتيجة</th><th>اسم الاختبار</th><th>المدة</th><th>التفاصيل</th></tr></thead>
  <tbody>${testRows}</tbody>
</table>

${loadResults.length > 0 ? `
<h2>⚡ نتائج اختبار الحمل (Load Test)</h2>
<table>
  <thead><tr><th>السيناريو</th><th>العدد</th><th>نجح</th><th>فشل</th><th>متوسط</th><th>P50</th><th>P95</th><th>P99</th><th>RPS</th></tr></thead>
  <tbody>${loadRows}</tbody>
</table>` : ""}

${stressResults.length > 0 ? `
<h2>💥 نتائج اختبار الضغط (Stress Test)</h2>
<table>
  <thead><tr><th>المستوى</th><th>السيناريو</th><th>نجح</th><th>فشل</th><th>P95</th><th>P99</th><th>RPS</th></tr></thead>
  <tbody>${stressRows}</tbody>
</table>` : ""}

<h2>🔍 التوصيات</h2>
<div class="recs">
<ul>
${results.fail > 0 ? `<li>إصلاح ${results.fail} اختبار فاشل قبل النشر</li>` : "<li>جميع الاختبارات الوظيفية تعمل بشكل صحيح</li>"}
${loadResults.some(r => r.p95 > 2000) ? "<li>تحسين أداء بعض الـ APIs (P95 > 2 ثانية)</li>" : "<li>أداء الـ API مقبول لجميع نقاط النهاية</li>"}
${loadResults.some(r => r.fail > 0) ? "<li>فحص استقرار الخادم تحت الحمل الزائد</li>" : "<li>الخادم مستقر تحت الحمل الاختباري</li>"}
<li>تفعيل HTTPS وضبط CORS قبل الإطلاق الإنتاجي</li>
<li>ضبط Rate Limiting على نقاط التسجيل ووالمصادقة</li>
<li>تفعيل Firebase Security Rules لحماية البيانات المباشرة</li>
<li>مراجعة وقت انتهاء JWT للتجار والسائقين</li>
<li>تفعيل مراقبة الأخطاء (Sentry) في الإنتاج</li>
</ul>
</div>

<p style="text-align:center;color:var(--sub);margin-top:32px;font-size:13px">OnWay Testing Framework — تشغيل تلقائي</p>
</body>
</html>`;

  const outDir = join(__dirname, "reports");
  mkdirSync(outDir, { recursive: true });
  const filename = `report-${Date.now()}.html`;
  const outPath = join(outDir, filename);
  writeFileSync(outPath, html, "utf-8");
  writeFileSync(join(outDir, "latest.html"), html, "utf-8");
  return outPath;
}

function escHtml(s) {
  return String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
