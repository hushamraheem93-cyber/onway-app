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

describe("C-04 · the code is large enough to resist guessing", () => {
  test("OTP_LENGTH is 6", async () => {
    assert.equal(OTP_LENGTH, 6);
  });

  test("every generated code is exactly 6 digits", async () => {
    for (let i = 0; i < 500; i++) {
      const code = await generateOtp(`${PHONE}-${i}`);
      assert.match(code, /^\d{6}$/, `got ${JSON.stringify(code)}`);
    }
  });

  test("no code ever has a leading zero — the fixed-width input stays aligned", async () => {
    for (let i = 0; i < 500; i++) {
      assert.notEqual(await generateOtp(`lz-${i}`)[0], "0");
    }
  });

  test("the space is ~100× the old one", async () => {
    // 4 digits spanned 1000–9999 (9,000). Six spans 100000–999999 (900,000).
    const codes = new Set();
    for (let i = 0; i < 3000; i++) codes.add(Number(await generateOtp(`e-${i}`)));
    const min = Math.min(...codes), max = Math.max(...codes);
    assert.ok(min >= 100000, `a code below the 6-digit floor: ${min}`);
    assert.ok(max <= 999999, `a code above the 6-digit ceiling: ${max}`);
    // 3,000 draws from 900,000 should almost never collide; from 9,000 they would
    // collide constantly (birthday bound). This distinguishes the two spaces.
    assert.ok(codes.size > 2900, `only ${codes.size} distinct codes in 3000 draws`);
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
    const wrong = code === "111111" ? "222222" : "111111";
    for (let i = 0; i < 5; i++) {
      assert.equal(await verifyOtp(PHONE, wrong), false, `attempt ${i + 1} should fail`);
    }
    // The real code must no longer work — the attacker burned the code, not the user's turn.
    assert.equal(await verifyOtp(PHONE, code), false,
      "the correct code still worked after 5 wrong attempts");
  });

  test("a fresh code is needed after lockout, and it works", async () => {
    await generateOtp(PHONE);
    for (let i = 0; i < 5; i++) await verifyOtp(PHONE, "000001");
    const fresh = await generateOtp(PHONE);
    assert.equal(await verifyOtp(PHONE, fresh), true);
  });

  test("guessing the whole space is not possible within one code's lifetime", async () => {
    // 900,000 codes / 5 attempts = 180,000 send-otp calls, and send-otp is capped
    // at 5 per minute per IP (server/index.ts LIMITS).
    const SPACE = 900_000, ATTEMPTS = 5, SENDS_PER_MIN = 5;
    const minutes = SPACE / ATTEMPTS / SENDS_PER_MIN;
    assert.ok(minutes > 30_000, `only ${Math.round(minutes)} minutes to exhaust the space`);
  });
});

describe("C-04 · expiry and replay", () => {
  test("a used code cannot be replayed", async () => {
    const code = await generateOtp(PHONE);
    assert.equal(await verifyOtp(PHONE, code), true);
    assert.equal(await verifyOtp(PHONE, code), false, "the code was accepted twice");
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
    await generateOtp(PHONE);
    assert.equal(await verifyOtp(PHONE, "0000"), false,
      "the dev bypass fired outside development");
  });
});

describe("C-04 · client and server agree on the length", () => {
  test("the OTP screen uses the same 6", async () => {
    const screen = readFileSync(join(root, "client/screens/OtpVerificationScreen.tsx"), "utf8");
    assert.match(screen, /const OTP_LENGTH = 6;/,
      "the client would render the wrong number of boxes and reject valid codes");
  });

  test("the screen derives everything from that constant", async () => {
    const screen = readFileSync(join(root, "client/screens/OtpVerificationScreen.tsx"), "utf8");
    assert.match(screen, /Array\.from\(\{ length: OTP_LENGTH \}\)/);
    assert.match(screen, /otpCode\.length !== OTP_LENGTH/);
  });
});
