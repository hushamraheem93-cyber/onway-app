#!/usr/bin/env node
/**
 * One-time, idempotent Settlement migration.
 *
 * WHAT IT DOES
 *   For every driver whose legacy `driverFinancialAccounts.amountOwed > 0`, it creates
 *   a single "Legacy Balance" opening-balance settlement record and rolls that amount
 *   into the new `settlementLedger`. Historical orders are NEVER re-accrued (that would
 *   double-charge); the current net legacy balance is carried forward verbatim as an
 *   Opening Balance — no values are estimated.
 *
 * SAFETY
 *   • Dry-run is the DEFAULT. Pass --commit to actually write.
 *   • Existing collections (driverFinancialAccounts / driverTransactions /
 *     driverCompletedOrders / orders / vendors) are NEVER modified or deleted.
 *   • Idempotent: a deterministic settlement id + a `migratedLegacy` flag on the ledger
 *     mean re-running makes zero further changes.
 *   • Commit mode first writes and VERIFIES an automatic backup of the source records
 *     and ABORTS if that backup cannot be verified.
 *   • Every run writes a permanent audit report (local file always; Firestore
 *     `migrationReports` on commit).
 *
 * USAGE (run on Replit, where FIREBASE_SERVICE_ACCOUNT exists)
 *   node scripts/migrate-settlement.mjs            # dry-run (no writes)
 *   node scripts/migrate-settlement.mjs --commit   # apply
 */

import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));
const COMMIT = args.has("--commit");
const MODE = COMMIT ? "commit" : "dry-run";
const nowIso = () => new Date().toISOString();
const BATCH_ID = `mig-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function initDb() {
  const svc = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!svc) {
    console.error("✖ FIREBASE_SERVICE_ACCOUNT is not set. Run this on Replit where the secret exists.");
    process.exit(1);
  }
  let cred;
  try { cred = JSON.parse(svc); } catch { console.error("✖ FIREBASE_SERVICE_ACCOUNT is not valid JSON."); process.exit(1); }
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(cred) });
  return admin.firestore();
}

/** Commit-only: snapshot the source financial records to disk and verify it. Never
 *  start a commit run without a verified backup. */
function createVerifiedBackup(records) {
  const dir = path.join(__dirname, "backups");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `driverFinancialAccounts-${BATCH_ID}.json`);
  fs.writeFileSync(file, JSON.stringify(records, null, 2));
  const readBack = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(readBack) || readBack.length !== records.length) {
    throw new Error("backup verification failed (record count mismatch)");
  }
  return file;
}

async function main() {
  const db = initDb();
  const startTime = nowIso();
  console.log(`\n=== Settlement Migration [${MODE}] batch=${BATCH_ID} ===`);
  console.log(`start: ${startTime}`);

  const accountsSnap = await db.collection("driverFinancialAccounts").get();
  const accounts = accountsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  if (COMMIT) {
    try {
      const file = createVerifiedBackup(accounts);
      console.log(`✔ Verified backup of ${accounts.length} driverFinancialAccounts → ${file}`);
      console.log(`  Recommended additionally: full managed export →`);
      console.log(`  gcloud firestore export gs://<your-bucket>/pre-settlement-${BATCH_ID}\n`);
    } catch (e) {
      console.error(`✖ Backup failed — migration ABORTED (never start without a verified backup): ${e.message}`);
      process.exit(1);
    }
  } else {
    console.log("ℹ dry-run: no writes. A verified backup is created automatically before --commit.\n");
  }

  const report = {
    migrationBatchId: BATCH_ID,
    startTime,
    endTime: null,
    mode: MODE,
    driversScanned: 0,
    driversMigrated: 0,
    driversSkipped: 0,
    errors: 0,
    totalMigratedOutstanding: 0,
  };

  for (const acc of accounts) {
    report.driversScanned++;
    const phone = acc.phoneNumber || acc.id;
    const owed = Math.round(acc.amountOwed || 0);
    if (owed <= 0) { report.driversSkipped++; continue; }

    try {
      let name = phone;
      const dq = await db.collection("drivers").where("phoneNumber", "==", phone).limit(1).get();
      if (!dq.empty) name = dq.docs[0].data().fullName || name;

      const ledgerRef = db.collection("settlementLedger").doc(`driver:${phone}`);
      const settlementRef = db.collection("settlements").doc(`LEGACY__driver__${phone}`);

      if (!COMMIT) {
        const led = await ledgerRef.get();
        if (led.exists && led.data().migratedLegacy) { report.driversSkipped++; continue; }
        report.driversMigrated++;
        report.totalMigratedOutstanding += owed;
        continue;
      }

      const applied = await db.runTransaction(async (tx) => {
        const led = await tx.get(ledgerRef);
        if (led.exists && led.data().migratedLegacy) return 0; // idempotent skip
        const prev = led.exists ? led.data() : {};
        const ts = admin.firestore.Timestamp.now();
        tx.set(settlementRef, {
          source: "legacy_migration",
          type: "opening_balance",
          label: "Legacy Balance",
          orderId: `LEGACY-${phone}`,
          accountType: "driver",
          accountId: phone,
          accountKey: `driver:${phone}`,
          accountName: name,
          direction: "collect",
          grossAmount: owed,
          commission: 0,
          outstandingAmount: owed,
          amountSettled: 0,
          status: "pending",
          migrationBatchId: BATCH_ID,
          migratedAt: ts,
          createdAt: ts,
          updatedAt: ts,
        });
        tx.set(
          ledgerRef,
          {
            accountType: "driver",
            accountId: phone,
            accountKey: `driver:${phone}`,
            accountName: name,
            direction: "collect",
            outstandingTotal: (prev.outstandingTotal ?? 0) + owed, // increment: preserves any new accruals
            pendingCount: (prev.pendingCount ?? 0) + 1,
            legacyOpeningBalance: owed,
            migratedLegacy: true,
            migrationBatchId: BATCH_ID,
            source: "legacy_migration",
            updatedAt: ts,
            ...(led.exists ? {} : { createdAt: ts }),
          },
          { merge: true },
        );
        return owed;
      });

      if (applied > 0) { report.driversMigrated++; report.totalMigratedOutstanding += applied; }
      else report.driversSkipped++;
    } catch (e) {
      report.errors++;
      console.error(`✖ error migrating ${phone}: ${e.message}`);
    }
  }

  report.endTime = nowIso();

  // Persist the audit report (permanent).
  const reportsDir = path.join(__dirname, "reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `migration-${BATCH_ID}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  if (COMMIT) {
    await db.collection("migrationReports").doc(BATCH_ID)
      .set({ ...report, kind: "settlement_migration", createdAt: admin.firestore.Timestamp.now() })
      .catch((e) => console.error("report save to Firestore failed:", e.message));
  }

  console.log("\n=== Migration Report ===");
  console.table(report);
  console.log(`report saved: ${reportPath}`);
  if (!COMMIT) console.log("\nℹ DRY RUN complete — no data written. Re-run with --commit to apply.\n");
  else console.log("\n✔ COMMIT complete.\n");
  process.exit(0);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
