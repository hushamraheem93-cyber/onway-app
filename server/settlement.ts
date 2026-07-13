// ── Generic Settlement Engine ───────────────────────────────────────────────
// One reusable, economics-agnostic engine used by BOTH account types:
//
//   • driver  → "collect" direction: the driver collected the customer's cash and
//               therefore OWES the company (outstanding = cashCollected − driverCommission).
//   • vendor  → "payout"  direction: the company collected the cash (via the driver)
//               and therefore OWES the vendor their revenue
//               (outstanding = orderValue − platformCommission).
//
// The engine never computes economics itself — callers pass a precomputed,
// non-negative `outstandingAmount` plus descriptive breakdown fields. The engine
// owns the persistence model and guarantees every mutation is atomic (Firestore
// transactions) and idempotent. This keeps a single implementation for drivers and
// vendors with no duplicated code; only the small per-type formula helpers differ.

import admin from "firebase-admin";
import { getFirestore } from "./firebase";

export type SettlementAccountType = "driver" | "vendor";
export type SettlementDirection = "collect" | "payout";

/** collect = account owes the company (driver); payout = company owes the account (vendor). */
export function directionFor(accountType: SettlementAccountType): SettlementDirection {
  return accountType === "driver" ? "collect" : "payout";
}

const SETTLEMENTS = "settlements";
const LEDGER = "settlementLedger";

/** Deterministic ledger id so the aggregate can be read/updated transactionally. */
export function ledgerId(accountType: SettlementAccountType, accountId: string): string {
  return `${accountType}:${accountId}`;
}

/** Deterministic per-order settlement id → idempotency key (one record per order per type). */
export function settlementId(orderId: string, accountType: SettlementAccountType): string {
  return `${orderId}__${accountType}`;
}

export interface OrderSettlementInput {
  accountType: SettlementAccountType;
  accountId: string;        // driver phone number / vendorId
  accountName: string;
  orderId: string;
  storeId?: string | null;
  storeName?: string | null;
  grossAmount: number;      // driver: cashCollected (order.total); vendor: orderValue (restaurantSubtotal)
  commission: number;       // driver: driverCommission; vendor: platformCommission
  outstandingAmount: number; // precomputed by the caller (clamped ≥ 0 here)
}

/**
 * Atomically record a per-order settlement exactly once and roll it into the
 * account ledger. Idempotent by (orderId, accountType): a duplicate completion is a
 * safe no-op. Returns true only if a new settlement was created.
 */
export async function recordOrderSettlement(input: OrderSettlementInput): Promise<boolean> {
  const db = getFirestore();
  if (!db) return false;

  const direction = directionFor(input.accountType);
  const gross = Math.round(input.grossAmount || 0);
  const commission = Math.round(input.commission || 0);
  const outstanding = Math.max(0, Math.round(input.outstandingAmount || 0));

  const settlementRef = db.collection(SETTLEMENTS).doc(settlementId(input.orderId, input.accountType));
  const ledgerRef = db.collection(LEDGER).doc(ledgerId(input.accountType, input.accountId));

  try {
    return await db.runTransaction(async (tx) => {
      // Reads first (transaction requirement).
      const existing = await tx.get(settlementRef);
      if (existing.exists) return false; // already recorded → idempotent no-op
      const ledgerSnap = await tx.get(ledgerRef);
      const prev = ledgerSnap.exists ? (ledgerSnap.data() as any) : {};
      const now = admin.firestore.Timestamp.now();

      // Writes.
      tx.set(settlementRef, {
        orderId: input.orderId,
        accountType: input.accountType,
        accountId: input.accountId,
        accountName: input.accountName || input.accountId,
        direction,
        storeId: input.storeId ?? null,
        storeName: input.storeName ?? null,
        grossAmount: gross,
        commission,
        outstandingAmount: outstanding,
        amountSettled: 0,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      });

      tx.set(
        ledgerRef,
        {
          accountType: input.accountType,
          accountId: input.accountId,
          accountName: input.accountName || input.accountId,
          direction,
          totalOrders: (prev.totalOrders ?? 0) + 1,
          totalGross: (prev.totalGross ?? 0) + gross,
          totalCommission: (prev.totalCommission ?? 0) + commission,
          outstandingTotal: (prev.outstandingTotal ?? 0) + outstanding,
          totalSettled: prev.totalSettled ?? 0,
          updatedAt: now,
          ...(ledgerSnap.exists ? {} : { createdAt: now }),
        },
        { merge: true },
      );

      return true;
    });
  } catch (error) {
    console.error("recordOrderSettlement tx error:", error);
    return false;
  }
}

/** Read the aggregate ledger for an account (null if none yet). */
export async function getSettlementLedger(
  accountType: SettlementAccountType,
  accountId: string,
): Promise<Record<string, any> | null> {
  const db = getFirestore();
  if (!db) return null;
  try {
    const snap = await db.collection(LEDGER).doc(ledgerId(accountType, accountId)).get();
    return snap.exists ? { id: snap.id, ...(snap.data() as any) } : null;
  } catch (error) {
    console.error("getSettlementLedger error:", error);
    return null;
  }
}
