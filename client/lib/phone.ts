/**
 * Iraqi phone normalisation for the client (H-52).
 *
 * The app has exactly one canonical phone format: the local 11-digit form
 * `07XXXXXXXXX`. It is what /api/auth/send-otp validates, what the customer JWT
 * carries, what /api/auth/verify-otp echoes back, and therefore what every
 * ownership check compares against.
 *
 * PhoneLoginScreen used to build the number it sent as:
 *
 *     `00964${phone.replace(/\s/g, "")}`
 *
 * which prefixes the country code without removing the local leading zero, and
 * without noticing a country code that is already there. Every realistic way of
 * typing an Iraqi number except the bare `7…` form came out malformed:
 *
 *     07701234567      → 0096407701234567       → server sees 007701234567  ✗
 *     +9647701234567   → 00964+9647701234567    → server sees 09647701234567 ✗
 *     009647701234567  → 00964009647701234567   → server sees 0009647701234567 ✗
 *     7701234567       → 009647701234567        → server sees 07701234567   ✓
 *
 * The rules below are the same four the server applies in routes.ts
 * (`toLocalPhone`), so the client and the server cannot disagree about which
 * identity a typed number belongs to. A unit test executes both and compares
 * them over a corpus rather than trusting this comment.
 */

/** The canonical stored/compared form: a local Iraqi mobile number. */
export const IRAQ_LOCAL_PHONE_RE = /^07\d{9}$/;

/**
 * Any Iraqi variant → the canonical `07XXXXXXXXX`.
 *
 * Accepts `07XXXXXXXXX`, `7XXXXXXXXX`, `9647XXXXXXXXX`, `+9647XXXXXXXXX`,
 * `009647XXXXXXXXX`, with or without spaces, dashes or parentheses. Anything
 * else is returned as its digits so the caller's validation can reject it —
 * this function never invents a number it cannot derive.
 */
export function toLocalIraqiPhone(raw: string): string {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (d.startsWith("00964")) return "0" + d.slice(5);
  if (d.startsWith("964")) return "0" + d.slice(3);
  if (d.startsWith("07")) return d;
  if (d.startsWith("7")) return "0" + d;
  return d;
}

/** Does this input resolve to a well-formed Iraqi mobile number? */
export function isValidIraqiPhone(raw: string): boolean {
  return IRAQ_LOCAL_PHONE_RE.test(toLocalIraqiPhone(raw));
}
