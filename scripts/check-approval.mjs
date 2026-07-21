/**
 * تشخيص شامل: يطبع حالة كل السائقين والتجّار مباشرة من Firestore.
 * الاستخدام:  node scripts/check-approval.mjs
 *
 * يجيب على السؤال الحاسم بعد ضغط "موافقة" من لوحة التحكم:
 *   هل انكتبت الحالة فعلاً في قاعدة البيانات؟
 *   - السائق المعتمد يجب أن يظهر status: approved
 *   - التاجر المعتمد يجب أن يظهر status: active
 * إن ظهرت الحالة الصحيحة هنا لكن التطبيق ما زال يعرض "قيد المراجعة"،
 * فالمشكلة في نسخة التطبيق القديمة على الهاتف (يحتاج إعادة تحميل الحزمة)،
 * وليست في الخادم أو قاعدة البيانات.
 */
import admin from "firebase-admin";

const svc = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!svc) { console.error("✗ FIREBASE_SERVICE_ACCOUNT غير موجود"); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(svc)) });
const db = admin.firestore();

const ts = (v) => v?.toDate?.()?.toISOString?.() || v || "-";

console.log("═══════════════════ السائقون (drivers) ═══════════════════");
const dsnap = await db.collection("drivers").get();
if (dsnap.empty) {
  console.log("لا يوجد سائقون مسجلون.");
} else {
  console.log(`العدد: ${dsnap.size}   (المعتمد يجب أن يكون status: approved)\n`);
  for (const d of dsnap.docs) {
    const x = d.data();
    const ok = x.status === "approved" ? "✅" : "⏳";
    console.log(`${ok} ${x.fullName || "?"} | ${x.phoneNumber || "?"}`);
    console.log(`   docId: ${d.id}`);
    console.log(`   status: ${x.status || "غير موجود!"} | updatedAt: ${ts(x.updatedAt)}\n`);
  }
}

console.log("═══════════════════ التجّار (vendors) ═══════════════════");
const vsnap = await db.collection("vendors").get();
if (vsnap.empty) {
  console.log("لا يوجد تجّار مسجلون.");
} else {
  console.log(`العدد: ${vsnap.size}   (المعتمد يجب أن يكون status: active)\n`);
  for (const v of vsnap.docs) {
    const x = v.data();
    const ok = x.status === "active" ? "✅" : "⏳";
    console.log(`${ok} ${x.storeName || x.ownerName || "?"} | ${x.phoneNumber || "?"}`);
    console.log(`   docId: ${v.id}`);
    console.log(`   status: ${x.status || "غير موجود!"} | approvedAt: ${ts(x.approvedAt)} | updatedAt: ${ts(x.updatedAt)}\n`);
  }
}

process.exit(0);
