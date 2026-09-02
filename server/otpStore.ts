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
/**
 * Digits in a login code.
 *
 * C-04 raised this from 4 to 6. It is back at 4 at the platform owner's explicit
 * request: the code space drops from 1,000,000 to 10,000, so what stands between a
 * guesser and an account is no longer the code's width but OTP_MAX_ATTEMPTS, the
 * lockout, and the five-minute TTL. Those are unchanged and still apply per phone
 * number regardless of the caller's IP or device.
 */
export const OTP_LENGTH = 4;

/** Persistent abuse state: shared by every instance and surviving restarts. */
export const OTP_ABUSE_COLLECTION = "otpAbuse";
export const OTP_ABUSE_WINDOW_MS = 60 * 60 * 1000;
/** Reuse the existing five-attempt security budget for the hourly issue budget. */
export const OTP_MAX_ISSUES_PER_WINDOW = OTP_MAX_ATTEMPTS;
export const OTP_RESEND_COOLDOWNS_MS = [0, 30 * 1000, 60 * 1000, 300 * 1000] as const;

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

function otpTimestamp(ms: number): any {
  return admin.firestore.Timestamp.fromMillis(ms);
}

function otpMillis(value: any): number {
  if (value && typeof value.toMillis === "function") return value.toMillis();
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Same canonical identity used by the HTTP OTP routes, including Iraqi variants. */
export function normalizeOtpPhone(raw: string): string {
  const text = String(raw || "").trim();
  const d = text.replace(/\D/g, "");
  if (/^009647\d{9}$/.test(d)) return "0" + d.slice(5);
  if (/^9647\d{9}$/.test(d)) return "0" + d.slice(3);
  if (/^07\d{9}$/.test(d)) return d;
  if (/^7\d{9}$/.test(d)) return "0" + d;
  // HTTP routes reject this shape; preserving it here keeps the storage helper
  // total and prevents synthetic/unit keys from collapsing into one identity.
  return text;
}

function resendCooldownMs(sendCount: number): number {
  if (sendCount <= 0) return OTP_RESEND_COOLDOWNS_MS[0];
  if (sendCount === 1) return OTP_RESEND_COOLDOWNS_MS[1];
  if (sendCount === 2) return OTP_RESEND_COOLDOWNS_MS[2];
  return OTP_RESEND_COOLDOWNS_MS[3];
}

function freshAbuseState(data: any, now: number): any {
  const started = otpMillis(data?.windowStartedAt);
  if (!started || now >= started + OTP_ABUSE_WINDOW_MS) {
    return {
      windowStartedAt: now,
      sendCount: 0,
      failedAttempts: 0,
      lastIssuedAt: 0,
      blockedUntil: 0,
    };
  }
  return {
    windowStartedAt: started,
    sendCount: Math.max(0, Number(data?.sendCount) || 0),
    failedAttempts: Math.max(0, Number(data?.failedAttempts) || 0),
    lastIssuedAt: otpMillis(data?.lastIssuedAt),
    blockedUntil: otpMillis(data?.blockedUntil),
  };
}

function otpRateLimitError(retryAfterMs: number, reason: string): any {
  const error: any = new Error(reason);
  error.code = "otp_rate_limited";
  error.retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return error;
}

/** The code itself. Never leaves this process except via the SMS provider. */
export function newOtpCode(): string {
  // Bounds derived from OTP_LENGTH rather than written out, so the width and the
  // range can never drift apart the way they would with a second literal. The low
  // bound is the smallest number of that width, which is also what keeps a leading
  // zero impossible — the fixed-width input on the phone stays aligned.
  const min = 10 ** (OTP_LENGTH - 1);
  const max = 10 ** OTP_LENGTH;
  return crypto.randomInt(min, max).toString();
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

  const canonicalPhone = normalizeOtpPhone(phoneNumber);
  const code = newOtpCode();
  const salt = crypto.randomBytes(16).toString("hex");
  const otpRef = db.collection(OTP_COLLECTION).doc(canonicalPhone);
  const abuseRef = db.collection(OTP_ABUSE_COLLECTION).doc(canonicalPhone);

  await db.runTransaction(async (tx: any) => {
    const abuseSnap = await tx.get(abuseRef);
    const state = freshAbuseState(abuseSnap.exists ? abuseSnap.data() : null, now);

    if (state.blockedUntil > now || state.failedAttempts >= OTP_MAX_ATTEMPTS) {
      const retryUntil = state.blockedUntil || state.windowStartedAt + OTP_ABUSE_WINDOW_MS;
      throw otpRateLimitError(retryUntil - now, "OTP phone is temporarily locked");
    }

    if (state.sendCount >= OTP_MAX_ISSUES_PER_WINDOW) {
      throw otpRateLimitError(
        state.windowStartedAt + OTP_ABUSE_WINDOW_MS - now,
        "OTP hourly issue limit reached",
      );
    }

    const cooldown = resendCooldownMs(state.sendCount);
    if (state.lastIssuedAt && now < state.lastIssuedAt + cooldown) {
      throw otpRateLimitError(state.lastIssuedAt + cooldown - now, "OTP resend cooldown active");
    }

    const nextSendCount = state.sendCount + 1;
    tx.set(abuseRef, {
      phoneNumber: canonicalPhone,
      windowStartedAt: otpTimestamp(state.windowStartedAt),
      sendCount: nextSendCount,
      failedAttempts: state.failedAttempts,
      lastIssuedAt: otpTimestamp(now),
      blockedUntil: state.blockedUntil ? otpTimestamp(state.blockedUntil) : null,
      updatedAt: otpTimestamp(now),
      // TTL-compatible expiry; the hourly window is the lifetime of this state.
      expiresAt: otpTimestamp(state.windowStartedAt + OTP_ABUSE_WINDOW_MS),
    });
    tx.set(otpRef, {
      phoneNumber: canonicalPhone,
      codeHash: hashOtp(code, salt),
      salt,
      attempts: 0,
      // A Firestore Timestamp, because that is what a native TTL policy reads.
      expiresAt: otpTimestamp(now + OTP_TTL_MS),
      createdAt: otpTimestamp(now),
    });
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

  const canonicalPhone = normalizeOtpPhone(phoneNumber);
  const ref = db.collection(OTP_COLLECTION).doc(canonicalPhone);
  const abuseRef = db.collection(OTP_ABUSE_COLLECTION).doc(canonicalPhone);
  try {
    return await db.runTransaction(async (tx: any) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return "not_found" as const;

      const abuseSnap = await tx.get(abuseRef);
      const state = freshAbuseState(abuseSnap.exists ? abuseSnap.data() : null, now);
      if (state.blockedUntil > now || state.failedAttempts >= OTP_MAX_ATTEMPTS) {
        return "too_many_attempts" as const;
      }

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
        const nextFailedAttempts = state.failedAttempts + 1;
        const blockedUntil = nextFailedAttempts >= OTP_MAX_ATTEMPTS
          ? state.windowStartedAt + OTP_ABUSE_WINDOW_MS
          : 0;
        tx.set(abuseRef, {
          phoneNumber: canonicalPhone,
          windowStartedAt: otpTimestamp(state.windowStartedAt),
          sendCount: state.sendCount,
          failedAttempts: nextFailedAttempts,
          lastIssuedAt: state.lastIssuedAt ? otpTimestamp(state.lastIssuedAt) : null,
          blockedUntil: blockedUntil ? otpTimestamp(blockedUntil) : null,
          updatedAt: otpTimestamp(now),
          expiresAt: otpTimestamp(state.windowStartedAt + OTP_ABUSE_WINDOW_MS),
        });
        // Destroy the code once it has been guessed at too often, so the
        // remaining validity window cannot be walked.
        if (next >= OTP_MAX_ATTEMPTS) tx.delete(ref);
        else tx.update(ref, { attempts: next });
        return "wrong_code" as const;
      }

      // Single use and successful verification reset the phone abuse budget.
      tx.delete(ref);
      tx.delete(abuseRef);
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
export async function sweepExpiredOtpAbuse(
  now: number = Date.now(),
  limit: number = OTP_SWEEP_LIMIT,
): Promise<number> {
  const db = getFirestore();
  if (!db) return 0;
  try {
    const snap = await db
      .collection(OTP_ABUSE_COLLECTION)
      .where("expiresAt", "<=", admin.firestore.Timestamp.fromMillis(now))
      .limit(limit)
      .get();
    if (snap.empty) return 0;
    const batch = db.batch();
    snap.docs.forEach((d: any) => batch.delete(d.ref));
    await batch.commit();
    return snap.docs.length;
  } catch (error) {
    console.error("[OTP] abuse sweep failed:", (error as any)?.message ?? error);
    return 0;
  }
}

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
    void sweepExpiredOtpAbuse();
  }, intervalMs);
  // Must not hold the process open on shutdown.
  sweepTimer.unref?.();
}

