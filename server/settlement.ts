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
const SETTLEMENT_REQUESTS = "settlementRequests";

/** Single-field query key ("driver:0770..." / "vendor:abc") stored on each record so
 *  per-account lists need only a single-field index (no composite index required). */
export function accountKey(accountType: SettlementAccountType, accountId: string): string {
  return `${accountType}:${accountId}`;
}

export type SettlementStatus = "outstanding" | "under_review" | "settled";

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
        accountKey: accountKey(input.accountType, input.accountId),
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
          accountKey: accountKey(input.accountType, input.accountId),
          accountName: input.accountName || input.accountId,
          direction,
          totalOrders: (prev.totalOrders ?? 0) + 1,
          totalGross: (prev.totalGross ?? 0) + gross,
          totalCommission: (prev.totalCommission ?? 0) + commission,
          outstandingTotal: (prev.outstandingTotal ?? 0) + outstanding,
          pendingCount: (prev.pendingCount ?? 0) + 1,
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

export interface CreateRequestResult {
  ok: boolean;
  reason?: "nothing_due" | "already_requested";
  requestId?: string;
  outstanding?: number;
  pendingOrderCount?: number;
  accountName?: string;
}

/**
 * Create a settlement request for an account, atomically. Allowed at ANY time as long
 * as there is an outstanding balance (thresholds are advisory, not a gate). Prevents a
 * second pending request via an activeRequestId pointer held on the ledger.
 */
export async function createSettlementRequest(
  accountType: SettlementAccountType,
  accountId: string,
  accountName: string,
): Promise<CreateRequestResult> {
  const db = getFirestore();
  if (!db) return { ok: false, reason: "nothing_due" };
  const ledgerRef = db.collection(LEDGER).doc(ledgerId(accountType, accountId));
  const requestsCol = db.collection(SETTLEMENT_REQUESTS);
  const newRef = requestsCol.doc(); // pre-allocate id
  try {
    return await db.runTransaction(async (tx) => {
      const ledgerSnap = await tx.get(ledgerRef);
      if (!ledgerSnap.exists) return { ok: false, reason: "nothing_due" as const };
      const ledger = ledgerSnap.data() as any;
      const outstanding = ledger.outstandingTotal ?? 0;
      if (outstanding <= 0) return { ok: false, reason: "nothing_due" as const };
      if (ledger.activeRequestId) {
        const activeSnap = await tx.get(requestsCol.doc(ledger.activeRequestId));
        if (activeSnap.exists && (activeSnap.data() as any).status === "pending") {
          return { ok: false, reason: "already_requested" as const, requestId: ledger.activeRequestId };
        }
      }
      const now = admin.firestore.Timestamp.now();
      const name = accountName || ledger.accountName || accountId;
      const pendingOrderCount = ledger.pendingCount ?? 0;
      tx.set(newRef, {
        accountType,
        accountId,
        accountKey: accountKey(accountType, accountId),
        accountName: name,
        direction: directionFor(accountType),
        outstandingSnapshot: outstanding,
        pendingOrderCount,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      });
      tx.set(ledgerRef, { activeRequestId: newRef.id, activeRequestStatus: "pending", updatedAt: now }, { merge: true });
      return { ok: true as const, requestId: newRef.id, outstanding, pendingOrderCount, accountName: name };
    });
  } catch (error) {
    console.error("createSettlementRequest tx error:", error);
    return { ok: false, reason: "nothing_due" };
  }
}

/** Combined view for the driver/vendor settlement screen + the top status indicator. */
export async function getAccountSettlementView(
  accountType: SettlementAccountType,
  accountId: string,
): Promise<Record<string, any>> {
  const db = getFirestore();
  const direction = directionFor(accountType);
  const ledger = await getSettlementLedger(accountType, accountId);
  const outstanding = ledger?.outstandingTotal ?? 0;

  let activeRequest: Record<string, any> | null = null;
  if (db && ledger?.activeRequestId) {
    const rs = await db.collection(SETTLEMENT_REQUESTS).doc(ledger.activeRequestId).get();
    if (rs.exists) activeRequest = { id: rs.id, ...(rs.data() as any) };
  }
  const isPendingReq = activeRequest?.status === "pending";
  const status: SettlementStatus = isPendingReq ? "under_review" : outstanding <= 0 ? "settled" : "outstanding";

  return {
    accountType,
    accountId,
    direction,
    outstanding,
    totalOrders: ledger?.totalOrders ?? 0,
    totalGross: ledger?.totalGross ?? 0,
    totalCommission: ledger?.totalCommission ?? 0,
    totalSettled: ledger?.totalSettled ?? 0,
    pendingOrderCount: ledger?.pendingCount ?? 0,
    status,
    activeRequest,
  };
}

/** Per-account history: settlement records + past requests, newest first. */
export async function getSettlementHistory(
  accountType: SettlementAccountType,
  accountId: string,
  max = 100,
): Promise<{ settlements: any[]; requests: any[] }> {
  const db = getFirestore();
  if (!db) return { settlements: [], requests: [] };
  const key = accountKey(accountType, accountId);
  const byCreatedDesc = (a: any, b: any) =>
    (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0);
  try {
    const [sSnap, rSnap] = await Promise.all([
      db.collection(SETTLEMENTS).where("accountKey", "==", key).limit(max).get(),
      db.collection(SETTLEMENT_REQUESTS).where("accountKey", "==", key).limit(max).get(),
    ]);
    return {
      settlements: sSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })).sort(byCreatedDesc),
      requests: rSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })).sort(byCreatedDesc),
    };
  } catch (error) {
    console.error("getSettlementHistory error:", error);
    return { settlements: [], requests: [] };
  }
}

/** Admin: list settlement requests by status (optionally filtered by account type). */
export async function listSettlementRequests(
  status: string = "pending",
  accountType?: SettlementAccountType,
): Promise<any[]> {
  const db = getFirestore();
  if (!db) return [];
  const byCreatedDesc = (a: any, b: any) =>
    (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0);
  try {
    const snap = await db.collection(SETTLEMENT_REQUESTS).where("status", "==", status).limit(300).get();
    let items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    if (accountType) items = items.filter((i) => i.accountType === accountType);
    return items.sort(byCreatedDesc);
  } catch (error) {
    console.error("listSettlementRequests error:", error);
    return [];
  }
}
