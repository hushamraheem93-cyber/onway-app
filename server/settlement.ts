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
const SETTLEMENT_PAYMENTS = "settlementPayments";
const APP_SETTINGS = "appSettings";
const CONFIG_DOC = "settlementConfig";

export const DEFAULT_THRESHOLD = 50000;

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

// ── Admin: complete a settlement (full or partial), atomic + FIFO ──────────────

export interface CompleteSettlementInput {
  accountType: SettlementAccountType;
  accountId: string;
  amount: number;
  adminName?: string;
  method?: string;
  notes?: string;
  requestId?: string;
}

export interface CompleteSettlementResult {
  ok: boolean;
  reason?: "no_ledger" | "nothing_due" | "invalid_amount";
  applied?: number;
  outstandingBefore?: number;
  outstandingAfter?: number;
  fullySettled?: boolean;
  paymentId?: string;
  receiptNumber?: string;
}

/**
 * Record a settlement payment (full or partial, from a request or manual) and reduce
 * the account's outstanding balance. The money-critical mutation — ledger balance +
 * permanent payment record + request status — runs in ONE Firestore transaction with
 * a clamp so a balance can never go negative and an overpayment is never accepted. The
 * FIFO marking of individual pending settlement records is applied right after as
 * derived bookkeeping (the ledger is the balance authority), keeping the hot path free
 * of composite-index requirements.
 */
export async function completeSettlement(input: CompleteSettlementInput): Promise<CompleteSettlementResult> {
  const db = getFirestore();
  if (!db) return { ok: false, reason: "no_ledger" };
  const key = accountKey(input.accountType, input.accountId);
  const ledgerRef = db.collection(LEDGER).doc(ledgerId(input.accountType, input.accountId));
  const paymentRef = db.collection(SETTLEMENT_PAYMENTS).doc();
  const reqRef = input.requestId ? db.collection(SETTLEMENT_REQUESTS).doc(input.requestId) : null;

  let appliedOut = 0;
  try {
    const result = await db.runTransaction(async (tx) => {
      // ── reads first ──
      const ledgerSnap = await tx.get(ledgerRef);
      if (!ledgerSnap.exists) return { ok: false, reason: "no_ledger" as const };
      const ledger = ledgerSnap.data() as any;
      const reqSnap = reqRef ? await tx.get(reqRef) : null;

      const outstanding = ledger.outstandingTotal ?? 0;
      if (outstanding <= 0) return { ok: false, reason: "nothing_due" as const };
      let amount = Math.round(input.amount || 0);
      if (amount <= 0) return { ok: false, reason: "invalid_amount" as const };
      amount = Math.min(amount, outstanding); // clamp: never overpay, never go negative

      const now = admin.firestore.Timestamp.now();
      const newOutstanding = Math.max(0, outstanding - amount);
      const fullySettled = newOutstanding <= 0;

      // ── writes ──
      tx.set(
        ledgerRef,
        {
          outstandingTotal: newOutstanding,
          totalSettled: (ledger.totalSettled ?? 0) + amount,
          lastSettlementAt: now,
          lastSettlementAmount: amount,
          updatedAt: now,
          ...(fullySettled ? { activeRequestId: null, activeRequestStatus: null } : {}),
        },
        { merge: true },
      );

      const datePart = now.toDate().toISOString().slice(0, 10).replace(/-/g, "");
      const receiptNumber = `STL-${datePart}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      tx.set(paymentRef, {
        accountType: input.accountType,
        accountId: input.accountId,
        accountKey: key,
        accountName: ledger.accountName ?? input.accountId,
        amount,
        method: input.method || "cash",
        adminName: input.adminName || "",
        notes: input.notes || "",
        requestId: input.requestId ?? null,
        isManual: !input.requestId,
        outstandingBefore: outstanding,
        outstandingAfter: newOutstanding,
        receiptNumber,
        createdAt: now,
      });

      if (reqRef && reqSnap?.exists) {
        tx.update(reqRef, {
          status: fullySettled ? "completed" : "partially_completed",
          completedAt: now,
          settledAmount: amount,
          updatedAt: now,
        });
      }

      return {
        ok: true as const,
        applied: amount,
        outstandingBefore: outstanding,
        outstandingAfter: newOutstanding,
        fullySettled,
        paymentId: paymentRef.id,
        receiptNumber,
      };
    });

    if (result.ok) {
      appliedOut = result.applied ?? 0;
      // Derived bookkeeping: mark the oldest pending settlement records as settled
      // (FIFO) up to the applied amount. Best-effort — the ledger above is authoritative.
      await markSettlementRecordsFIFO(input.accountType, input.accountId, appliedOut).catch((e) =>
        console.error("markSettlementRecordsFIFO error:", e),
      );
    }
    return result;
  } catch (error) {
    console.error("completeSettlement tx error:", error);
    return { ok: false, reason: "no_ledger" };
  }
}

/** FIFO-allocate a settled amount across an account's pending settlement records and
 *  refresh the ledger's pendingCount. Index-free (queries by the single accountKey field). */
async function markSettlementRecordsFIFO(
  accountType: SettlementAccountType,
  accountId: string,
  amount: number,
): Promise<void> {
  const db = getFirestore();
  if (!db || amount <= 0) return;
  const key = accountKey(accountType, accountId);
  const snap = await db.collection(SETTLEMENTS).where("accountKey", "==", key).limit(1000).get();
  const pending = snap.docs
    .map((d) => ({ ref: d.ref, ...(d.data() as any) }))
    .filter((s) => s.status !== "settled")
    .sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0));

  const now = admin.firestore.Timestamp.now();
  let remaining = amount;
  let batch = db.batch();
  let ops = 0;
  let stillPending = 0;

  for (const s of pending) {
    const due = (s.outstandingAmount ?? 0) - (s.amountSettled ?? 0);
    if (remaining > 0 && due > 0) {
      const applied = Math.min(remaining, due);
      const newSettled = (s.amountSettled ?? 0) + applied;
      const fully = newSettled >= (s.outstandingAmount ?? 0);
      batch.update(s.ref, {
        amountSettled: newSettled,
        status: fully ? "settled" : "pending",
        ...(fully ? { settledAt: now } : {}),
        updatedAt: now,
      });
      ops++;
      remaining -= applied;
      if (!fully) stillPending++;
    } else {
      stillPending++;
    }
    if (ops >= 400) { await batch.commit(); batch = db.batch(); ops = 0; }
  }
  if (ops > 0) await batch.commit();
  await db.collection(LEDGER).doc(ledgerId(accountType, accountId))
    .set({ pendingCount: stillPending, updatedAt: now }, { merge: true })
    .catch(() => {});
}

// ── Threshold configuration (per account type, admin-editable) ─────────────────

export interface SettlementConfig {
  driver: { thresholdEnabled: boolean; thresholdAmount: number };
  vendor: { thresholdEnabled: boolean; thresholdAmount: number };
}

export async function getSettlementConfig(): Promise<SettlementConfig> {
  const fallback: SettlementConfig = {
    driver: { thresholdEnabled: true, thresholdAmount: DEFAULT_THRESHOLD },
    vendor: { thresholdEnabled: true, thresholdAmount: DEFAULT_THRESHOLD },
  };
  const db = getFirestore();
  if (!db) return fallback;
  try {
    const snap = await db.collection(APP_SETTINGS).doc(CONFIG_DOC).get();
    if (!snap.exists) return fallback;
    const d = snap.data() as any;
    return {
      driver: { thresholdEnabled: d.driver?.thresholdEnabled ?? true, thresholdAmount: d.driver?.thresholdAmount ?? DEFAULT_THRESHOLD },
      vendor: { thresholdEnabled: d.vendor?.thresholdEnabled ?? true, thresholdAmount: d.vendor?.thresholdAmount ?? DEFAULT_THRESHOLD },
    };
  } catch {
    return fallback;
  }
}

export async function updateSettlementConfig(
  accountType: SettlementAccountType,
  thresholdEnabled: boolean,
  thresholdAmount: number,
): Promise<SettlementConfig> {
  const db = getFirestore();
  const current = await getSettlementConfig();
  const next = { ...current, [accountType]: { thresholdEnabled, thresholdAmount: Math.max(0, Math.round(thresholdAmount || 0)) } };
  if (db) {
    await db.collection(APP_SETTINGS).doc(CONFIG_DOC).set({ ...next, updatedAt: admin.firestore.Timestamp.now() }, { merge: true }).catch(() => {});
  }
  return next;
}

/** True if the account's outstanding meets/exceeds the configured (enabled) threshold. */
export async function isOverSettlementThreshold(
  accountType: SettlementAccountType,
  accountId: string,
): Promise<{ blocked: boolean; outstanding: number; thresholdAmount: number; thresholdEnabled: boolean }> {
  const [ledger, config] = await Promise.all([
    getSettlementLedger(accountType, accountId),
    getSettlementConfig(),
  ]);
  const outstanding = ledger?.outstandingTotal ?? 0;
  const cfg = config[accountType];
  const blocked = cfg.thresholdEnabled && outstanding >= cfg.thresholdAmount;
  return { blocked, outstanding, thresholdAmount: cfg.thresholdAmount, thresholdEnabled: cfg.thresholdEnabled };
}

// ── Admin overview data ────────────────────────────────────────────────────────

/** Per-account cards for the admin settlement dashboard (name, orders, outstanding,
 *  last settlement, derived status). */
export async function listSettlementAccounts(accountType: SettlementAccountType): Promise<any[]> {
  const db = getFirestore();
  if (!db) return [];
  try {
    const snap = await db.collection(LEDGER).where("accountType", "==", accountType).limit(500).get();
    return snap.docs
      .map((d) => {
        const l = d.data() as any;
        const outstanding = l.outstandingTotal ?? 0;
        const status: SettlementStatus =
          l.activeRequestStatus === "pending" ? "under_review" : outstanding <= 0 ? "settled" : "outstanding";
        return {
          accountType,
          accountId: l.accountId,
          accountName: l.accountName ?? l.accountId,
          direction: l.direction,
          outstanding,
          pendingOrderCount: l.pendingCount ?? 0,
          totalOrders: l.totalOrders ?? 0,
          totalSettled: l.totalSettled ?? 0,
          lastSettlementAt: l.lastSettlementAt ?? null,
          status,
        };
      })
      .sort((a, b) => b.outstanding - a.outstanding);
  } catch (error) {
    console.error("listSettlementAccounts error:", error);
    return [];
  }
}

/** Per-account settlement payment history (permanent). */
export async function getSettlementPayments(
  accountType: SettlementAccountType,
  accountId: string,
  max = 100,
): Promise<any[]> {
  const db = getFirestore();
  if (!db) return [];
  const key = accountKey(accountType, accountId);
  try {
    const snap = await db.collection(SETTLEMENT_PAYMENTS).where("accountKey", "==", key).limit(max).get();
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) }))
      .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
  } catch (error) {
    console.error("getSettlementPayments error:", error);
    return [];
  }
}
