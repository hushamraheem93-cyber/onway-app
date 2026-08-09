// Customer token revocation (audit finding H-10).
//
// Customer tokens live for 30 days and had NO revocation path of any kind. Admin
// sessions already have one — persisted, hydrated at boot, checked on every
// request — but customers did not, so:
//
//   • deleting an account left its token fully valid for up to a month;
//   • a stolen phone meant a month of access to addresses, order history and
//     support chat, with nothing support could do about it.
//
// This mirrors adminAuth.ts's revocation deliberately, rather than the
// `tokenVersion`-on-the-user-document approach: that one costs a Firestore read on
// EVERY authenticated customer request, on the hot path, and would also have to
// survive the user document being deleted — which is precisely the case that has
// to work. Keying on the phone number instead means the record outlives the
// account, and the check stays synchronous and free.
//
// Storage: one document (adminConfig/customerRevocation, backend-only per
// firestore.rules) holding { phone -> epochMs }. No change to the users schema.
import { getFirestore } from "./firebase";

const REVOCATION_COLLECTION = "adminConfig";
const REVOCATION_DOC = "customerRevocation";

/** Longest a customer token can live; entries older than this can be pruned. */
const CUSTOMER_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** phone -> "every token issued before this instant is invalid" (epoch ms). */
const revokedBefore = new Map<string, number>();

/**
 * Load persisted revocation state into memory. Call once during boot, BEFORE the
 * server starts listening, so no request is served with an empty revocation set.
 */
export async function loadCustomerRevocationState(): Promise<void> {
  try {
    const db = getFirestore();
    if (!db) return;
    const snap = await db.collection(REVOCATION_COLLECTION).doc(REVOCATION_DOC).get();
    if (!snap.exists) return;
    const data = (snap.data() as any)?.phones || {};
    const cutoff = Date.now() - CUSTOMER_TOKEN_TTL_MS;
    revokedBefore.clear();
    for (const [phone, at] of Object.entries(data)) {
      // A revocation older than the longest possible token life can no longer
      // match anything — drop it rather than growing the map forever.
      if (Number(at) > cutoff) revokedBefore.set(phone, Number(at));
    }
    console.log(`[AUTH] Loaded customer revocation state (${revokedBefore.size} phone(s)).`);
  } catch (err: any) {
    // Never fail the boot over this: an unreachable Firestore would take the whole
    // server down. Logged loudly because it degrades revocation until the next boot.
    console.error("[AUTH] Could not load customer revocation state:", err?.message);
  }
}

function persist(): void {
  const db = getFirestore();
  if (!db) return;
  const cutoff = Date.now() - CUSTOMER_TOKEN_TTL_MS;
  const phones: Record<string, number> = {};
  for (const [phone, at] of revokedBefore) {
    if (at > cutoff) phones[phone] = at;
    else revokedBefore.delete(phone);
  }
  db.collection(REVOCATION_COLLECTION)
    .doc(REVOCATION_DOC)
    .set({ phones, updatedAt: Date.now() }, { merge: false })
    .catch((err: any) => console.error("[AUTH] Could not persist customer revocation:", err?.message));
}

/**
 * Invalidate every customer token issued for `phoneNumber` up to now.
 *
 * In-memory first so the very next request is already covered, then persisted so
 * the decision survives a restart — the same ordering adminAuth uses.
 */
export function revokeCustomerTokens(phoneNumber: string): void {
  const phone = String(phoneNumber || "").trim();
  if (!phone) return;
  revokedBefore.set(phone, Date.now());
  persist();
}

/**
 * Was this token issued before its owner's tokens were revoked?
 *
 * `iatSeconds` is the JWT `iat` claim. A token with no `iat` cannot be placed in
 * time, so it is treated as revoked whenever a revocation exists for the phone —
 * failing closed is the right side to err on for a credential check.
 */
export function isCustomerTokenRevoked(phoneNumber: string, iatSeconds: unknown): boolean {
  const at = revokedBefore.get(String(phoneNumber || "").trim());
  if (!at) return false;
  const iat = Number(iatSeconds);
  if (!Number.isFinite(iat)) return true;
  return iat * 1000 < at;
}

/** Test seam — clears in-memory state without touching Firestore. */
export function __resetCustomerRevocationForTests(): void {
  revokedBefore.clear();
}
