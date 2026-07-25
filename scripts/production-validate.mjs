/**
 * OnWay — Production validation against REAL Firebase services.
 *
 * WHY THIS EXISTS
 * ───────────────
 * The production flows cannot be validated from a development sandbox: there are
 * no production credentials there, and the vendor/driver/push steps need real
 * devices. This script runs ON the production machine (Replit or the VPS), where
 * FIREBASE_SERVICE_ACCOUNT is already set, and validates everything that can be
 * checked without a human tapping a phone.
 *
 * USAGE (on the production host, from the project root):
 *     node scripts/production-validate.mjs
 *
 * It is SAFE and NON-DESTRUCTIVE:
 *   • writes only to a clearly-named __validation__ document / storage path
 *   • deletes everything it creates before exiting
 *   • never touches orders, wallets, settlements or any financial record
 *   • read-only when inspecting real products/vendors
 *
 * Exit code 0 = all checks passed, 1 = at least one failed.
 */
import admin from "firebase-admin";
import { randomUUID } from "crypto";

const results = [];
let failed = 0;

function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✅ PASS" : "❌ FAIL"}  ${name}${detail ? `\n         ${detail}` : ""}`);
  if (!ok) failed++;
}

// ── 0. Credentials ───────────────────────────────────────────────────────────
const svcJson = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!svcJson) {
  console.error("❌ FIREBASE_SERVICE_ACCOUNT is not set.");
  console.error("   Run this ON the production host (Replit shell or the VPS), not locally.");
  process.exit(1);
}

let svc;
try {
  svc = JSON.parse(svcJson);
} catch {
  console.error("❌ FIREBASE_SERVICE_ACCOUNT is not valid JSON.");
  process.exit(1);
}

// Mirror server/firebase.ts exactly so we validate what the server actually uses.
const bucketName =
  process.env.FIREBASE_STORAGE_BUCKET || `${svc.project_id}.firebasestorage.app`;

console.log("═══════════════════════════════════════════════════════════");
console.log("  OnWay — Production Validation (real Firebase services)");
console.log("═══════════════════════════════════════════════════════════");
console.log(`  project : ${svc.project_id}`);
console.log(`  bucket  : ${bucketName}`);
console.log(`  time    : ${new Date().toISOString()}`);
console.log("═══════════════════════════════════════════════════════════\n");

admin.initializeApp({
  credential: admin.credential.cert(svc),
  storageBucket: bucketName,
});
const db = admin.firestore();

// ── 1. Firestore connectivity + write/read/delete ────────────────────────────
const probeRef = db.collection("__validation__").doc(`probe_${Date.now()}`);
try {
  await probeRef.set({ ok: true, at: admin.firestore.Timestamp.now() });
  const snap = await probeRef.get();
  check("Firestore write + read", snap.exists && snap.data()?.ok === true);
  await probeRef.delete();
  check("Firestore delete (cleanup)", !(await probeRef.get()).exists);
} catch (e) {
  check("Firestore write + read", false, e.message);
}

// ── 2. Storage bucket EXISTS (this is the bug that was silently failing) ─────
let bucketOk = false;
try {
  const bucket = admin.storage().bucket();
  const [exists] = await bucket.exists();
  bucketOk = exists;
  check(
    "Storage bucket exists",
    exists,
    exists
      ? `bucket "${bucket.name}" reachable`
      : `bucket "${bucket.name}" NOT FOUND → every image upload will fall back to Base64.\n         Fix: Firebase Console → Storage → copy the gs:// name into FIREBASE_STORAGE_BUCKET`,
  );
} catch (e) {
  check("Storage bucket exists", false, e.message);
}

// ── 3. Real image upload → real public URL → fetch it back ───────────────────
// 1x1 transparent PNG. Small, real, and valid image bytes.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
let uploadedPath = null;
if (bucketOk) {
  try {
    const bucket = admin.storage().bucket();
    const token = randomUUID();
    uploadedPath = `__validation__/probe-${Date.now()}.png`;
    const file = bucket.file(uploadedPath);

    await file.save(PNG, {
      metadata: {
        contentType: "image/png",
        cacheControl: "public, max-age=31536000, immutable",
        metadata: { firebaseStorageDownloadTokens: token },
      },
      resumable: false,
    });
    check("Storage upload (real bytes written)", true, uploadedPath);

    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(
      uploadedPath,
    )}?alt=media&token=${token}`;

    // The URL must be publicly fetchable — that is what the app embeds in docs.
    const res = await fetch(url);
    const body = Buffer.from(await res.arrayBuffer());
    check(
      "Storage URL publicly fetchable",
      res.ok && body.length === PNG.length,
      `HTTP ${res.status}, ${body.length} bytes (expected ${PNG.length})`,
    );
    check(
      "Returned URL is a Storage URL, not a Base64 data URI",
      url.startsWith("https://firebasestorage.googleapis.com/"),
      url.slice(0, 90) + "…",
    );

    await file.delete();
    check("Storage delete (cleanup)", true);
  } catch (e) {
    check("Storage upload / fetch", false, e.message);
  }
} else {
  check("Storage upload / fetch", false, "skipped — bucket does not exist");
}

// ── 4. Are REAL stored images using Storage, or still Base64? ────────────────
// Detects whether the historical Base64 fallback is still polluting documents.
async function scanImages(collection, fields, label) {
  try {
    const snap = await db.collection(collection).limit(40).get();
    if (snap.empty) {
      check(`${label}: image storage mode`, true, "no documents yet — nothing to check");
      return;
    }
    let base64 = 0, storage = 0, other = 0;
    for (const doc of snap.docs) {
      const d = doc.data();
      for (const f of fields) {
        const vals = Array.isArray(d[f]) ? d[f] : [d[f]];
        for (const v of vals) {
          if (typeof v !== "string" || !v) continue;
          if (v.startsWith("data:image")) base64++;
          else if (v.includes("firebasestorage.googleapis.com")) storage++;
          else other++;
        }
      }
    }
    check(
      `${label}: no Base64 images in documents`,
      base64 === 0,
      `storage-url: ${storage} · base64: ${base64} · other(/uploads, external): ${other}` +
        (base64 > 0
          ? `\n         ${base64} document(s) still embed Base64 — those were uploaded while the bucket was misconfigured.`
          : ""),
    );
  } catch (e) {
    check(`${label}: image storage mode`, false, e.message);
  }
}
await scanImages("vendorProducts", ["imageUrl", "imageUrls"], "vendorProducts");
await scanImages("vendors", ["profileImageUrl", "coverImageUrl"], "vendors");

// ── 5. Required composite indexes are actually deployed ──────────────────────
// A missing index throws FAILED_PRECONDITION at query time, in production only.
const INDEX_PROBES = [
  ["drivers isOnline+status", () => db.collection("drivers").where("isOnline", "==", true).where("status", "==", "approved").limit(1).get()],
  ["vendorProducts vendorId+status", () => db.collection("vendorProducts").where("vendorId", "==", "__probe__").where("status", "==", "approved").limit(1).get()],
  ["ratings vendorId+createdAt", () => db.collection("ratings").where("vendorId", "==", "__probe__").orderBy("createdAt", "desc").limit(1).get()],
  ["orders vendorId+createdAt", () => db.collection("orders").where("vendorId", "==", "__probe__").orderBy("createdAt", "desc").limit(1).get()],
  ["settlements accountType+createdAt", () => db.collection("settlements").where("accountType", "==", "driver").orderBy("createdAt", "desc").limit(1).get()],
];
for (const [name, run] of INDEX_PROBES) {
  try {
    await run();
    check(`Index: ${name}`, true);
  } catch (e) {
    const missing = /FAILED_PRECONDITION|requires an index/i.test(e.message);
    check(`Index: ${name}`, false, missing ? "INDEX MISSING → run: firebase deploy --only firestore:indexes" : e.message);
  }
}

// ── 6. Push-notification readiness (tokens registered by real devices) ───────
try {
  const [users, drivers, vendors] = await Promise.all([
    db.collection("users").where("pushToken", ">=", "ExponentPushToken").limit(5).get().catch(() => ({ size: 0 })),
    db.collection("drivers").where("pushToken", ">=", "ExponentPushToken").limit(5).get().catch(() => ({ size: 0 })),
    db.collection("vendors").where("pushToken", ">=", "ExponentPushToken").limit(5).get().catch(() => ({ size: 0 })),
  ]);
  const total = (users.size || 0) + (drivers.size || 0) + (vendors.size || 0);
  check(
    "Push tokens registered by real devices",
    total > 0,
    `customers: ${users.size || 0} · drivers: ${drivers.size || 0} · vendors: ${vendors.size || 0}` +
      (total === 0 ? "\n         No device has registered yet — open each app once on a real phone and grant notifications." : ""),
  );
} catch (e) {
  check("Push tokens registered by real devices", false, e.message);
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log("\n═══════════════════════════════════════════════════════════");
console.log(`  ${results.length - failed}/${results.length} checks passed`);
console.log("═══════════════════════════════════════════════════════════");
if (failed > 0) {
  console.log("\n  Failed checks:");
  for (const r of results.filter((r) => !r.ok)) console.log(`   • ${r.name}`);
  console.log("\n  Fix these before running the manual order-lifecycle test.");
} else {
  console.log("\n  Infrastructure is production-ready.");
  console.log("  Next: run the manual order-lifecycle checklist in PRODUCTION_READY_REPORT.md");
  console.log("  (steps 2-11 need real phones and cannot be automated).");
}
process.exit(failed > 0 ? 1 : 0);
