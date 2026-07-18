/**
 * Delete ALL test data seeded by scripts/seed-test-data.mjs.
 * Removes every document carrying `__seed: true` from the seeded collections.
 * Real (non-seed) data is never touched.
 *
 * Run:  node scripts/clean-test-data.mjs        (needs FIREBASE_SERVICE_ACCOUNT)
 */
import admin from "firebase-admin";

const svc = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!svc) {
  console.error("✗ FIREBASE_SERVICE_ACCOUNT غير مضبوط.");
  process.exit(1);
}
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(svc)) });
}
const db = admin.firestore();

// Every collection the seeder can write to.
const COLLECTIONS = ["vendors", "vendorProducts", "banners", "products", "drivers", "orders", "deliveryAreas"];

async function run() {
  let total = 0;
  for (const col of COLLECTIONS) {
    const snap = await db.collection(col).where("__seed", "==", true).get();
    if (snap.empty) continue;
    // delete in chunks of 400 (Firestore batch limit is 500)
    let docs = snap.docs;
    while (docs.length) {
      const chunk = docs.slice(0, 400);
      docs = docs.slice(400);
      const batch = db.batch();
      chunk.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      total += chunk.length;
    }
    console.log(`  ✓ ${col}: حُذف ${snap.size}`);
  }
  console.log(`✓ تم حذف ${total} مستنداً تجريبياً. البيانات الحقيقية لم تُمَس.`);
  process.exit(0);
}

run().catch((e) => { console.error("✗ فشل:", e.message); process.exit(1); });
