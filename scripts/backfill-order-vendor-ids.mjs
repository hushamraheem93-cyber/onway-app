#!/usr/bin/env node
/**
 * H-34 — backfill `vendorIds` on orders.
 *
 * WHY
 * ---
 * Three vendor endpoints could not query their own orders. A modern order carries a
 * top-level `vendorId`, but a marketplace order carries the vendor only inside
 * `items[].productId`, which no `where()` can reach. So those endpoints read the
 * newest N orders PLATFORM-WIDE (300 / 2000 / 1000) and filtered them in JavaScript.
 *
 * That is both a cost problem and a correctness problem: once the platform passes N
 * orders in the window, a vendor's real orders fall out of it and their revenue
 * silently shrinks month after month.
 *
 * WHAT THIS WRITES
 * ----------------
 * One new field per order document:
 *
 *     vendorIds: string[]   — every vendor with a stake in this order
 *
 * It is the union of:
 *   • `order.vendorId`, when present and non-empty
 *   • the owner of each `items[].productId`, resolved through `vendorProducts`
 *     (that collection's document ID *is* the product ID)
 *
 * Deduplicated and sorted, so re-running produces a byte-identical value.
 *
 * WHAT IT NEVER DOES
 * ------------------
 *   • delete a document or a field
 *   • modify ANY existing field — `vendorId`, `items`, totals and status are read
 *     only, never written
 *   • write when the computed value already matches (idempotent, and a re-run
 *     reports zero changes)
 *   • write anything at all without --apply
 *
 * Orders that resolve to no vendor keep `vendorIds: []`. Firestore's array-contains
 * never matches an empty array, so those orders appear for nobody — which is exactly
 * what happens today, since they match no vendor in the JavaScript filter either.
 *
 * ROLLBACK
 * --------
 * The field is additive and nothing reads it until the query change ships. To undo:
 *     node scripts/backfill-order-vendor-ids.mjs --rollback --apply
 * which removes ONLY `vendorIds` (FieldValue.delete()) and touches nothing else.
 *
 * USAGE
 *   node scripts/backfill-order-vendor-ids.mjs              # dry run (default)
 *   node scripts/backfill-order-vendor-ids.mjs --apply      # write
 *   node scripts/backfill-order-vendor-ids.mjs --rollback --apply
 *   node scripts/backfill-order-vendor-ids.mjs --limit 100  # sample first
 */
import admin from "firebase-admin";

const APPLY = process.argv.includes("--apply");
const ROLLBACK = process.argv.includes("--rollback");
const LIMIT = Number(process.argv[process.argv.indexOf("--limit") + 1]) || 0;
const BATCH_SIZE = 400; // Firestore hard limit is 500 writes per batch

const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) {
  console.error("FIREBASE_SERVICE_ACCOUNT is not set.");
  process.exit(1);
}
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
}
const db = admin.firestore();

/** productId → vendorId, read once. vendorProducts' document ID is the product ID. */
async function loadProductOwners() {
  const owners = new Map();
  const snap = await db.collection("vendorProducts").get();
  for (const doc of snap.docs) {
    const vid = doc.data()?.vendorId;
    if (typeof vid === "string" && vid.trim()) owners.set(doc.id, vid.trim());
  }
  return owners;
}

/** The vendors with a stake in one order — the exact rule the JS filter uses today. */
export function computeVendorIds(order, productOwners) {
  const out = new Set();
  if (typeof order?.vendorId === "string" && order.vendorId.trim()) {
    out.add(order.vendorId.trim());
  }
  const items = Array.isArray(order?.items) ? order.items : [];
  for (const item of items) {
    const pid = item?.productId;
    if (typeof pid !== "string" || !pid) continue;
    const owner = productOwners.get(pid);
    if (owner) out.add(owner);
  }
  return [...out].sort();
}

const sameArray = (a, b) =>
  Array.isArray(a) && Array.isArray(b) && a.length === b.length &&
  a.every((v, i) => v === b[i]);

async function main() {
  const mode = ROLLBACK ? "ROLLBACK" : "BACKFILL";
  console.log(`\n── H-34 ${mode} · ${APPLY ? "APPLY (writes)" : "DRY RUN (no writes)"} ──\n`);

  const productOwners = ROLLBACK ? new Map() : await loadProductOwners();
  if (!ROLLBACK) console.log(`product → vendor map: ${productOwners.size} products\n`);

  let scanned = 0, toChange = 0, alreadyCorrect = 0, unresolvable = 0, written = 0;
  const byVendorCount = new Map();
  const samples = [];
  let batch = db.batch(), inBatch = 0;

  let query = db.collection("orders").orderBy(admin.firestore.FieldPath.documentId()).limit(500);
  let cursor = null;

  for (;;) {
    const snap = await (cursor ? query.startAfter(cursor) : query).get();
    if (snap.empty) break;
    cursor = snap.docs[snap.docs.length - 1].id;

    for (const doc of snap.docs) {
      if (LIMIT && scanned >= LIMIT) break;
      scanned += 1;
      const data = doc.data();

      if (ROLLBACK) {
        if (data.vendorIds === undefined) { alreadyCorrect += 1; continue; }
        toChange += 1;
        if (APPLY) {
          batch.update(doc.ref, { vendorIds: admin.firestore.FieldValue.delete() });
          inBatch += 1;
        }
      } else {
        const next = computeVendorIds(data, productOwners);
        if (next.length === 0) unresolvable += 1;
        const n = next.length;
        byVendorCount.set(n, (byVendorCount.get(n) || 0) + 1);

        if (sameArray(data.vendorIds, next)) { alreadyCorrect += 1; continue; }
        toChange += 1;
        if (samples.length < 5) {
          samples.push({ id: doc.id, from: data.vendorIds ?? "(absent)", to: next });
        }
        if (APPLY) {
          // update() touches ONLY this field; every other field is left as-is.
          batch.update(doc.ref, { vendorIds: next });
          inBatch += 1;
        }
      }

      if (inBatch >= BATCH_SIZE) {
        await batch.commit();
        written += inBatch;
        batch = db.batch(); inBatch = 0;
        process.stdout.write(`  … ${written} written\r`);
      }
    }
    if (LIMIT && scanned >= LIMIT) break;
    if (snap.size < 500) break;
  }

  if (APPLY && inBatch > 0) { await batch.commit(); written += inBatch; }

  console.log(`orders scanned      : ${scanned}`);
  console.log(`would change        : ${toChange}`);
  console.log(`already correct     : ${alreadyCorrect}   (a re-run reports 0 changes)`);
  if (!ROLLBACK) {
    console.log(`resolve to NO vendor: ${unresolvable}   (kept as [] — matches nobody, same as today)`);
    console.log(`vendors per order   : ${[...byVendorCount.entries()].sort((a, b) => a[0] - b[0])
      .map(([n, c]) => `${n}→${c}`).join("  ")}`);
    if (samples.length) {
      console.log("\nsamples:");
      for (const s of samples) {
        console.log(`  ${s.id}  ${JSON.stringify(s.from)} → ${JSON.stringify(s.to)}`);
      }
    }
  }
  console.log(`\nactually written    : ${APPLY ? written : 0}`);
  if (!APPLY) console.log("\nDRY RUN — nothing was written. Re-run with --apply to write.");
  console.log("");
}

// Allow importing computeVendorIds from tests without running the migration.
if (process.argv[1] && process.argv[1].endsWith("backfill-order-vendor-ids.mjs")) {
  main().then(() => process.exit(0)).catch((err) => {
    console.error("\nMIGRATION FAILED:", err?.message ?? err);
    console.error("No further writes were made. Re-running is safe — it is idempotent.");
    process.exit(1);
  });
}
