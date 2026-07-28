/**
 * OnWay — legacy image migration to Firebase Storage.
 *
 *   npx tsx server/scripts/migrate-images-to-storage.ts --dry-run     ← ALWAYS FIRST
 *   npx tsx server/scripts/migrate-images-to-storage.ts --apply
 *
 * WHY THIS EXISTS
 * ───────────────
 * The code now writes only Firebase Storage URLs, but documents created before that
 * still hold two kinds of legacy value:
 *
 *   • `/uploads/…`  — a path on the VM's local disk, which is EPHEMERAL and wiped on
 *                     every redeploy. These URLs work until the next deploy, then 404.
 *   • `data:image…` — a Base64 blob stored inline. It inflates every read of the
 *                     document by ~33% and pushes it toward Firestore's 1MB cap.
 *
 * Fixing the code does not fix those rows. This does.
 *
 * WHAT IT DOES, PER FIELD
 * ───────────────────────
 *   already a Storage URL  → skip
 *   Base64 data URI        → decode, re-encode webp via sharp, upload, rewrite
 *   /uploads/… + file on disk (or in assets/seed/) → upload, rewrite
 *   /uploads/… + no file   → ORPHAN: reported, left untouched, never blanked
 *   anything else (http…)  → left as-is (Unsplash/CDN library images are legitimate)
 *
 * SAFETY
 * ──────
 *   • --dry-run is the default. Nothing is written without an explicit --apply.
 *   • Writes are per-document `update()` of ONLY the image fields that changed.
 *   • Orphans are never cleared — a broken link is recoverable, a wiped field is not.
 *   • Every upload is content-hashed, so re-running is idempotent: an image already
 *     migrated resolves to the same object path and is not duplicated.
 *   • A JSON report is written to migration-report-<timestamp>.json.
 */
import admin from "firebase-admin";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { createHash } from "crypto";
import sharp from "sharp";
import { uploadToFirebaseStorage } from "../firebase";

dotenv.config();

const APPLY = process.argv.includes("--apply");
const DRY = !APPLY;

/** Collection → the fields that may hold an image. Arrays are handled element-wise. */
const TARGETS: {
  collection: string;
  fields: string[];
  arrayFields?: string[];
}[] = [
  { collection: "productImageHashes", fields: ["imageUrl", "thumbUrl"] },
  {
    collection: "vendorProducts",
    fields: ["imageUrl"],
    arrayFields: ["imageUrls", "imageThumbs"],
  },
  {
    collection: "products",
    fields: ["image", "imageUrl"],
    arrayFields: ["imageUrls"],
  },
  { collection: "categories", fields: ["image", "imageUrl"] },
  { collection: "banners", fields: ["image", "imageUrl"] },
  {
    collection: "vendors",
    fields: ["image", "profileImageUrl", "coverImageUrl"],
  },
  {
    collection: "drivers",
    fields: ["nationalIdImage", "residenceCardImage", "driverLicenseImage"],
  },
  { collection: "users", fields: ["profileImage"] },
  { collection: "promotionalSections", fields: ["image", "imageUrl"] },
  {
    collection: "websiteContent",
    fields: ["imageUrl", "heroImage", "logoUrl"],
  },
  { collection: "ratings", fields: ["image"] },
];

const STORAGE_PREFIX = "https://firebasestorage.googleapis.com/";

type Kind = "storage" | "base64" | "uploads" | "external" | "empty";

function kindOf(v: unknown): Kind {
  if (typeof v !== "string" || v === "") return "empty";
  if (v.startsWith(STORAGE_PREFIX)) return "storage";
  if (v.startsWith("data:image")) return "base64";
  if (v.includes("/uploads/")) return "uploads";
  return "external";
}

/** Resolve a /uploads/... or /assets/seed/... reference to a file on disk. */
function resolveLocal(url: string): string | null {
  const rel = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0];
  const name = rel.replace(/^\/(uploads|assets\/seed)\//, "");
  for (const base of ["uploads", "assets/seed"]) {
    const p = path.resolve(process.cwd(), base, name);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return null;
}

const report = {
  startedAt: new Date().toISOString(),
  finishedAt: "",
  mode: DRY ? "dry-run" : "apply",
  totals: {
    scanned: 0,
    storage: 0,
    external: 0,
    empty: 0,
    migrated: 0,
    orphans: 0,
    failed: 0,
  },
  perCollection: {} as Record<string, any>,
  orphans: [] as {
    collection: string;
    doc: string;
    field: string;
    value: string;
  }[],
  failures: [] as {
    collection: string;
    doc: string;
    field: string;
    error: string;
  }[],
  migrations: [] as {
    collection: string;
    doc: string;
    field: string;
    from: string;
    to: string;
  }[],
};

const uploadCache = new Map<string, string>();

/** Convert one legacy value into a Storage URL. Returns null when it cannot be. */
async function migrateValue(
  value: string,
  folder: string,
): Promise<string | null> {
  const kind = kindOf(value);
  let buf: Buffer;

  if (kind === "base64") {
    const m = value.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
    if (!m) return null;
    buf = Buffer.from(m[2], "base64");
  } else if (kind === "uploads") {
    const local = resolveLocal(value);
    if (!local) return null; // orphan — the file is simply gone
    buf = fs.readFileSync(local);
  } else {
    return null;
  }

  // Content hash BEFORE re-encoding, so the same source always maps to one object.
  const hash = createHash("sha256").update(buf).digest("hex").slice(0, 32);
  const cached = uploadCache.get(hash);
  if (cached) return cached;

  const webp = await sharp(buf).rotate().webp({ quality: 82 }).toBuffer();
  const url = await uploadToFirebaseStorage(
    webp,
    `${folder}/${hash}.webp`,
    "image/webp",
  );
  uploadCache.set(hash, url);
  return url;
}

async function migrateCollection(t: (typeof TARGETS)[number]) {
  const db = admin.firestore();
  const stats = {
    docs: 0,
    storage: 0,
    external: 0,
    empty: 0,
    migrated: 0,
    orphans: 0,
    failed: 0,
  };

  let snap;
  try {
    snap = await db.collection(t.collection).get();
  } catch (e: any) {
    console.log(`  ${t.collection}: UNREADABLE (${e.message})`);
    return;
  }

  for (const doc of snap.docs) {
    stats.docs++;
    const data = doc.data() || {};
    const updates: Record<string, any> = {};

    // scalar fields
    for (const field of t.fields) {
      const v = data[field];
      const kind = kindOf(v);
      if (kind === "storage") {
        stats.storage++;
        continue;
      }
      if (kind === "external") {
        stats.external++;
        continue;
      }
      if (kind === "empty") {
        stats.empty++;
        continue;
      }
      try {
        const url = await migrateValue(v, t.collection);
        if (!url) {
          stats.orphans++;
          report.orphans.push({
            collection: t.collection,
            doc: doc.id,
            field,
            value: String(v).slice(0, 120),
          });
          continue;
        }
        updates[field] = url;
        stats.migrated++;
        report.migrations.push({
          collection: t.collection,
          doc: doc.id,
          field,
          from: kind,
          to: url,
        });
      } catch (e: any) {
        stats.failed++;
        report.failures.push({
          collection: t.collection,
          doc: doc.id,
          field,
          error: e?.message,
        });
      }
    }

    // array fields — rewrite element-wise, preserving order and length
    for (const field of t.arrayFields ?? []) {
      const arr = data[field];
      if (!Array.isArray(arr) || arr.length === 0) continue;
      let changed = false;
      const next: any[] = [];
      for (const v of arr) {
        const kind = kindOf(v);
        if (kind === "storage") {
          stats.storage++;
          next.push(v);
          continue;
        }
        if (kind === "external") {
          stats.external++;
          next.push(v);
          continue;
        }
        if (kind === "empty") {
          stats.empty++;
          next.push(v);
          continue;
        }
        try {
          const url = await migrateValue(v, t.collection);
          if (!url) {
            stats.orphans++;
            report.orphans.push({
              collection: t.collection,
              doc: doc.id,
              field,
              value: String(v).slice(0, 120),
            });
            next.push(v); // keep the original — never blank an orphan
            continue;
          }
          next.push(url);
          changed = true;
          stats.migrated++;
          report.migrations.push({
            collection: t.collection,
            doc: doc.id,
            field,
            from: kind,
            to: url,
          });
        } catch (e: any) {
          stats.failed++;
          report.failures.push({
            collection: t.collection,
            doc: doc.id,
            field,
            error: e?.message,
          });
          next.push(v);
        }
      }
      if (changed) updates[field] = next;
    }

    if (Object.keys(updates).length > 0 && APPLY) {
      await doc.ref.update(updates);
    }
  }

  report.perCollection[t.collection] = stats;
  report.totals.scanned += stats.docs;
  report.totals.storage += stats.storage;
  report.totals.external += stats.external;
  report.totals.empty += stats.empty;
  report.totals.migrated += stats.migrated;
  report.totals.orphans += stats.orphans;
  report.totals.failed += stats.failed;

  console.log(
    `  ${t.collection.padEnd(22)} docs=${String(stats.docs).padStart(5)}  ` +
      `storage=${String(stats.storage).padStart(4)}  migrated=${String(stats.migrated).padStart(4)}  ` +
      `orphans=${String(stats.orphans).padStart(3)}  failed=${String(stats.failed).padStart(3)}`,
  );
}

async function main() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.error("FIREBASE_SERVICE_ACCOUNT is not set.");
    process.exit(1);
  }
  if (!admin.apps.length) {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      storageBucket:
        process.env.FIREBASE_STORAGE_BUCKET ||
        `${sa.project_id}.firebasestorage.app`,
    });
  }

  const [exists] = await admin.storage().bucket().exists();
  if (!exists) {
    console.error(
      `Storage bucket ${admin.storage().bucket().name} is not reachable. Aborting.`,
    );
    process.exit(1);
  }

  console.log(
    `\nOnWay image migration — ${DRY ? "DRY RUN (nothing will be written)" : "APPLYING CHANGES"}`,
  );
  console.log(`bucket: ${admin.storage().bucket().name}\n`);

  for (const t of TARGETS) await migrateCollection(t);

  report.finishedAt = new Date().toISOString();
  const file = `migration-report-${Date.now()}.json`;
  fs.writeFileSync(file, JSON.stringify(report, null, 2));

  console.log("\n" + "─".repeat(78));
  console.log(`scanned ${report.totals.scanned} documents`);
  console.log(`  already on Storage : ${report.totals.storage}`);
  console.log(`  external/CDN urls  : ${report.totals.external}`);
  console.log(
    `  MIGRATED           : ${report.totals.migrated}${DRY ? "  (would be — dry run)" : ""}`,
  );
  console.log(
    `  ORPHANS            : ${report.totals.orphans}   (file gone; left untouched)`,
  );
  console.log(`  failures           : ${report.totals.failed}`);
  console.log(`report → ${file}`);
  if (DRY) console.log("\nRe-run with --apply to write these changes.");
  console.log("");
  process.exit(report.totals.failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("\nMigration threw:", e?.message || e, "\n");
  process.exit(1);
});
