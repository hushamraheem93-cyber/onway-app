/**
 * scripts/cleanup-orphan-images.ts
 *
 * Scans Firebase Storage (product-images/) and Firestore (vendorProducts)
 * to detect files no longer referenced by any product.
 *
 * Usage:
 *   npx ts-node scripts/cleanup-orphan-images.ts          # report only (safe)
 *   npx ts-node scripts/cleanup-orphan-images.ts --delete # actually delete
 *
 * The --delete flag is required to perform any deletion.
 * Never deletes without explicit confirmation.
 */

import * as admin from "firebase-admin";

async function main() {
  const shouldDelete = process.argv.includes("--delete");

  // ── Firebase init ─────────────────────────────────────────────────────────
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountJson) {
    console.error("Error: FIREBASE_SERVICE_ACCOUNT env var is not set.");
    process.exit(1);
  }

  let serviceAccount: any;
  try {
    serviceAccount = JSON.parse(serviceAccountJson);
  } catch {
    console.error("Error: FIREBASE_SERVICE_ACCOUNT is not valid JSON.");
    process.exit(1);
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET ?? `${serviceAccount.project_id}.appspot.com`,
  });

  const db = admin.firestore();
  const bucket = admin.storage().bucket();

  console.log("\n🔍 Scanning Firestore for referenced image URLs...");

  // ── Collect all URLs referenced by any product ────────────────────────────
  const referencedUrls = new Set<string>();
  const productsSnap = await db.collection("vendorProducts").get();

  for (const doc of productsSnap.docs) {
    const data = doc.data() as any;
    if (data.imageUrl) referencedUrls.add(data.imageUrl);
    if (Array.isArray(data.imageUrls)) {
      data.imageUrls.forEach((u: string) => referencedUrls.add(u));
    }
    if (Array.isArray(data.imageThumbs)) {
      data.imageThumbs.forEach((u: string) => referencedUrls.add(u));
    }
  }

  console.log(`   → ${productsSnap.size} products scanned, ${referencedUrls.size} unique URLs collected.`);

  // ── Also collect URLs from productImageHashes collection ─────────────────
  const hashesSnap = await db.collection("productImageHashes").get();
  for (const doc of hashesSnap.docs) {
    const data = doc.data() as any;
    if (data.imageUrl) referencedUrls.add(data.imageUrl);
    if (data.thumbUrl) referencedUrls.add(data.thumbUrl);
  }

  // ── List all files in product-images/ folder ──────────────────────────────
  console.log("\n🗂  Listing Firebase Storage files under product-images/...");
  const [files] = await bucket.getFiles({ prefix: "product-images/" });
  console.log(`   → ${files.length} files found.`);

  // ── Identify orphans ──────────────────────────────────────────────────────
  const orphans: Array<{ file: any; name: string; sizeBytes: number }> = [];
  let totalSizeBytes = 0;

  for (const file of files) {
    const [metadata] = await file.getMetadata();
    const sizeBytes = parseInt(String(metadata.size ?? "0"), 10);
    const rawToken = (metadata.metadata as any)?.firebaseStorageDownloadTokens ?? "";
    const downloadToken = rawToken.split(",")[0];

    // Reconstruct the public download URL used by the app
    const encodedPath = encodeURIComponent(file.name);
    const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${downloadToken}`;

    if (!referencedUrls.has(publicUrl)) {
      orphans.push({ file, name: file.name, sizeBytes });
      totalSizeBytes += sizeBytes;
    }
  }

  // ── Report ────────────────────────────────────────────────────────────────
  const totalMB = (totalSizeBytes / 1024 / 1024).toFixed(2);
  console.log(`\n📊 Results:`);
  console.log(`   Found:      ${orphans.length} orphan images`);
  console.log(`   Total size: ${totalMB} MB`);

  if (orphans.length > 0) {
    console.log("\n   Orphan files:");
    orphans.forEach(({ name, sizeBytes }) => {
      const kb = (sizeBytes / 1024).toFixed(1);
      console.log(`   - ${name} (${kb} KB)`);
    });
  }

  if (!shouldDelete) {
    console.log("\n⚠️  Dry-run mode. No files were deleted.");
    console.log("   Run with --delete to permanently remove orphan files.\n");
    process.exit(0);
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  console.log("\n🗑  Deleting orphan files...");
  let deleted = 0;
  let failed = 0;

  for (const { file, name } of orphans) {
    try {
      await file.delete();
      console.log(`   ✓ Deleted: ${name}`);
      deleted++;
    } catch (err: any) {
      console.warn(`   ✗ Failed:  ${name} — ${err?.message}`);
      failed++;
    }
  }

  console.log(`\n✅ Cleanup complete: ${deleted} deleted, ${failed} failed.\n`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
