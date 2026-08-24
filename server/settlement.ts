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
import { createHash } from "node:crypto";
import { getFirestore } from "./firebase";
import { recordLedgerEntry, recordAudit } from "./financialLedger";
import type { AdminIdentity } from "./adminTypes";

/**
 * Await the paper trail for a movement that has already committed, and say whether
 * all of it landed (R-03).
 *
 * The three admin money paths used to end with
 *
 *     recordLedgerEntry({ … }).catch(() => {});
 *     recordAudit({ … }).catch(() => {});
 *
 * described as "best-effort, never blocks". Neither promise was awaited, so the
 * handler answered 200 with both writes still in flight — and `max_memory_restart:
 * 512M` means the process really does die mid-flight. Neither outcome was read
 * either, so a write that simply failed left the outstanding balance changed with
 * no ledger entry to reconcile against and no record of who changed it.
 *
 * The trail still cannot block the movement: by the time it runs, the transaction
 * has committed and there is nothing to roll back. What changes is that it is
 * finished before the caller returns, and a failure is reported instead of
 * discarded, so an unrecorded movement can be found and reconciled rather than
 * looking exactly like a clean one.
 */
async function recordFinancialTrail(
  label: string,
  audit: () => Promise<boolean>,
  ledger?: () => Promise<"recorded" | "duplicate" | "failed">,
): Promise<boolean> {
  let complete = true;

  if (ledger) {
    const outcome = await ledger().catch((err: any) => {
      console.error(`[TRAIL] ${label}: ledger entry threw — ${err?.message ?? err}`);
      return "failed" as const;
    });
    if (outcome === "failed") {
      complete = false;
      console.error(
        `[TRAIL] ${label}: BALANCE MOVED WITHOUT A LEDGER ENTRY — reconcile before retrying`,
      );
    }
  }

  const audited = await audit().catch((err: any) => {
    console.error(`[TRAIL] ${label}: audit threw — ${err?.message ?? err}`);
    return false;
  });
  if (!audited) {
    complete = false;
    console.error(
      `[TRAIL] ${label}: BALANCE MOVED WITHOUT AN AUDIT RECORD — the actor is unrecorded`,
    );
  }

  return complete;
}

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
const SETTLEMENT_ADJUSTMENTS = "settlementAdjustments";
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

/**
 * The vendor's revenue for one order — the base the platform commission is taken
 * from, and the amount OnWay owes the vendor before commission.
 *
 * Restaurant orders store `restaurantSubtotal` explicitly. Marketplace orders
 * (vendorProducts) never set it — that path only stamps `vendorId`/`vendorName` —
 * so the base must be derived by removing the fees OnWay keeps.
 *
 * The settlement path used to fall back to `order.total`, which INCLUDES
 * `deliveryFee` and `serviceFee`. That over-credited the vendor ~90% of both fees
 * on every marketplace order. This mirrors the formula the admin statement
 * endpoint already uses, so the ledger and the statement now agree.
 */
export function vendorCommissionBase(order: {
  restaurantSubtotal?: number | null;
  total?: number | null;
  deliveryFee?: number | null;
  serviceFee?: number | null;
}): number {
  if (order?.restaurantSubtotal != null) return Math.max(0, Math.round(order.restaurantSubtotal));
  return Math.max(
    0,
    Math.round((order?.total || 0) - (order?.deliveryFee || 0) - (order?.serviceFee || 0)),
  );
}

export function promoSettlementAmounts(order: {
  restaurantSubtotal?: number | null;
  total?: number | null;
  deliveryFee?: number | null;
  serviceFee?: number | null;
  promoDiscount?: number | null;
}): { orderValue: number; grossBeforeDiscount: number; promoFundingAmount: number; promoDiscount: number } {
  const orderValue = vendorCommissionBase(order);
  const promoDiscount = Math.max(0, Math.round(Number(order.promoDiscount) || 0));
  const promoFundingAmount = order.restaurantSubtotal == null ? promoDiscount : 0;
  return {
    orderValue,
    grossBeforeDiscount: orderValue + promoFundingAmount,
    promoFundingAmount,
    promoDiscount,
  };
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
  promoDiscount?: number;
  grossBeforeDiscount?: number;
  customerChargedAmount?: number;
  promoFundingAmount?: number;
}

/**
 * Outcome of an attempt to record a settlement.
 *
 * This used to be a plain `boolean`, which collapsed three very different results
 * into one value: "recorded", "already recorded" and "the write FAILED" all
 * returned false. Callers could not tell a safe no-op from lost money, so a
 * transient Firestore error silently skipped the accrual. Keep these distinct.
 */
export type SettlementOutcome = "recorded" | "duplicate" | "failed";

/**
 * Atomically record a per-order settlement exactly once and roll it into the
 * account ledger. Idempotent by (orderId, accountType) via a deterministic
 * document id, so re-running this after a failure can never double-count.
 *
 * Returns:
 *   "recorded"  → a new settlement was created
 *   "duplicate" → one already existed; nothing changed (safe no-op)
 *   "failed"    → the write did NOT happen; the caller MUST schedule a retry
 *
 * @param dbOverride injected Firestore instance; used by tests to simulate
 *                   transient transaction failures. Production passes nothing.
 */
export async function recordOrderSettlement(
  input: OrderSettlementInput,
  dbOverride?: any,
): Promise<SettlementOutcome> {
  const db = dbOverride ?? getFirestore();
  if (!db) {
    console.error(
      `[SETTLEMENT] FAILED order=${input.orderId} type=${input.accountType} ` +
        `account=${input.accountId} reason=database-unavailable`,
    );
    return "failed";
  }

  const direction = directionFor(input.accountType);
  const gross = Math.round(input.grossAmount || 0);
  const commission = Math.round(input.commission || 0);
  const outstanding = Math.max(0, Math.round(input.outstandingAmount || 0));

  const settlementRef = db.collection(SETTLEMENTS).doc(settlementId(input.orderId, input.accountType));
  const ledgerRef = db.collection(LEDGER).doc(ledgerId(input.accountType, input.accountId));

  try {
    return await db.runTransaction(async (tx: any) => {
      // Reads first (transaction requirement).
      const existing = await tx.get(settlementRef);
      if (existing.exists) return "duplicate" as const; // already recorded → safe no-op
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

      return "recorded" as const;
    });
  } catch (error: any) {
    // The transaction did NOT commit. Log enough to reconstruct the accrual by
    // hand if every automated retry also fails, then tell the caller so it can
    // mark the order for recovery instead of treating this as "already done".
    console.error(
      `[SETTLEMENT] FAILED order=${input.orderId} type=${input.accountType} ` +
        `account=${input.accountId} gross=${gross} commission=${commission} ` +
        `outstanding=${outstanding} reason=${error?.message ?? error}`,
    );
    return "failed";
  }
}

/**
 * Retry the settlement accruals for one order that previously failed.
 *
 * Safe to call any number of times: each accrual is keyed by
 * `${orderId}__${accountType}`, so an accrual that already landed returns
 * "duplicate" and changes nothing. This deliberately retries ONLY the settlement
 * step — never the surrounding completion work (driver completed-orders list,
 * push notifications, batch bookkeeping), which is guarded separately by the
 * order's `earningsCredited` flag and must not run twice.
 *
 * Returns true when the order is fully settled and can be cleared for recovery.
 */
export async function retryOrderSettlements(
  inputs: OrderSettlementInput[],
  dbOverride?: any,
): Promise<boolean> {
  let allSettled = true;
  for (const input of inputs) {
    const outcome = await recordOrderSettlement(input, dbOverride);
    if (outcome === "failed") {
      allSettled = false;
      console.error(
        `[SETTLEMENT] retry still failing order=${input.orderId} type=${input.accountType}`,
      );
    } else {
      console.log(
        `[SETTLEMENT] retry ${outcome} order=${input.orderId} type=${input.accountType}`,
      );
    }
  }
  return allSettled;
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
    // H-33: returning null made every caller fall back to `?? 0`, so a driver's
    // wallet showed "nothing owed" during a Firestore outage while they were
    // carrying the platform's cash. Callers already answer 500 on a throw.
    console.error("getSettlementLedger error:", error);
    throw error;
  }
}

/**
 * H-72 — record that the human or store behind a ledger is gone.
 *
 * Deleting a driver or a vendor removed only their own document. Everything
 * financial — the ledger aggregate, the per-order settlements, the requests,
 * payments and adjustments filed under the same accountKey — stayed in
 * Firestore with no owner and no marker, so an outstanding balance simply
 * stopped being attached to anybody.
 *
 * Deleting that history instead would be worse: these records are the audit
 * trail for money that was actually collected or owed, and a settlement that
 * disappears cannot be reconciled or disputed. So nothing is deleted here. The
 * ledger is STAMPED, and it keeps its id, its totals and its accountKey, which
 * means every existing query — listSettlementAccounts, getSettlementHistory,
 * getSettlementPayments, the statements — keeps returning it unchanged.
 *
 * The snapshot exists because the owner document is about to vanish: without a
 * name captured at this moment, an admin reviewing the balance later has an
 * account id and nothing else. It is deliberately minimal — a display name and,
 * for a driver, the phone the account was reached by, which the ledger id
 * already contains for every pre-H-72 account.
 *
 * Returns false when there is no ledger, which is the common case: a driver who
 * never completed a delivery has no financial history to preserve.
 */
export async function markLedgerOwnerDeleted(
  accountType: SettlementAccountType,
  accountId: string,
  snapshot: { name?: string | null; phoneNumber?: string | null; ownerDocId?: string | null } = {},
): Promise<boolean> {
  const db = getFirestore();
  if (!db) return false;
  const ref = db.collection(LEDGER).doc(ledgerId(accountType, accountId));
  try {
    const snap = await ref.get();
    if (!snap.exists) return false;
    await ref.update({
      ownerStatus: "deleted",
      ownerDeletedAt: admin.firestore.Timestamp.now(),
      ownerSnapshot: {
        name: snapshot.name ?? (snap.data() as any)?.accountName ?? null,
        phoneNumber: snapshot.phoneNumber ?? null,
        ownerDocId: snapshot.ownerDocId ?? null,
      },
      // Ordered by updatedAt, so the admin sees the account surface at the
      // moment it lost its owner rather than sinking out of the 500-row window.
      updatedAt: admin.firestore.Timestamp.now(),
    });
    return true;
  } catch (error) {
    // The caller has already deleted, or is about to delete, the owner document.
    // Losing this stamp leaves the balance readable but unlabelled, which is bad
    // enough to shout about and not bad enough to fail the request over.
    console.error(
      `[SETTLEMENT] failed to stamp deleted owner type=${accountType} account=${accountId}: ${(error as any)?.message ?? error}`,
    );
    return false;
  }
}

export interface CreateRequestResult {
  ok: boolean;
  reason?: "nothing_due" | "already_requested";
  requestId?: string;
  reference?: string;
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
  const counterRef = db.collection(APP_SETTINGS).doc("settlementCounter");
  try {
    return await db.runTransaction(async (tx) => {
      // Reads first (transaction requirement) — ledger, active request, counter.
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
      const counterSnap = await tx.get(counterRef);

      const now = admin.firestore.Timestamp.now();
      const name = accountName || ledger.accountName || accountId;
      const pendingOrderCount = ledger.pendingCount ?? 0;

      // Sequential, human-readable reference SET-YYYY-NNNNNN, allocated atomically
      // (the counter resets each calendar year). Two concurrent requests can never
      // get the same number because they contend on this one counter doc.
      const year = now.toDate().getFullYear();
      const c = counterSnap.exists ? (counterSnap.data() as any) : {};
      const seq = (c.year === year ? Number(c.seq) || 0 : 0) + 1;
      const reference = `SET-${year}-${String(seq).padStart(6, "0")}`;

      tx.set(counterRef, { year, seq, updatedAt: now }, { merge: true });
      tx.set(newRef, {
        reference,
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
      return { ok: true as const, requestId: newRef.id, reference, outstanding, pendingOrderCount, accountName: name };
    });
  } catch (error) {
    console.error("createSettlementRequest tx error:", error);
    return { ok: false, reason: "nothing_due" };
  }
}

/**
 * Advance a settlement request through its lifecycle (approve / reject).
 *
 *   approve: pending → approved (a payment can then be completed against it).
 *   reject : pending|approved → rejected, and the ledger lock is RELEASED so the
 *            account can raise a fresh request. (Completed/paid requests can't be
 *            rejected — the money already moved.)
 *
 * completeSettlement handles the paid → completed step. Every transition is
 * written to the immutable audit log.
 */
export async function transitionSettlementRequest(
  requestId: string,
  action: "approve" | "reject",
  adminName?: string,
  reason?: string,
  adminActor?: AdminIdentity,
): Promise<{ ok: boolean; reason?: string; status?: string; recordFailed?: boolean }> {
  const db = getFirestore();
  if (!db) return { ok: false, reason: "no_db" };
  const reqRef = db.collection(SETTLEMENT_REQUESTS).doc(requestId);
  try {
    const result = await db.runTransaction(async (tx: any) => {
      const snap = await tx.get(reqRef);
      if (!snap.exists) return { ok: false, reason: "not_found" as const };
      const r = snap.data() as any;
      const cur = String(r.status);
      const now = admin.firestore.Timestamp.now();
      const ledgerRef = db.collection(LEDGER).doc(ledgerId(r.accountType, r.accountId));

      if (action === "approve") {
        if (cur !== "pending") return { ok: false, reason: "invalid_transition" as const, status: cur };
        tx.update(reqRef, { status: "approved", approvedBy: adminName || "", approvedAt: now, updatedAt: now });
        tx.set(ledgerRef, { activeRequestStatus: "approved", updatedAt: now }, { merge: true });
      } else {
        if (cur !== "pending" && cur !== "approved") return { ok: false, reason: "invalid_transition" as const, status: cur };
        tx.update(reqRef, { status: "rejected", rejectedBy: adminName || "", rejectionReason: reason || "", rejectedAt: now, updatedAt: now });
        // Release the lock so the account can request again.
        tx.set(ledgerRef, { activeRequestId: null, activeRequestStatus: null, updatedAt: now }, { merge: true });
      }
      return {
        ok: true as const,
        status: action === "approve" ? "approved" : "rejected",
        previousStatus: cur,
        accountType: r.accountType, accountId: r.accountId, reference: r.reference || requestId,
      };
    });

    let recordFailed = false;
    if (result.ok) {
      recordFailed = !(await recordFinancialTrail(
        `settlement.${action}`,
        () => recordAudit({
        action: action === "approve" ? "settlement.approve" : "settlement.reject",
        actorType: "admin",
        actorId: adminActor?.adminId,
        actorUsername: adminActor?.username || adminName || "",
        actorRole: adminActor?.role,
        actorName: adminActor?.username || adminName || "",
        targetType: (result as any).accountType,
        targetId: (result as any).accountId,
        resourceType: "settlementRequest",
        resourceId: requestId,
        referenceId: (result as any).reference,
        notes: reason || "",
        before: { status: (result as any).previousStatus },
        after: { status: (result as any).status },
        }),
      ));
    }
    return {
      ok: result.ok,
      reason: (result as any).reason,
      status: (result as any).status,
      ...(recordFailed ? { recordFailed: true } : {}),
    };
  } catch (error) {
    console.error("transitionSettlementRequest error:", error);
    return { ok: false, reason: "tx_failed" };
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
    // H-23: both of these had a limit and no ordering, so Firestore answered in
    // document-id order — random for both collections — and the in-memory sort below
    // dressed an arbitrary slice up as a tidy newest-first list. An account past `max`
    // lifetime records showed a frozen random sample of its own history.
    const [sSnap, rSnap] = await Promise.all([
      db.collection(SETTLEMENTS).where("accountKey", "==", key)
        .orderBy("createdAt", "desc").limit(max).get(),
      db.collection(SETTLEMENT_REQUESTS).where("accountKey", "==", key)
        .orderBy("createdAt", "desc").limit(max).get(),
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
    // H-23: unordered, so past 300 requests in a status the admin inbox showed an
    // arbitrary 300 — a driver's payout request could sit "under review" forever
    // because nobody ever saw it.
    const snap = await db.collection(SETTLEMENT_REQUESTS).where("status", "==", status)
      .orderBy("createdAt", "desc").limit(300).get();
    let items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    if (accountType) items = items.filter((i) => i.accountType === accountType);
    return items.sort(byCreatedDesc);
  } catch (error) {
    // H-33: an empty list reads as "there are no settlement requests", which is
    // what an admin acts on. A failed read must not look like that.
    console.error("listSettlementRequests error:", error);
    throw error;
  }
}

// ── Admin: complete a settlement (full or partial), atomic + FIFO ──────────────

export interface CompleteSettlementInput {
  accountType: SettlementAccountType;
  accountId: string;
  amount: number;
  adminName?: string;
  adminActor?: AdminIdentity;
  method?: string;
  notes?: string;
  requestId?: string;
  /**
   * Optional caller-supplied key that makes a repeat of the SAME payment a no-op.
   * When `requestId` is present it is used automatically and this can be omitted.
   * See settlementPaymentId().
   */
  idempotencyKey?: string;
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
  /** True when this call replayed an already-recorded payment and changed nothing. */
  duplicate?: boolean;
}

/**
 * Record a settlement payment (full or partial, from a request or manual) and reduce
 * the account's outstanding balance.
 *
 * Consistency model:
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  Firestore transaction  (atomic, always-consistent)                │
 * │  • ledger.outstandingTotal  ← reduced                             │
 * │  • settlementPayments doc   ← created (fifoApplied: false)        │
 * │  • settlementRequests doc   ← status updated (if from request)    │
 * └─────────────────────────────────────────────────────────────────────┘
 *        ↓  transaction commits
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  FIFO bookkeeping  (derived, repairable)                           │
 * │  • individual settlements marked settled/partially settled         │
 * │  • on success → payment.fifoApplied = true                        │
 * │  • on crash   → repairPendingFIFO() at next call auto-heals       │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * The ledger is the single source of truth for balances. FIFO is derived
 * bookkeeping for display only and is always recoverable.
 */
/**
 * Deterministic settlement-payment document id, or null when the caller gave us
 * nothing to deduplicate on (manual ad-hoc payments keep the old random id).
 *
 * A settlement raised from a request is identified by that request: completing
 * request X can only ever produce one payment, so no client change is needed for
 * the flow the admin dashboard actually uses.
 */
export function settlementPaymentId(input: CompleteSettlementInput): string | null {
  const raw = input.requestId ? `req_${input.requestId}` : input.idempotencyKey;
  if (!raw) return null;
  // Firestore document ids may not contain "/" and must stay under 1500 bytes.
  return `stl_${String(raw).replace(/[/\s]+/g, "_").slice(0, 200)}`;
}

/**
 * Window (ms) used to DERIVE an idempotency key for a payment whose caller sent
 * none. Two byte-identical payment requests inside this window are the same
 * payment; a genuine second cash handover later in the day falls in a later
 * window and is still recorded normally.
 */
export const AUTO_IDEMPOTENCY_WINDOW_MS = 120_000;

/** Stable fingerprint of "which payment is this", independent of wall-clock time. */
function paymentFingerprint(input: CompleteSettlementInput): string {
  const parts = [
    input.accountType,
    input.accountId,
    String(Math.round(input.amount || 0)),
    input.method || "cash",
    (input.notes || "").trim(),
    (input.adminName || "").trim(),
  ].join("|");
  return createHash("sha1").update(parts).digest("hex").slice(0, 32);
}

/**
 * Server-derived payment ids for a caller that supplied NO key (the legacy
 * driver-wallet endpoints and manual settlements from the admin card).
 *
 * Returns [current window, previous window]. BOTH are checked before writing, so a
 * double-tap or a retry that lands just after a window boundary still collides
 * with the original instead of paying twice. Without this the id was random and
 * the whole idempotency block was skipped — a retried 50,000 IQD hand-over wiped
 * 100,000 off the driver's debt (C-08).
 */
export function autoIdempotencyIds(
  input: CompleteSettlementInput,
  nowMs: number = Date.now(),
): string[] {
  const fp = paymentFingerprint(input);
  const bucket = Math.floor(nowMs / AUTO_IDEMPOTENCY_WINDOW_MS);
  return [`stlauto_${fp}_${bucket}`, `stlauto_${fp}_${bucket - 1}`];
}

/**
 * The same [current window, previous window] derivation for manual ledger
 * adjustments, which move money without producing a payment receipt.
 */
export function adjustmentIdempotencyIds(
  accountType: SettlementAccountType,
  accountId: string,
  delta: number,
  adjustType: "add" | "deduct",
  notes: string,
  adminName?: string,
  nowMs: number = Date.now(),
): string[] {
  const fp = createHash("sha1")
    .update(
      [accountType, accountId, String(delta), adjustType, (notes || "").trim(), (adminName || "").trim()].join("|"),
    )
    .digest("hex")
    .slice(0, 32);
  const bucket = Math.floor(nowMs / AUTO_IDEMPOTENCY_WINDOW_MS);
  return [`adjauto_${fp}_${bucket}`, `adjauto_${fp}_${bucket - 1}`];
}

export async function completeSettlement(
  input: CompleteSettlementInput,
  dbOverride?: any,
): Promise<CompleteSettlementResult> {
  const db = dbOverride ?? getFirestore();
  if (!db) return { ok: false, reason: "no_ledger" };
  const key = accountKey(input.accountType, input.accountId);
  const ledgerRef = db.collection(LEDGER).doc(ledgerId(input.accountType, input.accountId));
  // Deterministic payment id. When the caller identified the payment (requestId or
  // idempotencyKey) that identity is used directly. When it did NOT, the id is
  // derived from the payment's own fields plus a short time window, so the same
  // logical payment always targets the same document and a retry or double tap
  // collides with itself instead of paying twice. Idempotency is never optional.
  const explicitId = settlementPaymentId(input);
  // Older-window ids that must also be checked before writing (empty when the
  // caller supplied an explicit key — that key is already time-independent).
  const fallbackIds = explicitId ? [] : autoIdempotencyIds(input);
  const idemId = explicitId ?? fallbackIds[0];
  const paymentRef = db.collection(SETTLEMENT_PAYMENTS).doc(idemId);
  const priorRefs = fallbackIds
    .slice(1)
    .map((id: string) => db.collection(SETTLEMENT_PAYMENTS).doc(id));
  const reqRef = input.requestId ? db.collection(SETTLEMENT_REQUESTS).doc(input.requestId) : null;

  // ── Step 0: Repair any payments whose FIFO step was interrupted by a crash ──
  // This runs before the new transaction so the account's per-record statuses
  // are always up-to-date. Best-effort and silent — never blocks the new payment.
  await repairPendingFIFO(input.accountType, input.accountId).catch(() => {});

  let appliedOut = 0;
  try {
    const result = await db.runTransaction(async (tx: any) => {
      // ── reads first ──
      // Idempotency check BEFORE anything else: if this exact payment already
      // landed, replay its recorded outcome and touch nothing. An admin
      // double-tapping "settle" used to clear the balance twice — a driver handing
      // over 50,000 IQD had 100,000 wiped off their debt.
      for (const ref of [paymentRef, ...priorRefs]) {
        const existing = await tx.get(ref);
        if (existing.exists) {
          const prev = existing.data() as any;
          return {
            ok: true as const,
            duplicate: true as const,
            applied: prev.amount ?? 0,
            requestedAmount: prev.requestedAmount ?? prev.amount ?? 0,
            overpaymentAmount: prev.overpaymentAmount ?? 0,
            outstandingBefore: prev.outstandingBefore ?? 0,
            outstandingAfter: prev.outstandingAfter ?? 0,
            fullySettled: (prev.outstandingAfter ?? 0) <= 0,
            paymentId: ref.id,
            receiptNumber: prev.receiptNumber ?? "",
          };
        }
      }

      const ledgerSnap = await tx.get(ledgerRef);
      if (!ledgerSnap.exists) return { ok: false, reason: "no_ledger" as const };
      const ledger = ledgerSnap.data() as any;
      const reqSnap = reqRef ? await tx.get(reqRef) : null;

      const outstanding = ledger.outstandingTotal ?? 0;
      if (outstanding <= 0) return { ok: false, reason: "nothing_due" as const };
      let amount = Math.round(input.amount || 0);
      if (amount <= 0) return { ok: false, reason: "invalid_amount" as const };
      const requestedAmount = amount;
      amount = Math.min(amount, outstanding); // preserve applied amount; record any overpayment explicitly
      const overpaymentAmount = Math.max(0, requestedAmount - amount);

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
        requestedAmount,
        overpaymentAmount,
        method: input.method || "cash",
        adminName: input.adminName || "",
        notes: input.notes || "",
        requestId: input.requestId ?? null,
        isManual: !input.requestId,
        outstandingBefore: outstanding,
        outstandingAfter: newOutstanding,
        receiptNumber,
        createdAt: now,
        // Consistency marker: FIFO bookkeeping runs outside the transaction.
        // If the server crashes after commit but before FIFO, this flag stays false
        // and repairPendingFIFO() will re-apply it on the next call.
        fifoApplied: false,
        fifoAmount: amount,
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
        requestedAmount,
        overpaymentAmount,
        outstandingBefore: outstanding,
        outstandingAfter: newOutstanding,
        fullySettled,
        paymentId: paymentRef.id,
        receiptNumber,
      };
    });

    // A duplicate replay must not re-run FIFO bookkeeping — the original call
    // already did it, and re-applying would mark further settlements settled
    // against money that was never paid.
    if (result.ok && !(result as any).duplicate) {
      appliedOut = result.applied ?? 0;
      // Derived bookkeeping: mark oldest pending settlement records settled (FIFO).
      // The payment is CLAIMED first (atomic compare-and-set) so a concurrent
      // repairPendingFIFO() from another admin's settlement cannot distribute this
      // same payment a second time (C-09). Only the claim winner distributes; on
      // success the payment is stamped fifoApplied:true. A crash between claim and
      // stamp leaves a stale claim that repairPendingFIFO() retries later.
      const claimed = await claimFifoApplication(db, paymentRef.id);
      if (claimed !== null) {
        await markSettlementRecordsFIFO(input.accountType, input.accountId, appliedOut, db)
          .then(() =>
            db.collection(SETTLEMENT_PAYMENTS).doc(paymentRef.id)
              .set({ fifoApplied: true }, { merge: true })
              .catch(() => {}),
          )
          .catch((e: any) => console.error("markSettlementRecordsFIFO error:", e));
      }

      // ── Financial ledger + audit (append-only) — best-effort, never blocks ──
      // A settlement payment reduces what the account is owed / owes, so it DEBITS
      // the account. Idempotent by the payment id, matching completeSettlement's own
      // idempotency, so a replayed payment records nothing new.
      const ref = (result as any).receiptNumber || paymentRef.id;
      (result as any).recordFailed = !(await recordFinancialTrail(
        "settlement.complete",
        () => recordAudit({
        action: "settlement.complete",
        actorType: "admin",
        actorId: input.adminActor?.adminId,
        actorUsername: input.adminActor?.username || input.adminName || "",
        actorRole: input.adminActor?.role,
        actorName: input.adminActor?.username || input.adminName || "",
        targetType: input.accountType,
        targetId: input.accountId,
        resourceType: input.accountType,
        resourceId: input.accountId,
        amount: appliedOut,
        referenceId: ref,
        notes: input.notes || "",
        before: { outstandingTotal: (result as any).outstandingBefore },
        after: { outstandingTotal: (result as any).outstandingAfter },
        }),
        () => recordLedgerEntry({
          accountType: input.accountType,
          accountId: input.accountId,
          type: "settlement",
          debit: appliedOut,
          settlementRef: ref,
          createdBy: input.adminActor?.username || input.adminName || "admin",
          entryId: `${paymentRef.id}__${input.accountType}__settlement`,
          description: "تسوية دفعة",
        }),
      ));
    }
    return result;
  } catch (error) {
    console.error("completeSettlement tx error:", error);
    return { ok: false, reason: "no_ledger" };
  }
}

/**
 * How long a FIFO claim is honoured before it is considered abandoned (crashed
 * mid-distribution) and may be retried by repairPendingFIFO().
 */
const FIFO_CLAIM_STALE_MS = 120_000;

/**
 * Atomically take ownership of one payment's FIFO distribution.
 *
 * Returns the amount to distribute when THIS caller won the claim, or null when
 * the payment was already distributed or is being distributed right now by
 * someone else.
 *
 * Why this exists (C-09): markSettlementRecordsFIFO() INCREMENTS `amountSettled`
 * on pending records — it is not idempotent, despite the old comment saying so.
 * The `fifoApplied` flag used to be written AFTER distributing, leaving a wide
 * check-then-act gap: a second admin settling the same account entered
 * repairPendingFIFO(), saw the first payment still flagged false, and distributed
 * it a second time. The account's balance stayed right (that part is
 * transactional) but per-order settlement records were silently marked paid
 * against money nobody paid. Claiming BEFORE distributing closes that gap.
 */
async function claimFifoApplication(db: any, paymentId: string): Promise<number | null> {
  if (!db || !paymentId) return null;
  const ref = db.collection(SETTLEMENT_PAYMENTS).doc(paymentId);
  try {
    return await db.runTransaction(async (tx: any) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const data = snap.data() as any;
      if (data.fifoApplied === true) return null; // already distributed
      const claimedAt = data.fifoClaimedAt?.toMillis?.() ?? 0;
      if (claimedAt && Date.now() - claimedAt < FIFO_CLAIM_STALE_MS) return null; // in flight
      tx.set(ref, { fifoClaimedAt: admin.firestore.Timestamp.now() }, { merge: true });
      return Number(data.fifoAmount ?? data.amount ?? 0);
    });
  } catch {
    return null; // never let claim contention block the caller
  }
}

/**
 * Self-healing: find any payment records for this account where FIFO bookkeeping
 * was interrupted (fifoApplied: false) and re-apply it. Called automatically at the
 * start of every completeSettlement so the account is always in a consistent state.
 * Each candidate is claimed first, so concurrent callers never double-distribute.
 */
async function repairPendingFIFO(
  accountType: SettlementAccountType,
  accountId: string,
): Promise<void> {
  const db = getFirestore();
  if (!db) return;
  const key = accountKey(accountType, accountId);
  try {
    // Only look at recent payments (last 20) to keep this cheap.
    const snap = await db.collection(SETTLEMENT_PAYMENTS)
      .where("accountKey", "==", key)
      .where("fifoApplied", "==", false)
      .orderBy("createdAt", "desc")
      .limit(20)
      .get();
    if (snap.empty) return;

    for (const doc of snap.docs) {
      // Claim first: skips payments another call is distributing right now, and
      // payments already distributed. Only the winner may increment amountSettled.
      const amount = await claimFifoApplication(db, doc.id);
      if (amount === null) continue;
      if (amount <= 0) {
        // Nothing to apply — mark as done to avoid re-processing.
        await doc.ref.set({ fifoApplied: true }, { merge: true }).catch(() => {});
        continue;
      }
      await markSettlementRecordsFIFO(accountType, accountId, amount);
      await doc.ref.set({ fifoApplied: true }, { merge: true }).catch(() => {});
      console.info(`[FIFO repair] Applied ${amount} for ${key} (payment ${doc.id})`);
    }
  } catch (e) {
    // Repair is best-effort — never let it block the caller.
    console.error("[FIFO repair] error:", e);
  }
}

/** FIFO-allocate a settled amount across an account's pending settlement records and
 *  refresh the ledger's pendingCount. Index-free (queries by the single accountKey field). */
async function markSettlementRecordsFIFO(
  accountType: SettlementAccountType,
  accountId: string,
  amount: number,
  dbOverride?: any,
): Promise<void> {
  const db = dbOverride ?? getFirestore();
  if (!db || amount <= 0) return;
  const key = accountKey(accountType, accountId);
  // ── The window must be the OLDEST UNSETTLED records, not 1000 arbitrary ones (H-24)
  //
  // This used to be `.where("accountKey", "==", key).limit(1000)` with the status
  // filter and the FIFO sort applied afterwards, in memory. Three things went wrong
  // once an account passed 1000 lifetime records — roughly four months for an active
  // driver:
  //   1. No orderBy, so Firestore answered in document-id order. Settlement ids are
  //      `${orderId}__${accountType}` and order ids come from .add(), so the window
  //      was 1000 arbitrary records.
  //   2. The status filter ran AFTER the limit, so a driver with 2,900 settled and 100
  //      pending records got a window that was ~97% already-settled — sometimes with no
  //      pending record in it at all, in which case a real cash payment marked nothing.
  //   3. "FIFO" only ordered within that arbitrary window, so the oldest debt paid was
  //      merely the oldest one that happened to fall inside it.
  // The result was a permanent divergence: the ledger totals stayed right (they are
  // transactional) while the per-order records they are supposed to reconcile to
  // drifted, and no later run could repair it.
  //
  // Filtering and ordering in the query makes the window 1000 genuinely pending
  // records, oldest first — real FIFO across the account's whole history. Status is
  // only ever "pending" or "settled" (written at :162, :901 and by the legacy
  // migration script), so equality is sufficient and no record is excluded.
  // Needs the composite index settlements(accountKey ASC, status ASC, createdAt ASC).
  const snap = await db.collection(SETTLEMENTS)
    .where("accountKey", "==", key)
    .where("status", "==", "pending")
    .orderBy("createdAt", "asc")
    .limit(1000)
    .get();
  const pending = snap.docs
    .map((d: any) => ({ ref: d.ref, ...(d.data() as any) }))
    // Redundant now that the query filters, kept as a belt-and-braces guard.
    .filter((s: any) => s.status !== "settled")
    .sort((a: any, b: any) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0));

  const now = admin.firestore.Timestamp.now();
  let remaining = amount;
  let batch = db.batch();
  let ops = 0;
  let newlySettled = 0;

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
      if (fully) newlySettled++;
    }
    if (ops >= 400) { await batch.commit(); batch = db.batch(); ops = 0; }
  }
  if (ops > 0) await batch.commit();

  // ── pendingCount: decrement, never overwrite (H-21) ────────────────────────
  // This used to write an absolute count derived from the snapshot read at the top of
  // the function — several awaited batch commits earlier. recordAccrual() increments
  // the same field inside a transaction when a driver completes an order, so an order
  // finished during that window was counted by the accrual and then erased by this
  // write: a driver with money genuinely owed saw "0 pending orders", and
  // createSettlementRequest() stamped that same 0 onto the permanent request record.
  //
  // Decrementing by the number of records THIS call actually settled commutes with a
  // concurrent +1, so neither update is lost. Read-modify-write in a transaction (not a
  // raw FieldValue.increment) so the value can be clamped at zero: the counter is shown
  // to drivers and vendors, and a negative would be worse than a stale one.
  if (newlySettled > 0) {
    const ledgerRef = db.collection(LEDGER).doc(ledgerId(accountType, accountId));
    await db.runTransaction(async (tx: any) => {
      const snap = await tx.get(ledgerRef);
      if (!snap.exists) return;
      const prev = (snap.data() as any).pendingCount ?? 0;
      tx.set(ledgerRef, { pendingCount: Math.max(0, prev - newlySettled), updatedAt: now }, { merge: true });
    }).catch((e: any) => console.error("[FIFO] pendingCount update failed:", e));
  }
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
    // H-23: this one was worse than random. Ledger ids are `${accountType}:${accountId}`,
    // so an unordered limit returned the 500 accounts whose phone number sorts lowest —
    // deterministically. Every account past that point was invisible to the admin panel
    // on every load, permanently, while its balance stayed owed in the database.
    // Ordered by updatedAt so the accounts with recent activity are the ones shown;
    // every ledger writer stamps updatedAt (recordOrderSettlement, completeSettlement,
    // the request transitions, the H-21 pendingCount update, adjustLedger, and the
    // legacy migration script), so no account can be dropped by the ordering.
    const snap = await db.collection(LEDGER).where("accountType", "==", accountType)
      .orderBy("updatedAt", "desc").limit(500).get();
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
          // H-72: an account whose driver or store was deleted stays listed and
          // stays settleable — the balance is still owed — but the admin has to
          // be able to see that there is nobody left to collect it from.
          ownerStatus: l.ownerStatus ?? "active",
          ownerDeletedAt: l.ownerDeletedAt ?? null,
          ownerSnapshot: l.ownerSnapshot ?? null,
        };
      })
      .sort((a, b) => b.outstanding - a.outstanding);
  } catch (error) {
    // H-33: same — "no accounts owe anything" is a financial claim.
    console.error("listSettlementAccounts error:", error);
    throw error;
  }
}

/**
 * Admin-direct ledger adjustment (without a payment receipt).
 * Used for corrections: "add" increases outstandingTotal (driver owes more),
 * "deduct" decreases it (forgive/credit). Does NOT create a settlementPayments record.
 */
export async function adminAdjustLedger(
  accountType: SettlementAccountType,
  accountId: string,
  amount: number,
  adjustType: "add" | "deduct",
  notes: string,
  adminName?: string,
  dbOverride?: any,
  adminActor?: AdminIdentity,
): Promise<{ ok: boolean; outstandingBefore?: number; outstandingAfter?: number; reason?: string; duplicate?: boolean }> {
  const db = dbOverride ?? getFirestore();
  if (!db) return { ok: false, reason: "no_ledger" };
  const ledgerRef = db.collection(LEDGER).doc(ledgerId(accountType, accountId));
  const delta = Math.abs(Math.round(amount));
  // Same window-derived idempotency as completeSettlement: an adjustment moves
  // money too, and a double-tap used to add/deduct twice. The marker doc is
  // written INSIDE the transaction, so marker and balance always agree.
  const markerIds = adjustmentIdempotencyIds(
    accountType, accountId, delta, adjustType, notes, adminName,
  );
  const markerRefs = markerIds.map((id: string) => db.collection(SETTLEMENT_ADJUSTMENTS).doc(id));
  try {
    const result = await db.runTransaction(async (tx: any) => {
      for (const ref of markerRefs) {
        const seen = await tx.get(ref);
        if (seen.exists) {
          const prevAdj = seen.data() as any;
          return {
            ok: true,
            duplicate: true,
            outstandingBefore: prevAdj.outstandingBefore ?? 0,
            outstandingAfter: prevAdj.outstandingAfter ?? 0,
          };
        }
      }
      const snap = await tx.get(ledgerRef);
      const now = admin.firestore.Timestamp.now();
      const delta = Math.abs(Math.round(amount));
      if (delta <= 0) return { ok: false, reason: "invalid_amount" };

      const stampMarker = (before: number, after: number) =>
        tx.set(markerRefs[0], {
          accountType, accountId, accountKey: accountKey(accountType, accountId),
          adjustType, amount: delta, notes: notes || "", adminName: adminName || "",
          outstandingBefore: before, outstandingAfter: after, createdAt: now,
        });

      if (!snap.exists) {
        // Create a ledger entry with zeroed amounts if none exists yet
        if (adjustType === "deduct") return { ok: false, reason: "no_ledger" };
        tx.set(ledgerRef, {
          accountType, accountId,
          accountKey: accountKey(accountType, accountId),
          totalOrders: 0, totalGross: 0, totalCommission: 0,
          outstandingTotal: delta, pendingCount: 0, totalSettled: 0,
          direction: directionFor(accountType),
          adjustmentNotes: notes, adjustedBy: adminName || "",
          updatedAt: now, createdAt: now,
        });
        stampMarker(0, delta);
        return { ok: true, outstandingBefore: 0, outstandingAfter: delta };
      }

      const prev = snap.data() as any;
      const before = prev.outstandingTotal ?? 0;
      const after = adjustType === "add"
        ? before + delta
        : Math.max(0, before - delta);

      tx.set(ledgerRef, {
        outstandingTotal: after,
        adjustmentNotes: notes,
        adjustedBy: adminName || "",
        updatedAt: now,
      }, { merge: true });

      stampMarker(before, after);
      return { ok: true, outstandingBefore: before, outstandingAfter: after };
    });

    // ── Financial ledger + audit (append-only) ──
    // A manual correction becomes a NEW typed movement (never an in-place edit of
    // history): "add" credits the account (owes/owed more), "deduct" debits it.
    // Both writes are awaited and their outcome reported (R-03) — the balance has
    // already committed, so this cannot block it, but an unrecorded correction must
    // not be indistinguishable from a recorded one.
    if (result.ok && !(result as any).duplicate) {
      (result as any).recordFailed = !(await recordFinancialTrail(
        "ledger.adjust",
        () => recordAudit({
        action: "ledger.adjust",
        actorType: "admin",
        actorId: adminActor?.adminId,
        actorUsername: adminActor?.username || adminName || "",
        actorRole: adminActor?.role,
        actorName: adminActor?.username || adminName || "",
        targetType: accountType,
        targetId: accountId,
        resourceType: accountType,
        resourceId: accountId,
        amount: delta,
        notes: `${adjustType}: ${notes || ""}`.trim(),
        before: { outstandingTotal: (result as any).outstandingBefore },
        after: { outstandingTotal: (result as any).outstandingAfter },
        }),
        () => recordLedgerEntry({
          accountType, accountId,
          type: "adjustment",
          ...(adjustType === "add" ? { credit: delta } : { debit: delta }),
          createdBy: adminActor?.username || adminName || "admin",
          entryId: `${markerIds[0]}__adjustment`,
          description: notes || "تعديل يدوي",
        }),
      ));
    }
    return result;
  } catch (error) {
    console.error("adminAdjustLedger tx error:", error);
    return { ok: false, reason: "transaction_failed" };
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
    // H-23: the most damaging of the six. In a settlement dispute an admin opens the
    // driver's payment history to prove what was paid; unordered, an account with 340
    // payments answered with 100 arbitrary ones and no indication that anything had
    // been cut — so the record used to settle an argument about money was a silent
    // random sample of itself.
    const snap = await db.collection(SETTLEMENT_PAYMENTS).where("accountKey", "==", key)
      .orderBy("createdAt", "desc").limit(max).get();
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) }))
      .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
  } catch (error) {
    // H-33: an empty payment history in a settlement dispute reads as "nothing was
    // ever paid". Call sites that deliberately tolerate a gap keep their own
    // .catch(() => []) and are unaffected.
    console.error("getSettlementPayments error:", error);
    throw error;
  }
}
