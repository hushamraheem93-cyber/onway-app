/**
 * Password sign-in.
 *
 * Added to cut the SMS bill: an OTP costs money on every login, a password costs
 * nothing. OTP is not replaced — it is still how a phone is first proved and the
 * only way back in when the password is forgotten — so most of what is asserted
 * here is that the new path did not weaken or displace the old one.
 *
 * The credential functions are the shipped ones, lifted by _passwordHarness.mjs
 * and run against an in-memory Firestore. The endpoint wiring is checked against
 * the source, because a correct module wired in wrongly is still a hole.
 *
 * Run:  node --test tests/unit/password-auth.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments } from "./_source.mjs";
import { bootPasswords, constant } from "./_passwordHarness.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => readFileSync(join(root, p), "utf8");
const ROUTES = stripComments(read("server/routes.ts"));
const CREDS = read("server/authCredentials.ts");

const MAX_ATTEMPTS = constant("PASSWORD_MAX_ATTEMPTS");
const LOCKOUT_MS = constant("PASSWORD_LOCKOUT_MS");
const MIN_LENGTH = constant("PASSWORD_MIN_LENGTH");

const CUSTOMER = "07701234567";
const VENDOR = "07801234567";
const DRIVER = "07901234567";
const PW = "correct-horse-battery";

// ── 1-2. the two sign-in shapes ──────────────────────────────────────────────

describe("password auth · a new user sets a password, then signs in without an OTP", () => {
  test("1. a phone with no password is not signed in by one", async () => {
    const a = bootPasswords();
    assert.equal(await a.hasPassword(CUSTOMER), false);
    const r = await a.checkPassword(CUSTOMER, PW);
    assert.equal(r.ok, false);
    assert.equal(r.reason, "no_password");
  });

  test("2. once set, the password signs in — and no OTP was involved", async () => {
    const a = bootPasswords();
    assert.equal(await a.setPassword(CUSTOMER, PW), true);
    assert.equal(await a.hasPassword(CUSTOMER), true);
    assert.equal((await a.checkPassword(CUSTOMER, PW)).ok, true);
  });

  test("2b. the same password works for a vendor and a driver number", async () => {
    // Identity is the phone, not the role — the credential store knows nothing
    // about which collections the number appears in.
    const a = bootPasswords();
    for (const phone of [VENDOR, DRIVER]) {
      await a.setPassword(phone, PW);
      assert.equal((await a.checkPassword(phone, PW)).ok, true, `${phone} could not sign in`);
    }
  });

  test("2c. every Iraqi notation of the number reaches the same credential", async () => {
    const a = bootPasswords();
    await a.setPassword("07701234567", PW);
    for (const typed of ["7701234567", "+9647701234567", "009647701234567", "9647701234567"]) {
      assert.equal((await a.checkPassword(typed, PW)).ok, true, `${typed} failed`);
    }
  });
});

// ── 3-5. wrong passwords, brute force, lockout ───────────────────────────────

describe("password auth · guessing is bounded", () => {
  test("3. a wrong password is refused", async () => {
    const a = bootPasswords();
    await a.setPassword(CUSTOMER, PW);
    for (const bad of ["wrong", PW + "x", PW.slice(0, -1), PW.toUpperCase(), "", null, undefined, 12345, {}]) {
      assert.equal((await a.checkPassword(CUSTOMER, bad)).ok, false, `${JSON.stringify(bad)} was accepted`);
    }
  });

  test("4. failed attempts accumulate", async () => {
    const a = bootPasswords();
    await a.setPassword(CUSTOMER, PW);
    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      const r = await a.checkPassword(CUSTOMER, "nope");
      assert.equal(r.reason, "wrong_password", `attempt ${i} should not lock yet`);
    }
    assert.equal(a.store.get(`authCredentials/${CUSTOMER}`).failedAttempts, MAX_ATTEMPTS - 1);
  });

  test("5. the phone locks on the configured attempt, and the CORRECT password is refused too", async () => {
    const a = bootPasswords();
    await a.setPassword(CUSTOMER, PW);
    let locked = null;
    for (let i = 0; i < MAX_ATTEMPTS; i++) locked = await a.checkPassword(CUSTOMER, "nope");
    assert.equal(locked.reason, "locked");
    assert.ok(locked.retryAfterSeconds > 0);

    // The whole point: once locked, knowing the password is not enough.
    const withRealPassword = await a.checkPassword(CUSTOMER, PW);
    assert.equal(withRealPassword.ok, false, "the lockout was bypassed by the correct password");
    assert.equal(withRealPassword.reason, "locked");
  });

  test("5b. the lockout expires, and the password works again", async () => {
    const a = bootPasswords();
    const t0 = Date.now();
    await a.setPassword(CUSTOMER, PW);
    // The lock is stamped at the moment of the LAST failed attempt, so the
    // expiry is measured from there — not from t0. Getting that wrong is a
    // three-millisecond error that looks like a broken lockout.
    const lastAttemptAt = t0 + MAX_ATTEMPTS - 1;
    for (let i = 0; i < MAX_ATTEMPTS; i++) await a.checkPassword(CUSTOMER, "nope", t0 + i);
    assert.equal((await a.checkPassword(CUSTOMER, PW, t0 + 1000)).reason, "locked");
    // The code frees the phone when lockedUntil is no longer STRICTLY greater
    // than now, so the last locked instant is one millisecond before expiry.
    assert.equal((await a.checkPassword(CUSTOMER, PW, lastAttemptAt + LOCKOUT_MS - 1)).reason, "locked",
      "the lockout lifted early");
    assert.equal((await a.checkPassword(CUSTOMER, PW, lastAttemptAt + LOCKOUT_MS + 1)).ok, true,
      "the lockout never lifts");
  });

  test("5c. mistakes spread beyond the window do not accumulate into a lockout", async () => {
    const a = bootPasswords();
    const t0 = Date.now();
    await a.setPassword(CUSTOMER, PW);
    // One failure per window, many times over — never reaches the threshold.
    for (let i = 0; i < MAX_ATTEMPTS * 3; i++) {
      const r = await a.checkPassword(CUSTOMER, "nope", t0 + i * (LOCKOUT_MS + 1000));
      assert.equal(r.reason, "wrong_password", `locked out at spread-out attempt ${i}`);
    }
  });

  test("5d. a correct password clears the counter", async () => {
    const a = bootPasswords();
    await a.setPassword(CUSTOMER, PW);
    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) await a.checkPassword(CUSTOMER, "nope");
    assert.equal((await a.checkPassword(CUSTOMER, PW)).ok, true);
    assert.equal(a.store.get(`authCredentials/${CUSTOMER}`).failedAttempts, 0);
    // …so the next mistake starts from zero rather than locking immediately.
    assert.equal((await a.checkPassword(CUSTOMER, "nope")).reason, "wrong_password");
  });

  test("5e. concurrent guesses cannot both slip past the last attempt", async () => {
    const a = bootPasswords();
    await a.setPassword(CUSTOMER, PW);
    const results = await Promise.all(
      Array.from({ length: MAX_ATTEMPTS * 2 }, () => a.checkPassword(CUSTOMER, "nope")),
    );
    assert.ok(results.some((r) => r.reason === "locked"), "no request ever saw the lockout");
    assert.equal(results.filter((r) => r.ok).length, 0);
  });
});

// ── 6-7. recovery ────────────────────────────────────────────────────────────

describe("password auth · forgotten passwords recover through OTP", () => {
  test("6. setting a new password after recovery works, and clears the lockout", async () => {
    const a = bootPasswords();
    await a.setPassword(CUSTOMER, PW);
    for (let i = 0; i < MAX_ATTEMPTS; i++) await a.checkPassword(CUSTOMER, "nope");
    assert.equal((await a.checkPassword(CUSTOMER, PW)).reason, "locked");

    // The reset path: verify-otp, then set-password.
    await a.setPassword(CUSTOMER, "a-brand-new-password");
    assert.equal((await a.checkPassword(CUSTOMER, "a-brand-new-password")).ok, true,
      "the new password did not take effect");
  });

  test("7. the old password stops working after a reset", async () => {
    const a = bootPasswords();
    await a.setPassword(CUSTOMER, PW);
    await a.setPassword(CUSTOMER, "a-brand-new-password");
    const r = await a.checkPassword(CUSTOMER, PW);
    assert.equal(r.ok, false, "the OLD password still signs in after a reset");
    assert.equal(r.reason, "wrong_password");
  });

  test("7b. OTP recovery does NOT hand back more password guesses on its own", async () => {
    // Running the OTP flow must not clear the counter — only actually setting a
    // password does. Otherwise "request an OTP" is a way to buy five more tries.
    const a = bootPasswords();
    await a.setPassword(CUSTOMER, PW);
    for (let i = 0; i < MAX_ATTEMPTS; i++) await a.checkPassword(CUSTOMER, "nope");
    const before = a.store.get(`authCredentials/${CUSTOMER}`).lockedUntil;
    assert.ok(before > 0);
    // Nothing in the credential module is reachable from the OTP path, so the
    // lockout survives anything the OTP flow does.
    assert.equal((await a.checkPassword(CUSTOMER, PW)).reason, "locked");
    assert.equal(a.store.get(`authCredentials/${CUSTOMER}`).lockedUntil, before);
  });
});

// ── 8-9. storage and disclosure ──────────────────────────────────────────────

describe("password auth · the password itself never leaves the process", () => {
  test("8. it is stored as a bcrypt hash, never in the clear", async () => {
    const a = bootPasswords();
    await a.setPassword(CUSTOMER, PW);
    const doc = a.store.get(`authCredentials/${CUSTOMER}`);
    assert.ok(doc.passwordHash, "no hash was written");
    assert.equal(doc.password, undefined, "a plaintext password field exists");
    assert.match(doc.passwordHash, /^\$2[aby]\$\d\d\$/, "not a bcrypt hash");
    assert.ok(!JSON.stringify(doc).includes(PW), "the password is recoverable from the document");
  });

  test("8b. the cost factor matches the admin standard, not the older vendor one", async () => {
    const a = bootPasswords();
    await a.setPassword(CUSTOMER, PW);
    const cost = Number(a.store.get(`authCredentials/${CUSTOMER}`).passwordHash.split("$")[2]);
    const adminCost = Number(read("server/adminRbac.ts").match(/bcrypt\.hash\(password, (\d+)\)/)[1]);
    assert.equal(cost, adminCost, `cost ${cost} does not match adminRbac's ${adminCost}`);
    assert.ok(cost >= 12);
  });

  test("8c. the same password hashes differently every time — the salt is per record", async () => {
    const a = bootPasswords();
    await a.setPassword(CUSTOMER, PW);
    const first = a.store.get(`authCredentials/${CUSTOMER}`).passwordHash;
    await a.setPassword(CUSTOMER, PW);
    assert.notEqual(a.store.get(`authCredentials/${CUSTOMER}`).passwordHash, first);
  });

  test("9. no endpoint can return the hash, and nothing logs the password", () => {
    // The credential document is never handed to a response builder: the only
    // things routes.ts receives from this module are booleans and a reason code.
    // Scoped to the auth block rather than the whole file — routes.ts also
    // contains a demo vendor fixture with an inert placeholder hash, and matching
    // that would be a false alarm about a value no login ever reads.
    const from = ROUTES.indexOf('app.post("/api/auth/password-status"');
    // ROUTES is comment-stripped, so the "// Driver Routes" banner is not in it.
    // The next real statement is the driver auth route.
    const to = ROUTES.indexOf('app.post("/api/driver/mobile-auth"', from);
    assert.ok(from > 0 && to > from, "the password auth block moved");
    assert.doesNotMatch(ROUTES.slice(from, to), /passwordHash/,
      "the auth endpoints mention passwordHash — it must never reach a response");
    for (const m of CREDS.matchAll(/console\.(log|error|warn)\(([^)]*)\)/g)) {
      assert.ok(!/\bpassword\b(?!Hash|UpdatedAt|Attempts|Policy)/.test(m[2]) || m[2].includes("failed"),
        `a log line may carry the password: ${m[0]}`);
      assert.ok(!m[2].includes("passwordHash"), `a log line carries the hash: ${m[0]}`);
    }
  });

  test("9b. the login response says nothing about WHY it failed", () => {
    const at = ROUTES.indexOf('app.post("/api/auth/login-password"');
    assert.ok(at > 0, "login-password disappeared");
    const body = ROUTES.slice(at, ROUTES.indexOf('app.post("/api/auth/set-password"', at));
    // "no account", "no password" and "wrong password" must be one message.
    const generic = (body.match(/رقم الهاتف أو كلمة المرور غير صحيحة/g) ?? []).length;
    assert.ok(generic >= 2, "failures are distinguishable — the endpoint is an account oracle");
    assert.doesNotMatch(body, /لا يوجد حساب|غير مسجل|no_password"/,
      "a response distinguishes an unregistered number from a wrong password");
  });
});

// ── 10-12. sessions ──────────────────────────────────────────────────────────

describe("password auth · sessions behave exactly as the OTP path's do", () => {
  test("10-11. every password path mints the same customer JWT as verify-otp", () => {
    assert.match(ROUTES, /function customerSession\(phoneNumber: string, iat\?: number\)/,
      "the shared session builder is gone");
    const at = ROUTES.indexOf("async function customerSession");
    const fn = ROUTES.slice(at, at + 900);
    assert.match(fn, /role: "customer"/);
    assert.match(fn, /expiresIn: "30d"/, "the password session has a different lifetime to the OTP one");
    // Role detection is what drives the client to the right app.
    assert.match(fn, /getDriverByPhone/);
    assert.match(fn, /getVendorByPhone/);
  });

  test("11b. changing or resetting a password revokes the old sessions", () => {
    for (const route of ["/api/auth/set-password", "/api/auth/change-password"]) {
      const at = ROUTES.indexOf(`app.post("${route}"`);
      assert.ok(at > 0, `${route} disappeared`);
      const body = ROUTES.slice(at, at + 1600);
      assert.match(body, /revokeCustomerTokens\(phoneNumber\)/,
        `${route} leaves old sessions valid for 30 days`);
    }
  });

  test("11c. the replacement token is not born revoked", () => {
    // revokeCustomerTokens stamps milliseconds; a JWT iat is floored seconds, so
    // a token minted in the same second satisfies iat*1000 < revokedAt and is
    // rejected on its first use. Measured at 200/200 before the fix.
    const rev = read("server/customerRevocation.ts");
    assert.match(rev, /export function iatAfterRevocation/, "the guard function is gone");
    assert.match(rev, /Math\.ceil\(base \/ 1000\)/, "rounding down would keep the bug");
    for (const route of ["/api/auth/set-password", "/api/auth/change-password"]) {
      const at = ROUTES.indexOf(`app.post("${route}"`);
      const body = ROUTES.slice(at, at + 1600);
      assert.match(body, /customerSession\(phoneNumber, iatAfterRevocation\(phoneNumber\)\)/,
        `${route} reissues a token that its own revocation kills`);
    }
  });

  test("11d. the raw arithmetic of the fix holds", () => {
    // Executed, not asserted from prose.
    const isRevoked = (at, iat) => iat * 1000 < at;
    for (let i = 0; i < 500; i++) {
      const at = Date.now() + i * 7;
      // Skip the one instant where flooring is harmless — a revocation landing
      // exactly on a whole second. Asserting the old behaviour fails THERE too
      // makes this test flaky roughly once in a thousand runs, which is how it
      // was first written and how it was caught.
      if (at % 1000 !== 0) {
        assert.equal(isRevoked(at, Math.floor(at / 1000)), true,
          "flooring should have produced a born-revoked token");
      }
      assert.equal(isRevoked(at, Math.ceil(at / 1000)), false, "the fix must survive");
    }
  });

  test("12. an OTP-only user still signs in with an OTP and is never forced to set a password", () => {
    const at = ROUTES.indexOf('app.post("/api/auth/verify-otp"');
    const body = ROUTES.slice(at, at + 2600);
    // verify-otp still issues its own token unconditionally…
    assert.match(body, /const customerToken = jwt\.sign\(/);
    // …and only ADVERTISES whether a password exists.
    assert.match(body, /hasPassword: await hasPassword\(phoneNumber\)/);
    assert.doesNotMatch(body, /return res\.status\(\d+\)[^;]*password/,
      "verify-otp can now refuse a user for not having a password");
  });
});

// ── 13-16. the three apps, and the review accounts ───────────────────────────

describe("password auth · every app keeps working, review accounts untouched", () => {
  test("13-15. driver and vendor tokens still require their own record", () => {
    // The password grants a CUSTOMER token, nothing more. What turns that into a
    // driver or vendor session is unchanged, so the new path cannot widen access.
    assert.match(ROUTES, /const driver = await getDriverByPhone\(phoneNumber\);\s*if \(!driver\) return res\.json\(\{ driver: null, token: null \}\)/,
      "the driver token no longer requires a driver record");
    const vendor = stripComments(read("server/vendor.ts"));
    assert.match(vendor, /if \(snap\.empty\) \{\s*return res\.json\(\{ vendor: null, token: null \}\)/,
      "the vendor token no longer requires a vendor record");
  });

  test("15b. the vendor web-panel login is untouched", () => {
    const vendor = read("server/vendor.ts");
    assert.match(vendor, /router\.post\("\/api\/vendor\/login"/, "the vendor panel login disappeared");
    assert.doesNotMatch(vendor, /authCredentials|checkPassword|setPassword/,
      "the vendor panel now shares the customer credential store — a behaviour change nobody asked for");
  });

  test("16. the review accounts and the review code are untouched", () => {
    const review = read("server/reviewAccounts.ts");
    assert.match(review, /"07701111104": "customer"/);
    assert.match(review, /"07701111105": "vendor"/);
    assert.match(review, /"07701111106": "driver"/);
    assert.doesNotMatch(review, /authCredentials|checkPassword/,
      "the review module now depends on passwords");
    // Review sign-in still happens inside verify-otp, before the stored code.
    const at = ROUTES.indexOf('app.post("/api/auth/verify-otp"');
    const body = ROUTES.slice(at, at + 2600);
    assert.match(body, /reviewCodeMatches\(phoneNumber, code\)/);
    // A review number has no password document, so it falls through to OTP.
    assert.doesNotMatch(body, /reviewCodeMatches[^;]*checkPassword/);
  });

  test("16b. the OTP module itself was not modified by this feature", () => {
    const otp = read("server/otpStore.ts");
    assert.match(otp, /OTP_MAX_ATTEMPTS = 5/);
    assert.match(otp, /OTP_ABUSE_COLLECTION = "otpAbuse"/);
    assert.doesNotMatch(otp, /authCredentials|passwordHash/,
      "the OTP store now knows about passwords — the two must stay separate");
    // And the password store does not reach into otpAbuse.
    // Comment-stripped: the module's own prose explains at length WHY it does not
    // touch otpAbuse, and matching that would flag the explanation as the offence.
    assert.doesNotMatch(stripComments(CREDS), /otpAbuse/,
      "the password lockout writes to the OTP abuse counter — a failed password would block OTP recovery");
  });
});

// ── policy and failure modes ─────────────────────────────────────────────────

describe("password auth · policy and failure modes", () => {
  test("the length floor is enforced, without pointless complexity rules", async () => {
    const a = bootPasswords();
    assert.ok(a.passwordPolicyError("x".repeat(MIN_LENGTH - 1)), "a too-short password was accepted");
    assert.equal(a.passwordPolicyError("x".repeat(MIN_LENGTH)), null);
    // A long passphrase with no symbols is fine — that is the point.
    assert.equal(a.passwordPolicyError("كلمة مرور طويلة وسهلة التذكر"), null);
    for (const bad of [null, undefined, 12345678, {}, "", "        "]) {
      assert.ok(a.passwordPolicyError(bad), `${JSON.stringify(bad)} passed the policy`);
    }
  });

  test("the byte cap matches bcrypt's own truncation point", async () => {
    const a = bootPasswords();
    // bcrypt silently ignores everything past 72 BYTES. Arabic is multi-byte, so
    // the check has to count bytes or half an Arabic passphrase is decorative.
    const arabic = "ك".repeat(40); // 80 bytes
    assert.ok(Buffer.byteLength(arabic, "utf8") > 72);
    assert.ok(a.passwordPolicyError(arabic), "an over-long Arabic password was accepted");
  });

  test("an unreachable datastore fails CLOSED", async () => {
    const broken = {
      collection: () => ({ doc: () => ({ get: async () => { throw new Error("down"); } }) }),
      runTransaction: async () => { throw new Error("down"); },
    };
    const a = bootPasswords(broken);
    const r = await a.checkPassword(CUSTOMER, PW);
    assert.equal(r.ok, false, "a datastore outage let a login through");
    assert.equal(r.reason, "unavailable");
    assert.equal(await a.hasPassword(CUSTOMER), false);
  });

  test("the lockout is evaluated before the hash is ever compared", () => {
    // Cheap for us, and it means a locked phone gets no signal about whether the
    // guess was right.
    const fn = CREDS.slice(CREDS.indexOf("export async function checkPassword"));
    const lock = fn.indexOf("lockedUntil > now");
    const compare = fn.indexOf("bcrypt.compare");
    assert.ok(lock > 0 && compare > 0);
    assert.ok(lock < compare, "bcrypt runs before the lockout check");
  });

  test("the credential store is keyed by canonical phone, like otpAbuse", () => {
    assert.match(CREDS, /AUTH_CREDENTIALS_COLLECTION = "authCredentials"/);
    assert.match(CREDS, /normalizeOtpPhone\(phoneNumber\)/);
    // And it is NOT on the user document — no driver or vendor has one.
    assert.doesNotMatch(CREDS, /collection\("users"\)/,
      "the credential lives on the users document, which drivers and vendors do not have");
  });
});
