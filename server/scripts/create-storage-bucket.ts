/**
 * OnWay — إنشاء Firebase Storage bucket
 * Run: npx ts-node server/scripts/create-storage-bucket.ts
 *
 * يُنشئ الـ bucket الافتراضي لمشروع Firebase إذا لم يكن موجوداً.
 */

import admin from "firebase-admin";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!json) throw new Error("FIREBASE_SERVICE_ACCOUNT env var is missing");
  const sa = JSON.parse(json);
  const projectId: string = sa.project_id;

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      storageBucket: `${projectId}.firebasestorage.app`,
    });
  }

  const bucketNames = [
    `${projectId}.firebasestorage.app`,
    `${projectId}.appspot.com`,
  ];

  console.log(`\n🔥 Firebase Project: ${projectId}`);

  for (const bucketName of bucketNames) {
    console.log(`\n🪣  جرب bucket: ${bucketName}`);
    try {
      const bucket = admin.storage().bucket(bucketName);
      const [exists] = await bucket.exists();
      if (exists) {
        await bucket.setMetadata({
          iamConfiguration: { uniformBucketLevelAccess: { enabled: true } },
        });
        console.log(`  ✅ الـ bucket موجود بالفعل ومُفعّل عليه Uniform Bucket-Level Access: ${bucketName}`);
        process.exit(0);
      }
      console.log(`  ⚙️  الـ bucket غير موجود — جاري الإنشاء...`);
      await bucket.create({
        location: "US",
        storageClass: "STANDARD",
      });
      console.log(`  ✅ تم إنشاء الـ bucket بنجاح: ${bucketName}`);

      // M-28: keep access control at the bucket IAM layer. Do not re-enable
      // per-object ACLs for a bucket that may contain private driver documents.
      await bucket.setMetadata({
        iamConfiguration: { uniformBucketLevelAccess: { enabled: true } },
      });
      console.log(`  ✅ قواعد الوصول ضُبطت`);
      process.exit(0);
    } catch (err: any) {
      console.error(`  ❌ فشل مع ${bucketName}: ${err.message}`);
    }
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("⚠️  لم يُنشأ الـ bucket تلقائياً.");
  console.log("   يجب إنشاؤه يدوياً من Firebase Console:");
  console.log(
    "   https://console.firebase.google.com/project/" +
      (JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || "{}").project_id ||
        "YOUR_PROJECT") +
      "/storage",
  );
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  process.exit(1);
}

main().catch((err) => {
  console.error("❌ خطأ:", err.message);
  process.exit(1);
});
