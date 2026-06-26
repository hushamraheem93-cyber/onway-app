/**
 * Cleanup: يحذف الأقسام التي أضافها seed-data.ts فقط
 * ويُصلح categoryType للمتاجر لتظهر في التطبيق
 * Run: npx ts-node --project tsconfig.json server/cleanup-seed-categories.ts
 */

import admin from "firebase-admin";
import * as dotenv from "dotenv";
dotenv.config();

function initDB(): admin.firestore.Firestore {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!json) throw new Error("FIREBASE_SERVICE_ACCOUNT env var is missing");
  const sa = JSON.parse(json);
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(sa) });
  }
  const db = admin.firestore();
  db.settings({ ignoreUndefinedProperties: true });
  return db;
}

const db = initDB();

// IDs الأقسام التي أضافها السكريبت
const SEED_CATEGORY_IDS = [
  "restaurants", "burgers", "pizza", "grills", "chicken", "shawarma",
  "sweets", "bakery", "cafe", "juices", "supermarket", "grocery",
  "fruits-vegetables", "meat-fish", "pharmacy", "cosmetics", "household",
  "gifts", "food-supplies", "dairy-eggs",
];

// categoryTypes التي لا تظهر في أي تاب على الهوم سكرين
const HIDDEN_TYPES = ["grocery", "cafe", "pharmacy"];

async function main() {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🧹 تنظيف الأقسام وإصلاح المتاجر...");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // 1. حذف الأقسام المضافة
  let deleted = 0;
  for (const id of SEED_CATEGORY_IDS) {
    const ref = db.collection("categories").doc(id);
    const snap = await ref.get();
    if (snap.exists) {
      await ref.delete();
      deleted++;
      console.log(`  🗑  حُذف القسم: ${snap.data()?.name || id}`);
    }
  }
  console.log(`\n✅ حُذف ${deleted} قسم`);

  // 2. إصلاح المتاجر ذات categoryType غير المرئية → store
  console.log("\n🔧 إصلاح categoryType للمتاجر...");
  let fixed = 0;
  for (const type of HIDDEN_TYPES) {
    const snap = await db.collection("vendors").where("categoryType", "==", type).get();
    for (const doc of snap.docs) {
      await doc.ref.update({ categoryType: "store" });
      fixed++;
      console.log(`  ✓ ${doc.data().name} → store`);
    }
  }
  console.log(`\n✅ أُصلح ${fixed} متجر`);

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  process.exit(0);
}

main().catch(err => {
  console.error("❌ خطأ:", err.message);
  process.exit(1);
});
