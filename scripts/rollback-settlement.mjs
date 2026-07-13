#!/usr/bin/env node
/**
 * Reversal of a Settlement migration batch. Because the migration only ADDS data, the
 * rollback is clean: it removes the Legacy opening-balance records of a given batch and
 * subtracts their amount from the ledger (subtracting `legacyOpeningBalance` rather than
 * zeroing the ledger, so any real settlement activity that happened after migration is
 * preserved). Existing legacy financial records were never touched, so nothing there
 * needs restoring.
 *
 * SAFETY
 *   • Dry-run is the DEFAULT. Pass --commit to actually write.
 *   • Requires --batch-id=<id> so a rollback can only ever target one specific migration.
 *   • Commit mode writes and verifies an automatic backup of the affected new records
 *     first, and ABORTS if it cannot be verified.
 *   • Every run writes a permanent audit report (local file; Firestore on commit).
 *
 * USAGE (run on Replit)
 *   node scripts/rollback-settlement.mjs --batch-id=mig-...            # dry-run
 *   node scripts/rollback-settlement.mjs --batch-id=mig-... --commit   # apply
 */

import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const COMMIT = argv.includes("--commit");
const MODE = COMMIT ? "commit" : "dry-run";
const batchArg = argv.find((a) => a.startsWith("--batch-id="));
const BATCH_ID = batchArg ? batchArg.split("=")[1] : null;
const nowIso = () => new Date().toISOString();
const RUN_ID = `rbk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

if (!BATCH_ID) {
  console.error("✖ --batch-id=<id> is required (target the exact migration batch to reverse).");
  process.exit(1);
}

function initDb() {
  const svc = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!svc) { console.error("✖ FIREBASE_SERVICE_ACCOUNT is not set. Run this on Replit."); process.exit(1); }
  let cred;
  try { cred = JSON.parse(svc); } catch { console.error("✖ FIREBASE_SERVICE_ACCOUNT is not valid JSON."); process.exit(1); }
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(cred) });
  return admin.firestore();
}

function createVerifiedBackup(records) {
  const dir = path.join(__dirname, "backups");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `rollback-affected-${BATCH_ID}-${RUN_ID}.json`);
  fs.writeFileSync(file, JSON.stringify(records, null, 2));
  const readBack = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(readBack) || readBack.length !== records.length) throw new Error("backup verification failed");
  return file;
}

async function main() {
  const db = initDb();
  const startTime = nowIso();
  console.log(`\n=== Settlement Rollback [${MODE}] targetBatch=${BATCH_ID} run=${RUN_ID} ===`);
  console.log(`start: ${startTime}`);

  const settlementsSnap = await db.collection("settlements")
    .where("migrationBatchId", "==", BATCH_ID).get();
  const legacySettlements = settlementsSnap.docs.filter((d) => d.data().source === "legacy_migration");

  const ledgersSnap = await db.collection("settlementLedger")
    .where("migrationBatchId", "==", BATCH_ID).get();
  const ledgers = ledgersSnap.docs;

  if (COMMIT) {
    try {
      const affected = [
        ...legacySettlements.map((d) => ({ col: "settlements", id: d.id, ...d.data() })),
        ...ledgers.map((d) => ({ col: "settlementLedger", id: d.id, ...d.data() })),
      ];
      const file = createVerifiedBackup(affected);
      console.log(`✔ Verified backup of ${affected.length} affected records → ${file}\n`);
    } catch (e) {
      console.error(`✖ Backup failed — rollback ABORTED: ${e.message}`);
      process.exit(1);
    }
  } else {
    console.log("ℹ dry-run: no writes.\n");
  }

  const report = {
    rollbackRunId: RUN_ID,
    targetBatchId: BATCH_ID,
    startTime,
    endTime: null,
    mode: MODE,
    legacySettlementsFound: legacySettlements.length,
    ledgersFound: ledgers.length,
    settlementsDeleted: 0,
    ledgersReverted: 0,
    errors: 0,
    totalReversedOutstanding: 0,
  };

  if (COMMIT) {
    for (const led of ledgers) {
      try {
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(led.ref);
          if (!snap.exists) return;
          const d = snap.data();
          const opening = Math.round(d.legacyOpeningBalance || 0);
          tx.set(led.ref, {
            outstandingTotal: Math.max(0, (d.outstandingTotal ?? 0) - opening),
            pendingCount: Math.max(0, (d.pendingCount ?? 0) - 1),
            migratedLegacy: admin.firestore.FieldValue.delete(),
            migrationBatchId: admin.firestore.FieldValue.delete(),
            legacyOpeningBalance: admin.firestore.FieldValue.delete(),
            updatedAt: admin.firestore.Timestamp.now(),
          }, { merge: true });
          report.totalReversedOutstanding += opening;
        });
        report.ledgersReverted++;
      } catch (e) { report.errors++; console.error(`✖ ledger ${led.id}: ${e.message}`); }
    }
    for (const s of legacySettlements) {
      try { await s.ref.delete(); report.settlementsDeleted++; }
      catch (e) { report.errors++; console.error(`✖ settlement ${s.id}: ${e.message}`); }
    }
  } else {
    report.totalReversedOutstanding = ledgers.reduce((sum, d) => sum + Math.round(d.data().legacyOpeningBalance || 0), 0);
  }

  report.endTime = nowIso();

  const reportsDir = path.join(__dirname, "reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `rollback-${BATCH_ID}-${RUN_ID}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  if (COMMIT) {
    await db.collection("migrationReports").doc(RUN_ID)
      .set({ ...report, kind: "settlement_rollback", createdAt: admin.firestore.Timestamp.now() })
      .catch((e) => console.error("report save failed:", e.message));
  }

  console.log("\n=== Rollback Report ===");
  console.table(report);
  console.log(`report saved: ${reportPath}`);
  if (!COMMIT) console.log("\nℹ DRY RUN — no data written. Re-run with --commit to reverse.\n");
  else console.log("\n✔ ROLLBACK complete.\n");
  process.exit(0);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
