/**
 * App-store review accounts.
 *
 * Apple and Google review the PRODUCTION build. Their reviewers do not hold an
 * Iraqi SIM, so an OTP sent to a real handset is not something they can receive,
 * and an app they cannot sign into is rejected. This module is the narrow,
 * server-side answer to that and nothing more.
 *
 * WHAT IT IS NOT
 *
 * It is not the development bypass. `verifyOtp` in firebase.ts accepts "0000"
 * when `isDevMode()` is true, and isDevMode() is false under NODE_ENV=production
 * and under REPLIT_DEPLOYMENT=1 — that path is unreachable in production and is
 * deliberately left exactly as it is. This module is reachable in production,
 * which is precisely why it is bounded on all four of the following axes:
 *
 *   1. Phone.  Three literal numbers, written out below. Any other number goes
 *              through the ordinary OTP path, untouched, including numbers that
 *              differ by one digit.
 *   2. Code.   A single fixed code read from REVIEW_LOGIN_CODE at call time. If
 *              that variable is unset, or shorter than the minimum, the whole
 *              module is inert and the three numbers behave like any other phone.
 *              The code is NEVER written into this repository and never reaches
 *              the client bundle: it is typed into App Store Connect / Play
 *              Console review notes by the operator, and lives in the server's
 *              environment only.
 *   3. Role.   Each number is pinned to one role. That pin is an assertion about
 *              provisioning, not an authorisation decision — see below.
 *   4. Attempts. Nothing here touches the rate limiter, the per-phone lockout or
 *              the TTL. A review number is still subject to OTP_MAX_ATTEMPTS and
 *              the one-hour abuse window like every other number.
 *
 * WHY THE ROLE PIN IS NOT WHAT ENFORCES ROLE ISOLATION
 *
 * Roles in this app are decided by DATA, not by the login. /api/auth/verify-otp
 * always mints a customer JWT; a driver token additionally requires a `drivers`
 * record for that phone (/api/driver/mobile-auth) and a vendor token requires a
 * `vendors` record (/api/vendor/mobile-auth). A phone with no driver record
 * cannot obtain a driver token no matter what it presents. So the customer
 * review number cannot reach the driver app because no driver record exists for
 * it — not because this file says so.
 *
 * The pin below is therefore a statement of intent that provisioning must match,
 * and the test suite asserts the two agree. Getting the pin wrong cannot grant
 * access; it can only mean the wrong demo data was created.
 */
import crypto from "node:crypto";

export type ReviewRole = "customer" | "vendor" | "driver";

/**
 * The three numbers, canonical local form (07XXXXXXXXX), and the single role each
 * is provisioned for. Callers pass an already-normalised phone: every entry point
 * in routes.ts runs toLocalPhone() before it gets here.
 *
 * These are not real subscribers. They are reserved for store review and must
 * never be handed to a person.
 */
// The prototype is stripped deliberately. With a plain object literal, a lookup
// of "constructor" or "toString" walks up to Object.prototype and comes back with
// a function — truthy, and enough to make isReviewPhone() answer true for a
// caller who sends {"phoneNumber":"constructor"}. A null prototype has nothing to
// walk up to, so a miss is a miss. `reviewRoleFor` additionally checks the value
// is one of the three roles, so nothing but a real entry can ever get through.
const REVIEW_ACCOUNTS: Readonly<Record<string, ReviewRole>> = Object.freeze(
  Object.assign(Object.create(null), {
    "07701111104": "customer",
    "07701111105": "vendor",
    "07701111106": "driver",
  }) as Record<string, ReviewRole>,
);

const REVIEW_ROLES: ReadonlySet<string> = new Set(["customer", "vendor", "driver"]);

/**
 * Shortest code accepted. Six digits is the width the ordinary OTP used before
 * it was reduced, and the floor exists so a careless one-character value cannot
 * silently arm a production login path.
 */
const MIN_REVIEW_CODE_LENGTH = 6;

/** The configured code, or "" when the mechanism is switched off. */
function configuredCode(): string {
  const raw = process.env.REVIEW_LOGIN_CODE;
  return typeof raw === "string" ? raw.trim() : "";
}

/**
 * Is the mechanism armed at all?
 *
 * Read at call time rather than captured at import, so the operator can unset the
 * variable and restart to disable review logins without shipping a new build.
 */
export function reviewAccountsEnabled(): boolean {
  return configuredCode().length >= MIN_REVIEW_CODE_LENGTH;
}

/** The role a review number is provisioned for, or null if it is not one. */
export function reviewRoleFor(phoneNumber: unknown): ReviewRole | null {
  if (!reviewAccountsEnabled()) return null;
  // Only a string key can match, and only a value that is one of the three roles
  // is ever returned — belt and braces around the null-prototype table above.
  if (typeof phoneNumber !== "string") return null;
  const role = REVIEW_ACCOUNTS[phoneNumber];
  return typeof role === "string" && REVIEW_ROLES.has(role) ? role : null;
}

/** Is this one of the review numbers, with the mechanism armed? */
export function isReviewPhone(phoneNumber: unknown): boolean {
  return reviewRoleFor(phoneNumber) !== null;
}

/**
 * Does `code` unlock `phoneNumber`?
 *
 * Both halves must hold: the number is on the list AND the code equals the
 * configured one. The comparison is length-checked first and then constant-time,
 * so neither the length nor a shared prefix of the code leaks through timing to
 * someone probing the endpoint.
 *
 * Returns false for every phone not on the list, whatever the code — a caller
 * cannot use this to log in as anybody else.
 */
export function reviewCodeMatches(phoneNumber: unknown, code: unknown): boolean {
  if (!isReviewPhone(phoneNumber)) return false;
  const expected = configuredCode();
  const supplied = typeof code === "string" ? code.trim() : "";
  if (supplied.length !== expected.length) return false;
  const a = Buffer.from(supplied, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * The numbers, for provisioning and for the tests. A copy, so no caller can edit
 * the list at runtime.
 */
export function reviewAccountList(): ReadonlyArray<{ phoneNumber: string; role: ReviewRole }> {
  return Object.entries(REVIEW_ACCOUNTS).map(([phoneNumber, role]) => ({ phoneNumber, role }));
}
