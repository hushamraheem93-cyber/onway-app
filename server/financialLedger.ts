// ── Financial Ledger + Audit Log ────────────────────────────────────────────
// An APPEND-ONLY, typed, double-entry-style ledger that records every financial
// movement (order sale, delivery fee, commission, settlement, adjustment, …) as
// an immutable entry with a running balance, plus an immutable admin audit log.
//
// Design principles (match the OnWay financial spec):
//   • Entries are NEVER updated or deleted — corrections are new entries
//     (adjustment / refund), so the history is always fully auditable.
//   • Every entry stores balanceAfter, computed atomically from a per-account
//     running-balance "head" inside a Firestore transaction, so concurrent
//     writes can never interleave and corrupt the balance.
//   • Every order-driven entry is idempotent by a deterministic document id
//     (`${orderId}__${accountType}__${type}`), so replays/retries can never
//     double-record — mirroring the settlement engine's idempotency discipline.
//
// This layer runs ALONGSIDE the existing settlement engine (settlement.ts), which
// remains the source of truth for outstanding balances that gate settlement
// requests. The ledger provides the auditable, bank-style statement view and is
// written best-effort at the same money points, so a ledger hiccup can never
// break an actual settlement.
import admin from "firebase-admin";
import { getFirestore } from "./firebase";

export type LedgerAccountType = "vendor" | "driver" | "platform";

/** Movement taxonomy from the financial spec. */
export type LedgerEntryType =
  | "order_sale"          // vendor: revenue for goods on a delivered order
  | "delivery_fee"        // driver: the trip reward they keep
  | "platform_commission" // platform revenue / vendor's deducted commission
  | "cash_collected"      // driver: cash taken from the customer (they now owe it)
  | "settlement"          // a settlement payment moved money between the account and the platform
  | "adjustment"          // manual correction (admin), always a NEW entry
  | "refund"
  | "bonus"
  | "penalty"
  | "subscription"
  | "deposit"
  | "withdrawal";

const LEDGER = "financialLedger";
const LEDGER_HEADS = "financialLedgerHeads";
const AUDIT = "auditLog";

export function ledgerHeadId(accountType: LedgerAccountType, accountId: string): string {
  return `${accountType}:${accountId}`;
}

/** Single-field key stored on each entry so the statement needs only a single-field
 *  index (no composite index required) — same discipline as the settlement engine. */
export function ledgerAccountKey(accountType: LedgerAccountType, accountId: string): string {
  return `${accountType}:${accountId}`;
}

/** Deterministic entry id for order-driven movements → idempotency. */
export function orderEntryId(orderId: string, accountType: LedgerAccountType, type: LedgerEntryType): string {
  return `${orderId}__${accountType}__${type}`;
}

export interface LedgerInput {
  accountType: LedgerAccountType;
  accountId: string;
  accountName?: string;
  type: LedgerEntryType;
  /** Exactly one of debit/credit is the amount; the other stays 0. Both ≥ 0. */
  debit?: number;
  credit?: number;
  orderId?: string | null;
  settlementRef?: string | null;
  description?: string;
  createdBy?: string;
  /** Deterministic id for idempotency. Omit for naturally-unique ad-hoc entries. */
  entryId?: string;
  metadata?: Record<string, any>;
}

export type LedgerOutcome = "recorded" | "duplicate" | "failed";

/**
 * Append one immutable ledger entry, computing balanceAfter atomically from the
 * account's running-balance head. Idempotent when `entryId` is supplied.
 *
 * balanceAfter = previousBalance + credit − debit  (a signed running balance;
 * its meaning — "platform owes vendor" vs "driver owes platform" — is per
 * accountType, but the arithmetic is uniform and always reconciles).
 */
export async function recordLedgerEntry(input: LedgerInput, dbOverride?: any): Promise<LedgerOutcome> {
  const db = dbOverride ?? getFirestore();
  if (!db) return "failed";

  const debit = Math.max(0, Math.round(input.debit || 0));
  const credit = Math.max(0, Math.round(input.credit || 0));
  const headRef = db.collection(LEDGER_HEADS).doc(ledgerHeadId(input.accountType, input.accountId));
  const entryRef = input.entryId
    ? db.collection(LEDGER).doc(input.entryId)
    : db.collection(LEDGER).doc();

  try {
    return await db.runTransaction(async (tx: any) => {
      // Reads first (transaction requirement).
      if (input.entryId) {
        const existing = await tx.get(entryRef);
        if (existing.exists) return "duplicate" as const; // already recorded → safe no-op
      }
      const headSnap = await tx.get(headRef);
      const prevBalance = headSnap.exists ? Number((headSnap.data() as any).balance) || 0 : 0;
      const balanceAfter = prevBalance + credit - debit;
      const now = admin.firestore.Timestamp.now();

      // Writes: the immutable entry …
      tx.set(entryRef, {
        accountType: input.accountType,
        accountId: input.accountId,
        accountKey: ledgerAccountKey(input.accountType, input.accountId),
        accountName: input.accountName || input.accountId,
        type: input.type,
        debit,
        credit,
        balanceAfter,
        orderId: input.orderId ?? null,
        settlementRef: input.settlementRef ?? null,
        description: input.description || "",
        createdBy: input.createdBy || "system",
        createdAt: now,
        ...(input.metadata ? { metadata: input.metadata } : {}),
      });

      // … and the running-balance head (the ONLY mutable doc — a cache of the sum).
      tx.set(
        headRef,
        {
          accountType: input.accountType,
          accountId: input.accountId,
          accountName: input.accountName || input.accountId,
          balance: balanceAfter,
          entryCount: (headSnap.exists ? Number((headSnap.data() as any).entryCount) || 0 : 0) + 1,
          updatedAt: now,
          ...(headSnap.exists ? {} : { createdAt: now }),
        },
        { merge: true },
      );

      return "recorded" as const;
    });
  } catch (err: any) {
    console.error(
      `[LEDGER] FAILED account=${input.accountType}:${input.accountId} type=${input.type} ` +
        `debit=${debit} credit=${credit} reason=${err?.message ?? err}`,
    );
    return "failed";
  }
}

/**
 * Record several entries as an all-or-nothing batch is NOT what we want here:
 * each entry must be independently idempotent (a partial replay re-runs only the
 * missing ones). So this just loops recordLedgerEntry and reports per-entry
 * outcomes; callers treat "failed" as "retry later".
 */
export async function recordLedgerEntries(inputs: LedgerInput[], dbOverride?: any): Promise<LedgerOutcome[]> {
  const out: LedgerOutcome[] = [];
  for (const input of inputs) out.push(await recordLedgerEntry(input, dbOverride));
  return out;
}

/** Current running balance for an account (0 if none yet). */
export async function getLedgerBalance(accountType: LedgerAccountType, accountId: string): Promise<number> {
  const db = getFirestore();
  if (!db) return 0;
  try {
    const snap = await db.collection(LEDGER_HEADS).doc(ledgerHeadId(accountType, accountId)).get();
    return snap.exists ? Number((snap.data() as any).balance) || 0 : 0;
  } catch {
    return 0;
  }
}

/**
 * Bank-style statement for an account: entries newest-first, each with the
 * running balanceAfter already stored at write time. Index-free (single-field
 * accountKey filter + in-memory sort), matching the settlement engine's approach.
 */
export async function getAccountStatement(
  accountType: LedgerAccountType,
  accountId: string,
  max = 200,
): Promise<{ balance: number; entries: any[] }> {
  const db = getFirestore();
  if (!db) return { balance: 0, entries: [] };
  try {
    const snap = await db
      .collection(LEDGER)
      .where("accountKey", "==", ledgerAccountKey(accountType, accountId))
      .limit(max)
      .get();
    const entries = snap.docs
      .map((d: any) => ({ id: d.id, ...(d.data() as any) }))
      .sort((a: any, b: any) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
    const balance = await getLedgerBalance(accountType, accountId);
    return { balance, entries };
  } catch (err) {
    console.error("getAccountStatement error:", err);
    return { balance: 0, entries: [] };
  }
}

// ── Immutable Audit Log ─────────────────────────────────────────────────────

export interface AuditInput {
  action: string;                 // e.g. "settlement.complete", "ledger.adjust"
  actorType?: "admin" | "system";
  actorName?: string;
  targetType?: string;            // "vendor" | "driver" | "settlementRequest" | …
  targetId?: string;
  amount?: number;
  referenceId?: string;           // settlement ref / payment id
  notes?: string;
  metadata?: Record<string, any>;
}

/**
 * Append an immutable audit entry. Best-effort and never throws: an audit write
 * must not break the operation it is recording. Never updated or deleted.
 */
export async function recordAudit(input: AuditInput, dbOverride?: any): Promise<void> {
  const db = dbOverride ?? getFirestore();
  if (!db) return;
  try {
    await db.collection(AUDIT).add({
      action: input.action,
      actorType: input.actorType || "admin",
      actorName: input.actorName || "",
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      amount: input.amount ?? null,
      referenceId: input.referenceId ?? null,
      notes: input.notes || "",
      ...(input.metadata ? { metadata: input.metadata } : {}),
      createdAt: admin.firestore.Timestamp.now(),
    });
  } catch (err: any) {
    console.error(`[AUDIT] could not record action=${input.action}: ${err?.message}`);
  }
}

/** Read the audit log, newest-first (optionally filtered by target). */
export async function listAuditLog(
  filter: { targetType?: string; targetId?: string } = {},
  max = 200,
): Promise<any[]> {
  const db = getFirestore();
  if (!db) return [];
  try {
    let q: any = db.collection(AUDIT);
    if (filter.targetType) q = q.where("targetType", "==", filter.targetType);
    if (filter.targetId) q = q.where("targetId", "==", filter.targetId);
    const snap = await q.limit(max).get();
    return snap.docs
      .map((d: any) => ({ id: d.id, ...(d.data() as any) }))
      .sort((a: any, b: any) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
  } catch (err) {
    console.error("listAuditLog error:", err);
    return [];
  }
}
