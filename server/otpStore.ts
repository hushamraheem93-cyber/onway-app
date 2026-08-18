/**
 * H-75 — OTP state, moved out of process memory.
 *
 * It used to be `const otpStore = new Map()` inside firebase.ts. That is the
 * root of trust for every identity in the system — the customer token minted
 * from it is also the proof that unlocks driver and vendor registration — and it
 * had three problems the audit named:
 *
 *   1. RESTART. Every deploy, crash or `pm2 reload` wiped it. Anyone mid-signup
 *      had their code silently stop working, with no error that explained why.
 *   2. HORIZONTAL SCALING. The code lived in one process. `pm2 start -i 2`, or a
 *      second VPS behind a load balancer, means send-otp lands on instance A and
 *      verify-otp on instance B, which has never heard of the code. The platform
 *      could not be scaled at all without breaking login.
 *   3. UNBOUNDED GROWTH. An entry was removed on success, on expiry-when-read, or
 *      after five wrong attempts — so a code that was requested and never used
 *      was never removed. Every abandoned signup leaked an entry for the life of
 *      the process.
 *
 * Storage is Firestore, which this project already runs on: shared by every
 * instance, survives restarts, and supports a native TTL policy. No new service
 * is introduced.
 *
 * ── Security ────────────────────────────────────────────────────────────────
 * The code is never stored. Each record keeps a random salt and
 * sha256(salt + ":" + code), compared with `timingSafeEqual`, so a leaked
 * database dump does not hand over live codes. The plaintext exists only inside
 * the send-otp request, on its way to the SMS provider — it is never logged and
 * never returned in a response.
 *
 * The document id is the normalised phone number, which makes resend
 * invalidation structural rather than a step someone can forget: writing a new
 * code overwrites the old record, so exactly one code is live per number.
 *
 * Consumption is transactional. Two requests racing with the same valid code
 * cannot both win — the winner deletes the record inside the transaction and the
 * loser re-reads and finds nothing.
 *
 * Every failure path returns "not verified". A datastore outage must never
 * become a way in.
 */
import crypto from "crypto";
import admin from "firebase-admin";
import { getFirestore } from "./firebase";

export const OTP_COLLECTION = "otpCodes";
export const OTP_TTL_MS = 5 * 60 * 1000;
/** Wrong tries before the code is destroyed and a fresh one must be requested. */
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_LENGTH = 6;

/** Most expired records a single sweep will delete. Bounded on purpose. */
export const OTP_SWEEP_LIMIT = 200;
/** How often the in-process safety-net sweep runs. */
export const OTP_SWEEP_INTERVAL_MS = 10 * 60 * 1000;

export type OtpVerifyResult =
  | "verified"
  | "not_found"
  | "expired"
  | "wrong_code"
  | "too_many_attempts"
  | "unavailable";

function hashOtp(code: string, salt: string): string {
  return crypto.createHash("sha256").update(`${salt}:${code}`).digest("hex");
}

/** Constant-time comparison of two hex digests of equal length. */
function digestsMatch(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

/** The six-digit code itself. Never leaves this process except via the SMS provider. */
export function newOtpCode(): string {
  // C-04: a 4-digit code is 9,000 possibilities and was brute-forceable within
  // hours. randomInt(100000, 1000000) is crypto-grade, never returns a leading
  // zero, and is always exactly OTP_LENGTH characters.
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Mint a code for this number and store its hash.
 *
 * Returns the plaintext for delivery. Overwrites any existing record for the
 * number, which is what makes a resend invalidate the previous code.
 *
 * Throws if the datastore is unavailable: a code that was never stored can never
 * be verified, and telling the user "sent" would strand them.
 */
export async function issueOtp(
  phoneNumber: string,
  now: number = Date.now(),
): Promise<string> {
  const db = getFirestore();
  if (!db) throw new Error("otp store unavailable");

  const code = newOtpCode();
  const salt = crypto.randomBytes(16).toString("hex");

  await db.collection(OTP_COLLECTION).doc(phoneNumber).set({
    phoneNumber,
    codeHash: hashOtp(code, salt),
    salt,
    attempts: 0,
    // A Firestore Timestamp, because that is what a native TTL policy reads.
    expiresAt: admin.firestore.Timestamp.fromMillis(now + OTP_TTL_MS),
    createdAt: admin.firestore.Timestamp.fromMillis(now),
  });

  return code;
}

function expiresAtMillis(data: any): number {
  const v = data?.expiresAt;
  if (v && typeof v.toMillis === "function") return v.toMillis();
  if (typeof v === "number") return v;
  // A record with no readable expiry is treated as already expired — fail closed.
  return 0;
}

/**
 * Check a code and consume it.
 *
 * The whole read/validate/delete cycle runs in one transaction so a code can be
 * spent exactly once even under concurrent requests.
 */
export async function consumeOtp(
  phoneNumber: string,
  code: string,
  now: number = Date.now(),
): Promise<OtpVerifyResult> {
  const db = getFirestore();
  if (!db) return "unavailable";

  const ref = db.collection(OTP_COLLECTION).doc(phoneNumber);
  try {
    return await db.runTransaction(async (tx: any) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return "not_found" as const;
      const data = snap.data() as any;

      if (now > expiresAtMillis(data)) {
        tx.delete(ref);
        return "expired" as const;
      }

      const attempts = Number(data.attempts) || 0;
      if (attempts >= OTP_MAX_ATTEMPTS) {
        tx.delete(ref);
        return "too_many_attempts" as const;
      }

      if (!digestsMatch(String(data.codeHash ?? ""), hashOtp(code, String(data.salt ?? "")))) {
        const next = attempts + 1;
        // Destroy the code once it has been guessed at too often, so the
        // remaining validity window cannot be walked.
        if (next >= OTP_MAX_ATTEMPTS) tx.delete(ref);
        else tx.update(ref, { attempts: next });
        return "wrong_code" as const;
      }

      // Single use: the record is gone before this transaction commits, so a
      // concurrent verification of the same code finds nothing.
      tx.delete(ref);
      return "verified" as const;
    });
  } catch (error) {
    // Never let an infrastructure failure read as a successful verification.
    console.error("[OTP] verification failed:", (error as any)?.message ?? error);
    return "unavailable";
  }
}

/**
 * Delete expired records, up to a fixed cap.
 *
 * This is a safety net, not the primary mechanism. The real answer is a
 * Firestore TTL policy on `otpCodes.expiresAt`, which Google applies server-side
 * regardless of how many instances are running — see the H-75 report for the
 * one-off deployment step. This sweep keeps the collection bounded until that
 * policy is in place, and costs nothing once it is (there is nothing to find).
 *
 * Safe to run from several instances at once: deleting an already-deleted
 * document is not an error.
 */
export async function sweepExpiredOtps(
  now: number = Date.now(),
  limit: number = OTP_SWEEP_LIMIT,
): Promise<number> {
  const db = getFirestore();
  if (!db) return 0;
  try {
    const snap = await db
      .collection(OTP_COLLECTION)
      .where("expiresAt", "<=", admin.firestore.Timestamp.fromMillis(now))
      .limit(limit)
      .get();
    if (snap.empty) return 0;
    const batch = db.batch();
    snap.docs.forEach((d: any) => batch.delete(d.ref));
    await batch.commit();
    return snap.docs.length;
  } catch (error) {
    console.error("[OTP] sweep failed:", (error as any)?.message ?? error);
    return 0;
  }
}

let sweepTimer: NodeJS.Timeout | null = null;

/** Start the bounded safety-net sweep. Idempotent. */
export function startOtpSweeper(intervalMs: number = OTP_SWEEP_INTERVAL_MS): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    void sweepExpiredOtps();
  }, intervalMs);
  // Must not hold the process open on shutdown.
  sweepTimer.unref?.();
}

export function stopOtpSweeper(): void {
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
}
