/**
 * OnWay — Production Demo Data Cleanup Script
 *
 * Deletes all demo/test data from Firestore before production launch:
 *   - Demo vendors (stores) with demo_ IDs or demo phone numbers
 *   - All products belonging to those vendors
 *   - Demo/test users
 *   - Demo/test drivers
 *   - Test orders (optional, controlled by DELETE_TEST_ORDERS flag)
 *
 * Usage:
 *   node scripts/cleanup-demo-data.mjs
 *
 * Set DRY_RUN=true to preview what would be deleted without actually deleting:
 *   DRY_RUN=true node scripts/cleanup-demo-data.mjs
 *
 * Set DELETE_TEST_ORDERS=true to also delete orders (use with caution!):
 *   DELETE_TEST_ORDERS=true node scripts/cleanup-demo-data.mjs
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const DRY_RUN = process.env.DRY_RUN === "true";
const DELETE_TEST_ORDERS = process.env.DELETE_TEST_ORDERS === "true";

// ── Initialize Firebase Admin ────────────────────────────────────────────────
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!serviceAccount) {
  console.error("[FATAL] FIREBASE_SERVICE_ACCOUNT env var is not set.");
  process.exit(1);
}

let parsedSA;
try {
  parsedSA = JSON.parse(serviceAccount);
} catch {
  console.error("[FATAL] FIREBASE_SERVICE_ACCOUNT is not valid JSON.");
  process.exit(1);
}

initializeApp({ credential: cert(parsedSA) });
const db = getFirestore();

// ── Demo identifier patterns ──────────────────────────────────────────────────
// Add or extend these lists as needed
const DEMO_PHONE_PREFIXES = ["07700000", "0770000000", "07900000"];
const DEMO_VENDOR_ID_PREFIXES = ["demo_"];
const DEMO_VENDOR_NAMES = ["مطعم الرائد العراقي", "سوبرماركت اون واي", "صيدلية الشفاء"];
const DEMO_USER_PHONES = ["07700000001", "07700000002", "07700000003", "07800000001"];

function isDemoPhone(phone = "") {
  return DEMO_PHONE_PREFIXES.some((p) => phone.startsWith(p));
}

function isDemoVendorId(id = "") {
  return DEMO_VENDOR_ID_PREFIXES.some((p) => id.startsWith(p));
}

async function deleteDocs(collection, docs, label) {
  if (docs.length === 0) {
    console.log(`  ✅ No ${label} found — nothing to delete.`);
    return 0;
  }

  console.log(`  🗑️  ${DRY_RUN ? "[DRY RUN] Would delete" : "Deleting"} ${docs.length} ${label}:`);
  for (const doc of docs) {
    const data = doc.data();
    const name = data.storeName || data.name || data.fullName || data.phoneNumber || doc.id;
    console.log(`       → [${doc.id}] ${name}`);
  }

  if (!DRY_RUN) {
    const batchSize = 400;
    for (let i = 0; i < docs.length; i += batchSize) {
      const batch = db.batch();
      docs.slice(i, i + batchSize).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }
  return docs.length;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  OnWay — Demo Data Cleanup");
  console.log(`  Mode: ${DRY_RUN ? "DRY RUN (no changes)" : "LIVE — will delete data"}`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  let totalDeleted = 0;

  // ── 1. Find demo vendors ───────────────────────────────────────────────────
  console.log("📦 Step 1: Scanning vendors collection...");
  const vendorsSnap = await db.collection("vendors").get();
  const demoVendors = vendorsSnap.docs.filter((d) => {
    const data = d.data();
    const id = data.id || d.id;
    const phone = data.phoneNumber || "";
    const name = data.storeName || "";
    return (
      isDemoVendorId(id) ||
      isDemoPhone(phone) ||
      DEMO_VENDOR_NAMES.includes(name)
    );
  });

  const demoVendorIds = new Set(demoVendors.map((d) => d.data().id || d.id));
  console.log(`  Found ${demoVendors.length} demo vendor(s): ${[...demoVendorIds].join(", ") || "none"}`);
  totalDeleted += await deleteDocs("vendors", demoVendors, "demo vendors");

  // ── 2. Delete products belonging to demo vendors ───────────────────────────
  console.log("\n🛒 Step 2: Scanning vendorProducts collection...");
  const productsSnap = await db.collection("vendorProducts").get();
  const demoProducts = productsSnap.docs.filter((d) => {
    const data = d.data();
    return (
      demoVendorIds.has(data.vendorId) ||
      isDemoPhone(data.vendorPhone || "")
    );
  });
  totalDeleted += await deleteDocs("vendorProducts", demoProducts, "demo vendor products");

  // ── 3. Delete demo users ───────────────────────────────────────────────────
  console.log("\n👤 Step 3: Scanning users collection...");
  const usersSnap = await db.collection("users").get();
  const demoUsers = usersSnap.docs.filter((d) => {
    const data = d.data();
    const phone = data.phoneNumber || d.id;
    return isDemoPhone(phone) || DEMO_USER_PHONES.includes(phone);
  });
  totalDeleted += await deleteDocs("users", demoUsers, "demo users");

  // ── 4. Delete demo drivers ─────────────────────────────────────────────────
  console.log("\n🚗 Step 4: Scanning drivers collection...");
  const driversSnap = await db.collection("drivers").get();
  const demoDrivers = driversSnap.docs.filter((d) => {
    const data = d.data();
    const phone = data.phoneNumber || "";
    return isDemoPhone(phone) || DEMO_USER_PHONES.includes(phone);
  });
  totalDeleted += await deleteDocs("drivers", demoDrivers, "demo drivers");

  // ── 5. (Optional) Delete test orders ──────────────────────────────────────
  if (DELETE_TEST_ORDERS) {
    console.log("\n📋 Step 5: Scanning orders collection...");
    const ordersSnap = await db.collection("orders").get();
    const testOrders = ordersSnap.docs.filter((d) => {
      const data = d.data();
      const phone = data.phoneNumber || data.customerPhone || "";
      const vendorId = data.vendorId || "";
      return isDemoPhone(phone) || demoVendorIds.has(vendorId);
    });
    totalDeleted += await deleteDocs("orders", testOrders, "test orders");
  } else {
    console.log("\n📋 Step 5: Skipping orders (set DELETE_TEST_ORDERS=true to include).");
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════════════");
  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would delete ${totalDeleted} document(s) total.`);
    console.log("  Run without DRY_RUN=true to apply changes.");
  } else {
    console.log(`  ✅ Cleanup complete — deleted ${totalDeleted} document(s).`);
  }
  console.log("═══════════════════════════════════════════════════════════════");
}

main().catch((e) => {
  console.error("[FATAL] Cleanup failed:", e);
  process.exit(1);
});
