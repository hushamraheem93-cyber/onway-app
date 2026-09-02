/**
 * C-04 — the OTP is the root of trust for every identity in the system.
 *
 * A customer verifies by OTP; the resulting customer token is what driver
 * registration requires, and (since C-16) what vendor registration requires too.
 * So the OTP's entropy bounds the security of all three.
 *
 * It was a 4-digit code: 9,000 possibilities. With OTP_MAX_ATTEMPTS = 5 an
 * attacker needed only ~1,800 resend cycles to walk the entire space — the
 * finding's "guessable within hours". Hardening the RNG and capping attempts (a
 * previous pass) does not change the size of the space, which is the actual defect.
 *
 * It is now 6 digits: 900,000 possibilities, a 100× larger space.
 *
 * These tests exercise the REAL generateOtp/verifyOtp. H-75 moved the OTP state
 * out of process memory into Firestore, so they run against an in-memory
 * Firestore double via tests/unit/_otpHarness.mjs — the functions are still the
 * shipped ones, lifted from server/firebase.ts and server/otpStore.ts.
 *
 * Run:  node --test tests/unit/c04-otp-strength.test.mjs
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");

import { bootOtp } from "./_otpHarness.mjs";

let generateOtp, verifyOtp, OTP_LENGTH;
before(() => {
  delete process.env.DEV_MODE;                 // the "0000" bypass must be inert here
  ({ generateOtp, verifyOtp } = bootOtp());
  OTP_LENGTH = Number(
    readFileSync(join(root, "server/otpStore.ts"), "utf8").match(/OTP_LENGTH = (\d+)/)[1],
  );
});

const PHONE = "07700000001";

// C-04 raised the width from 4 to 6; the platform owner has since asked for 4
// back. The width is therefore read from the shipped constant rather than pinned
// here — what these tests still hold is that the code is EXACTLY that width, never
// has a leading zero, spans its whole space, and is not predictable. The defence
// that carries the weight at four digits is not the width but OTP_MAX_ATTEMPTS,
// the per-phone lockout and the TTL, each asserted in the suites below.
describe("C-04 · the code fills its space and is not guessable", () => {
  test("OTP_LENGTH is a sane width the client can render", async () => {
    assert.ok(Number.isInteger(OTP_LENGTH));
    assert.ok(OTP_LENGTH >= 4 && OTP_LENGTH <= 8, `OTP_LENGTH is ${OTP_LENGTH}`);
  });

  test(`every generated code is exactly OTP_LENGTH digits`, async () => {
    const exact = new RegExp(`^\\d{${OTP_LENGTH}}$`);
    for (let i = 0; i < 500; i++) {
      const code = await generateOtp(`${PHONE}-${i}`);
      assert.match(code, exact, `got ${JSON.stringify(code)}`);
    }
  });

  test("no code ever has a leading zero — the fixed-width input stays aligned", async () => {
    for (let i = 0; i < 500; i++) {
      assert.notEqual(await generateOtp(`lz-${i}`)[0], "0");
    }
  });

  test("the whole space of that width is used, and only that space", async () => {
    const floor = 10 ** (OTP_LENGTH - 1);
    const ceiling = 10 ** OTP_LENGTH - 1;
    const codes = new Set();
    for (let i = 0; i < 3000; i++) codes.add(Number(await generateOtp(`e-${i}`)));
    const min = Math.min(...codes), max = Math.max(...codes);
    assert.ok(min >= floor, `a code below the ${OTP_LENGTH}-digit floor: ${min}`);
    assert.ok(max <= ceiling, `a code above the ${OTP_LENGTH}-digit ceiling: ${max}`);
    // The draw should cover most of the space rather than clustering in a corner:
    // a generator stuck on a narrow band would fail this even at the right width.
    const span = ceiling - floor + 1;
    assert.ok(max - min > span * 0.9, `codes span only ${max - min} of ${span}`);
  });

  test("codes are not sequential or otherwise trivially predictable", async () => {
    const seq = [];
    for (let i = 0; i < 200; i++) seq.push(Number(await generateOtp(`s-${i}`)));
    const ascending = seq.every((v, i) => i === 0 || v >= seq[i - 1]);
    assert.ok(!ascending, "codes increase monotonically — they are predictable");
  });
});

describe("C-04 · brute force is bounded", () => {
  test("five wrong attempts invalidate the code", async () => {
    const code = await generateOtp(PHONE);
    // A wrong code of the SAME width, so the rejection is about the value rather
    // than about a length the verifier could have thrown out early.
    const a = "1".repeat(OTP_LENGTH), b = "2".repeat(OTP_LENGTH);
    const wrong = code === a ? b : a;
    for (let i = 0; i < 5; i++) {
      assert.equal(await verifyOtp(PHONE, wrong), false, `attempt ${i + 1} should fail`);
    }
    // The real code must no longer work — the attacker burned the code, not the user's turn.
    assert.equal(await verifyOtp(PHONE, code), false,
      "the correct code still worked after 5 wrong attempts");
  });

  test("a fresh code stays blocked during phone lockout and works after the window", async () => {
    const p = "07700009991";
    const t0 = Date.now();
    await generateOtp(p, t0);
    for (let i = 0; i < 5; i++) await verifyOtp(p, "000001", t0 + i + 1);
    await assert.rejects(
      () => generateOtp(p, t0 + 30 * 1000),
      (error) => error?.code === "otp_rate_limited",
    );
    const fresh = await generateOtp(p, t0 + 60 * 60 * 1000 + 1);
    assert.equal(await verifyOtp(p, fresh, t0 + 60 * 60 * 1000 + 2), true);
  });

  test("the space cannot be walked within one code's lifetime", async () => {
    // This used to assert against a hardcoded 900_000, which kept passing after
    // the width changed while describing a space the app no longer uses. The
    // numbers are computed now, so the claim is about the shipped configuration.
    //
    // At four digits the width alone is NOT the defence — 9,000 codes is small.
    // What makes it safe is that the attacker gets OTP_MAX_ATTEMPTS guesses per
    // hour against a given phone, and only within a code that lives five minutes.
    // Both bounds are read from the source and asserted directly below.
    const store = readFileSync(join(root, "server/otpStore.ts"), "utf8");
    const attempts = Number(store.match(/OTP_MAX_ATTEMPTS = (\d+)/)[1]);
    // eslint-disable-next-line no-eval
    const windowMs = eval(store.match(/OTP_ABUSE_WINDOW_MS = ([^;]+);/)[1]);
    // eslint-disable-next-line no-eval
    const ttlMs = eval(store.match(/OTP_TTL_MS = ([^;]+);/)[1]);

    const space = 10 ** OTP_LENGTH - 10 ** (OTP_LENGTH - 1);
    // Guesses available while any one code is still alive.
    const perLifetime = attempts * Math.max(1, Math.floor(ttlMs / windowMs));
    assert.ok(perLifetime < space / 100,
      `${perLifetime} guesses against a space of ${space} — a code could be found`);

    // And the wall-clock cost of walking the whole space at that rate, in years.
    const years = (space / attempts) * (windowMs / 1000) / (365 * 24 * 3600);
    assert.ok(years > 0.1,
      `the whole space is walkable in ${years.toFixed(3)} years — the limiter is too loose`);
  });

  test("same phone remains blocked when the caller changes IP or device", async () => {
    const src = readFileSync(join(root, "server/index.ts"), "utf8");
    const store = readFileSync(join(root, "server/otpStore.ts"), "utf8");
    assert.match(src, /\/api\/auth\/send-otp": 5/);
    assert.match(src, /\/api\/auth\/verify-otp": 15/);
    assert.match(store, /OTP_ABUSE_COLLECTION = "otpAbuse"/);
    assert.match(store, /doc\(canonicalPhone\)/);
    assert.doesNotMatch(store, /trustedClientIp|remoteAddress|deviceId|sessionId/);
  });
});

describe("C-04 · expiry and replay", () => {
  test("a used code cannot be replayed", async () => {
    const p = "07700009992";
    const code = await generateOtp(p);
    assert.equal(await verifyOtp(p, code), true);
    assert.equal(await verifyOtp(p, code), false, "the code was accepted twice");
  });

  test("phone normalization variants share one abuse identity", async () => {
    const canonical = "07700009993";
    const t0 = Date.now();
    const variants = ["07700009993", "7700009993", "+9647700009993", "009647700009993"];
    await generateOtp(variants[0], t0);
    for (let i = 0; i < 5; i++) await verifyOtp(variants[i % variants.length], "000001", t0 + i + 1);
    await assert.rejects(
      () => generateOtp(canonical, t0 + 30 * 1000),
      (error) => error?.code === "otp_rate_limited",
      "changing Iraqi phone notation bypassed the phone-wide limiter",
    );
  });

  test("a code for one phone does not verify another phone", async () => {
    const code = await generateOtp("07701111111");
    assert.equal(await verifyOtp("07702222222", code), false);
  });

  test("verifying without ever requesting fails", async () => {
    assert.equal(await verifyOtp("07709999999", "123456"), false);
  });

  test("the code carries a TTL and it is short", async () => {
    // H-75: the constant moved to server/otpStore.ts with the store itself.
    const src = readFileSync(join(root, "server/otpStore.ts"), "utf8");
    const m = src.match(/OTP_TTL_MS = ([^;]+);/);
    assert.ok(m, "the TTL constant disappeared");
    // eslint-disable-next-line no-eval
    const ttl = eval(m[1]);
    assert.ok(ttl > 0 && ttl <= 10 * 60 * 1000, `TTL is ${ttl}ms — too long`);
  });

  test("an expired code is rejected and cleared", async () => {
    // H-75: the same rule, now inside the Firestore transaction — an expired
    // record is deleted and reported as expired, never accepted.
    const src = readFileSync(join(root, "server/otpStore.ts"), "utf8");
    assert.match(src, /if \(now > expiresAtMillis\(data\)\) \{\s*tx\.delete\(ref\);\s*return "expired" as const;/,
      "the expiry branch changed shape");
  });
});

describe("C-04 · the development bypass cannot fire in production", () => {
  test("the 0000 bypass is gated on isDevMode()", async () => {
    const src = readFileSync(join(root, "server/firebase.ts"), "utf8");
    assert.match(src, /if \(code === "0000" && isDevMode\(\)\)/,
      "the dev bypass is no longer gated");
  });

  test("isDevMode is false under NODE_ENV=production regardless of other flags", async () => {
    const env = readFileSync(join(root, "server/env.ts"), "utf8");
    assert.match(env, /if \(process\.env\.NODE_ENV === "production"\) return false;/);
    assert.match(env, /if \(process\.env\.REPLIT_DEPLOYMENT === "1"\) return false;/);
    assert.match(env, /return process\.env\.DEV_MODE === "true";/);
  });

  test("the bypass is inert here — DEV_MODE is unset", async () => {
    const p = "07700009994";
    await generateOtp(p);
    assert.equal(await verifyOtp(p, "0000"), false,
      "the dev bypass fired outside development");
  });
});

describe("C-04 · client and server agree on the length", () => {
  test("the OTP screen uses the same width the server mints", async () => {
    // Compared rather than pinned: the two are separate constants in separate
    // files, and the only thing that matters is that they are equal. Pinning a
    // literal here would let both drift together and still pass.
    const screen = readFileSync(join(root, "client/screens/OtpVerificationScreen.tsx"), "utf8");
    const client = screen.match(/const OTP_LENGTH = (\d+);/);
    assert.ok(client, "the client no longer declares OTP_LENGTH");
    assert.equal(
      Number(client[1]),
      OTP_LENGTH,
      "the client would render the wrong number of boxes and reject valid codes",
    );
  });

  test("the screen derives everything from that constant", async () => {
    const screen = readFileSync(join(root, "client/screens/OtpVerificationScreen.tsx"), "utf8");
    assert.match(screen, /Array\.from\(\{ length: OTP_LENGTH \}\)/);
    assert.match(screen, /otpCode\.length !== OTP_LENGTH/);
  });
});
