/**
 * The one canonical form of an Iraqi phone number (H-63).
 *
 * OnWay's identity is the local 11-digit form `07XXXXXXXXX`. The same human can
 * type `07…`, `7…`, `964…`, `00964…` or `+964…`, and before H-52 the client sent
 * whatever was typed — which is why 15 of 27 live user documents are stored as
 * `00964…` rather than the canonical form.
 *
 * H-52 fixed the door: `/api/auth/send-otp` and `/api/auth/verify-otp` run their
 * own `toLocalPhone` before minting the customer JWT, and PhoneLoginScreen runs
 * `toLocalIraqiPhone` before sending. It left the rules written out three times,
 * which is the shape a drift bug takes: two of the three agreeing is enough for
 * one human to acquire two identities again.
 *
 * This module is now the definition. `client/lib/phone.ts` re-exports it, and
 * `server/firebase.ts` derives every phone-shaped document key from it. The copy
 * inside `server/routes.ts` stays where it is — it is the auth path and moving it
 * is not something a data-identity fix should do — but a unit test executes it
 * against this one over a corpus, so a divergence fails the suite rather than
 * quietly splitting a customer in two.
 *
 * It deliberately does NOT validate. `isCanonicalIraqiPhone` is the separate
 * predicate for that, so a caller can normalise and check independently.
 */
export function canonicalIraqiPhone(raw: string): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.startsWith("00964")) return "0" + digits.slice(5);
  if (digits.startsWith("964")) return "0" + digits.slice(3);
  if (digits.startsWith("07")) return digits;
  if (digits.startsWith("7")) return "0" + digits;
  return digits;
}

/** The shape every Iraqi mobile number must have once canonicalised. */
export const IRAQ_CANONICAL_PHONE_RE = /^07\d{9}$/;

/** Is this already the canonical identity form? */
export function isCanonicalIraqiPhone(raw: string): boolean {
  return IRAQ_CANONICAL_PHONE_RE.test(String(raw ?? ""));
}

/** Would canonicalising this produce a valid Iraqi mobile number? */
export function isValidIraqiPhone(raw: string): boolean {
  return isCanonicalIraqiPhone(canonicalIraqiPhone(raw));
}

/**
 * Mask a phone for logs, reports and test output: `07****567`.
 *
 * Identity work involves comparing records, and comparing records tempts printing
 * them. Nothing in this codebase should ever emit a subscriber's full number, so
 * the masker lives beside the canonicaliser where anyone touching phones will see
 * it. Returns `***` for anything too short to mask meaningfully.
 */
export function maskPhone(raw: string): string {
  const c = canonicalIraqiPhone(raw);
  if (c.length < 6) return "***";
  return `${c.slice(0, 2)}${"*".repeat(c.length - 5)}${c.slice(-3)}`;
}
