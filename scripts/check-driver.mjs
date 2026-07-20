/**
 * تشخيص: يطبع كل السائقين وحالتهم مباشرة من Firestore.
 * الاستخدام:  node scripts/check-driver.mjs
 * يجيب على السؤال الحاسم: هل موافقة الأدمن انكتبت فعلاً بقاعدة البيانات؟
 */
import admin from "firebase-admin";

const svc = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!svc) { console.error("✗ FIREBASE_SERVICE_ACCOUNT غير موجود"); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(svc)) });
const db = admin.firestore();

const snap = await db.collection("drivers").get();
if (snap.empty) { console.log("لا يوجد سائقون مسجلون إطلاقاً!"); process.exit(0); }

console.log(`عدد السائقين: ${snap.size}\n`);
for (const d of snap.docs) {
  const x = d.data();
  console.log(`— docId: ${d.id}`);
  console.log(`  الاسم: ${x.fullName || "?"} | الهاتف: ${x.phoneNumber || "?"}`);
  console.log(`  الحالة (status): ${x.status || "غير موجود!"} | updatedAt: ${x.updatedAt?.toDate?.()?.toISOString?.() || x.updatedAt || "-"}\n`);
}
process.exit(0);
