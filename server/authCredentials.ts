/**
 * Password credentials for phone-number identities.
 *
 * WHY THIS IS NOT A FIELD ON THE USER DOCUMENT
 *
 * The obvious design is `users.passwordHash`. It does not work here, and the
 * live data says so: not one driver and not one vendor has a `users` document.
 * createUser() is called from exactly one place — the customer profile path in
 * routes.ts — so a password kept on that document would have been settable by
 * customers only, and the vendor and driver apps would have shown a "create
 * password" screen that silently did nothing.
 *
 * What all three roles DO share is the phone number. /api/auth/verify-otp mints
 * a customer JWT keyed by phone, and both /api/driver/mobile-auth and
 * /api/vendor/mobile-auth exchange that JWT (plus a record in their own
 * collection) for a role token. So the phone is the identity the platform
 * already authenticates, and that is what this collection is keyed by —
 * `authCredentials/{canonicalPhone}`, exactly like `otpAbuse`.
 *
 * Consequence, stated plainly: one password per phone number opens whichever
 * roles that number holds. That is not a change — an OTP does the same thing
 * today, because the OTP also produces the customer JWT the role tokens are
 * exchanged for.
 *
 * The users, drivers and vendors schemas are untouched, and nothing here needs a
 * migration: a phone with no document simply has no password and falls back to
 * OTP, which is exactly how every account behaves before it sets one.
 *
 * WHAT IS STORED
 *
 * A bcrypt hash and two timestamps. Never the password. The cost factor matches
 * server/adminRbac.ts (12) rather than the older 10 used by the vendor web-panel
 * login, because this is new code and should not inherit the weaker setting.
 *
 * LOCKOUT
 *
 * A counter of its own — `passwordAttempts` — not otpAbuse. Sharing otpAbuse
 * would mean five wrong passwords also stop the user requesting an OTP, which
 * would lock someone out of the recovery path with the very mistake that makes
 * them need it. They are separate so a failed password never blocks recovery.
 *
 * The two cannot be played against each other, though. OTP recovery does not
 * clear the password lockout — only actually setting a new password does — so
 * "run the forgot-password flow" is not a way to buy five more password guesses.
 * And a locked phone is refused before the hash is ever compared, so the lockout
 * cannot be skipped by switching endpoint.
 *
 * The shape mirrors otpStore.ts on purpose: same window-based reset, same
 * "count, then block until the window ends" logic, so there is one security
 * model in this codebase rather than two.
 */
import bcrypt from "bcryptjs";
import { getFirestore } from "./firebase";
import { normalizeOtpPhone } from "./otpStore";

/** One document per canonical phone. Backend-only, per firestore.rules. */
export const AUTH_CREDENTIALS_COLLECTION = "authCredentials";

/**
 * Shortest password accepted.
 *
 * Eight, with no character-class rules. A long passphrase beats a short string
 * with a symbol bolted on, and complexity rules push people towards writing the
 * password down. The real bound on guessing here is the lockout below, not the
 * shape of the string.
 */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * Longest password accepted.
 *
 * bcrypt silently truncates at 72 BYTES, so anything past that is not actually
 * part of the credential. Arabic is multi-byte in UTF-8, so the limit is checked
 * in bytes rather than characters — a 72-character Arabic passphrase is ~144
 * bytes and would have been half-ignored.
 */
export const PASSWORD_MAX_BYTES = 72;

/** Wrong passwords before the phone is locked. Matches OTP_MAX_ATTEMPTS. */
export const PASSWORD_MAX_ATTEMPTS = 5;

/**
 * How long a locked phone stays locked.
 *
 * Fifteen minutes, not the OTP window's hour: a password is something the owner
 * knows and may simply have mistyped, and OTP recovery stays open the whole time
 * anyway. Long enough to make online guessing worthless, short enough that a
 * genuine user is not stranded.
 */
export const PASSWORD_LOCKOUT_MS = 15 * 60 * 1000;

/** bcrypt cost. Same as adminRbac.ts. */
const BCRYPT_COST = 12;

export interface PasswordCheck {
  /** Did the password match? False for every failure reason. */
  ok: boolean;
  /**
   * Why it failed, for the SERVER's own logging and for choosing a status code.
   * It is never handed to the caller verbatim: the endpoints return one generic
   * message so this cannot be used to tell "no account" from "wrong password".
   */
  reason?: "no_password" | "wrong_password" | "locked" | "unavailable";
  /** Seconds until the lockout lifts, when reason is "locked". */
  retryAfterSeconds?: number;
}

/** Is this string usable as a password? Shape only — no strength scoring. */
export function passwordPolicyError(password: unknown): string | null {
  if (typeof password !== "string") return "كلمة المرور مطلوبة";
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `كلمة المرور يجب أن تكون ${PASSWORD_MIN_LENGTH} أحرف على الأقل`;
  }
  if (Buffer.byteLength(password, "utf8") > PASSWORD_MAX_BYTES) {
    return "كلمة المرور طويلة جداً";
  }
  // A password of only whitespace is almost certainly an input accident.
  if (!password.trim()) return "كلمة المرور غير صالحة";
  return null;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

/** Does this phone have a password set? */
export async function hasPassword(phoneNumber: string): Promise<boolean> {
  const db = getFirestore();
  if (!db) return false;
  try {
    const snap = await db
      .collection(AUTH_CREDENTIALS_COLLECTION)
      .doc(normalizeOtpPhone(phoneNumber))
      .get();
    return snap.exists && typeof (snap.data() as any)?.passwordHash === "string"
      && (snap.data() as any).passwordHash.length > 0;
  } catch (err: any) {
    console.error("[AUTH] hasPassword read failed:", err?.message);
    return false;
  }
}

/**
 * Set or replace the password for a phone, and clear its lockout.
 *
 * Clearing on success is deliberate: the person just proved they can produce a
 * valid credential (an OTP, or the current password), so the failed-guess
 * counter has served its purpose. It is the ONLY thing that clears it — passing
 * an OTP alone does not, or the recovery flow would be a way to reset the guess
 * budget without ever setting a password.
 */
export async function setPassword(phoneNumber: string, password: string): Promise<boolean> {
  const db = getFirestore();
  if (!db) return false;
  const phone = normalizeOtpPhone(phoneNumber);
  try {
    const passwordHash = await hashPassword(password);
    const now = Date.now();
    await db.collection(AUTH_CREDENTIALS_COLLECTION).doc(phone).set(
      {
        phoneNumber: phone,
        passwordHash,
        passwordUpdatedAt: now,
        failedAttempts: 0,
        lockedUntil: 0,
        windowStartedAt: 0,
      },
      { merge: true },
    );
    return true;
  } catch (err: any) {
    // Never log the password, and never log the hash.
    console.error("[AUTH] setPassword write failed:", err?.message);
    return false;
  }
}

/** Current lockout state for a phone, without changing anything. */
export async function passwordLockoutRemainingMs(
  phoneNumber: string,
  now: number = Date.now(),
): Promise<number> {
  const db = getFirestore();
  if (!db) return 0;
  try {
    const snap = await db
      .collection(AUTH_CREDENTIALS_COLLECTION)
      .doc(normalizeOtpPhone(phoneNumber))
      .get();
    if (!snap.exists) return 0;
    const lockedUntil = Number((snap.data() as any)?.lockedUntil) || 0;
    return lockedUntil > now ? lockedUntil - now : 0;
  } catch {
    return 0;
  }
}

/**
 * Check a password and account for the attempt.
 *
 * The lockout is evaluated BEFORE the hash comparison, so a locked phone costs an
 * attacker a Firestore read and nothing else — no bcrypt work, and no signal
 * about whether the guess was right.
 *
 * The whole read-modify-write runs in a transaction, so two requests racing each
 * other cannot both read "4 attempts" and both be allowed through.
 */
export async function checkPassword(
  phoneNumber: string,
  password: unknown,
  now: number = Date.now(),
): Promise<PasswordCheck> {
  const db = getFirestore();
  if (!db) return { ok: false, reason: "unavailable" };
  if (typeof password !== "string" || !password) return { ok: false, reason: "wrong_password" };

  const phone = normalizeOtpPhone(phoneNumber);
  const ref = db.collection(AUTH_CREDENTIALS_COLLECTION).doc(phone);

  // Read the hash outside the transaction so the (slow) bcrypt comparison is not
  // holding one open. The counter update below is still transactional, and the
  // lockout is re-checked inside it, so nothing is lost by doing it this way.
  let stored: any;
  try {
    const snap = await ref.get();
    if (!snap.exists) return { ok: false, reason: "no_password" };
    stored = snap.data();
  } catch (err: any) {
    console.error("[AUTH] checkPassword read failed:", err?.message);
    return { ok: false, reason: "unavailable" };
  }

  const lockedUntil = Number(stored?.lockedUntil) || 0;
  if (lockedUntil > now) {
    return { ok: false, reason: "locked", retryAfterSeconds: Math.ceil((lockedUntil - now) / 1000) };
  }

  const hash = typeof stored?.passwordHash === "string" ? stored.passwordHash : "";
  if (!hash) return { ok: false, reason: "no_password" };

  let matched = false;
  try {
    matched = await bcrypt.compare(password, hash);
  } catch {
    matched = false;
  }

  try {
    return await db.runTransaction(async (tx: any) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? (snap.data() as any) : {};
      const lockedNow = Number(data?.lockedUntil) || 0;
      if (lockedNow > now) {
        return {
          ok: false,
          reason: "locked" as const,
          retryAfterSeconds: Math.ceil((lockedNow - now) / 1000),
        };
      }

      if (matched) {
        // A correct password clears the counter — the same rule consumeOtp uses
        // for a correct code.
        tx.set(ref, { failedAttempts: 0, lockedUntil: 0, windowStartedAt: 0 }, { merge: true });
        return { ok: true };
      }

      // The window restarts once it has elapsed, so five mistakes spread over a
      // month never accumulate into a lockout.
      const startedAt = Number(data?.windowStartedAt) || 0;
      const inWindow = startedAt > 0 && now < startedAt + PASSWORD_LOCKOUT_MS;
      const failed = (inWindow ? Number(data?.failedAttempts) || 0 : 0) + 1;
      const willLock = failed >= PASSWORD_MAX_ATTEMPTS;
      tx.set(
        ref,
        {
          failedAttempts: failed,
          windowStartedAt: inWindow ? startedAt : now,
          lockedUntil: willLock ? now + PASSWORD_LOCKOUT_MS : 0,
        },
        { merge: true },
      );
      return willLock
        ? {
            ok: false,
            reason: "locked" as const,
            retryAfterSeconds: Math.ceil(PASSWORD_LOCKOUT_MS / 1000),
          }
        : { ok: false, reason: "wrong_password" as const };
    });
  } catch (err: any) {
    console.error("[AUTH] checkPassword transaction failed:", err?.message);
    // Fail CLOSED: an unreachable counter must not become a way to guess without
    // being counted.
    return { ok: false, reason: "unavailable" };
  }
}
