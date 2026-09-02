import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { bootOtp } from "./_otpHarness.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const STORE_SRC = readFileSync(join(root, "server/otpStore.ts"), "utf8");
const ROUTES_SRC = readFileSync(join(root, "server/routes.ts"), "utf8");
const INDEX_SRC = readFileSync(join(root, "server/index.ts"), "utf8");
// Read, not pinned — this suite is about the abuse limiter, which is what bounds
// guessing at any width. The width itself is asserted in c04-otp-strength.
const OTP_LENGTH = Number(STORE_SRC.match(/OTP_LENGTH = (\d+)/)[1]);

const t0 = 10_000_000;
const phone = (n) => `0770001${String(n).padStart(4, "0")}`;
const cooldownSchedule = [0, 30, 90, 390, 690].map((s) => t0 + s * 1000);

const expectRateLimited = async (promise, message = "expected OTP rate limit") => {
  await assert.rejects(promise, (error) => error?.code === "otp_rate_limited", message);
};

async function lockPhone(otp, p, start = t0) {
  await otp.issueOtp(p, start);
  for (let i = 0; i < 5; i++) {
    await otp.verifyOtp(p, "000001", start + i + 1);
  }
}

before(() => {
  delete process.env.DEV_MODE;
  process.env.NODE_ENV = "production";
});
after(() => {
  delete process.env.DEV_MODE;
  delete process.env.NODE_ENV;
});

describe("C-04 — persistent OTP abuse protection", () => {
  test("1. normal OTP request succeeds and persists one code", async () => {
    const otp = bootOtp();
    const code = await otp.generateOtp(phone(1), t0);
    assert.match(code, new RegExp(`^\\d{${OTP_LENGTH}}$`));
    assert.equal(otp.store.has(`otpCodes/${phone(1)}`), true);
    assert.equal(otp.store.has(`otpAbuse/${phone(1)}`), true);
  });

  test("2. repeated requests are blocked after the existing five-send budget", async () => {
    const otp = bootOtp();
    const p = phone(2);
    for (const at of cooldownSchedule) await otp.generateOtp(p, at);
    await expectRateLimited(otp.generateOtp(p, t0 + 700 * 1000));
  });

  test("3. changing IP cannot bypass the persistent phone limiter", async () => {
    const otp = bootOtp();
    const p = phone(3);
    await lockPhone(otp, p);
    assert.match(STORE_SRC, /OTP_ABUSE_COLLECTION = "otpAbuse"/);
    assert.match(STORE_SRC, /doc\(canonicalPhone\)/);
    assert.match(INDEX_SRC, /trustedClientIp/);
    await expectRateLimited(otp.generateOtp(p, t0 + 30 * 1000));
  });

  test("4. changing device or session cannot bypass the phone limiter", async () => {
    const otp = bootOtp();
    const p = phone(4);
    await lockPhone(otp, p);
    // Device/session identifiers are deliberately absent from the persistent key.
    assert.doesNotMatch(STORE_SRC, /deviceId|sessionId/);
    await expectRateLimited(otp.generateOtp(p, t0 + 30 * 1000));
  });

  test("5. wrong OTP attempts accumulate across resends and eventually lock the phone", async () => {
    const otp = bootOtp();
    const p = phone(5);
    await otp.issueOtp(p, t0);
    await otp.verifyOtp(p, "000001", t0 + 1);
    await otp.generateOtp(p, t0 + 30 * 1000);
    await otp.verifyOtp(p, "000001", t0 + 30 * 1000 + 1);
    await otp.generateOtp(p, t0 + 90 * 1000);
    await otp.verifyOtp(p, "000001", t0 + 90 * 1000 + 1);
    await otp.generateOtp(p, t0 + 390 * 1000);
    await otp.verifyOtp(p, "000001", t0 + 390 * 1000 + 1);
    await otp.generateOtp(p, t0 + 690 * 1000);
    await otp.verifyOtp(p, "000001", t0 + 690 * 1000 + 1);
    await expectRateLimited(otp.generateOtp(p, t0 + 700 * 1000));
  });

  test("6. expired OTP is rejected and the code record is removed", async () => {
    const otp = bootOtp();
    const p = phone(6);
    const code = await otp.generateOtp(p, t0);
    assert.equal(await otp.verifyOtp(p, code, t0 + 5 * 60 * 1000 + 1), false);
    assert.equal(otp.store.has(`otpCodes/${p}`), false);
  });

  test("7. correct OTP within validity is accepted exactly once", async () => {
    const otp = bootOtp();
    const p = phone(7);
    const code = await otp.generateOtp(p, t0);
    assert.equal(await otp.verifyOtp(p, code, t0 + 5 * 60 * 1000 - 1), true);
    assert.equal(await otp.verifyOtp(p, code, t0 + 5 * 60 * 1000 - 1), false);
  });

  test("8. resend cooldown is enforced and exposes a retry duration", async () => {
    const otp = bootOtp();
    const p = phone(8);
    await otp.generateOtp(p, t0);
    await expectRateLimited(otp.generateOtp(p, t0 + 1));
    await otp.generateOtp(p, t0 + 30 * 1000);
  });

  test("9. concurrent wrong verifications cannot bypass the cumulative counter", async () => {
    const otp = bootOtp();
    const p = phone(9);
    await otp.generateOtp(p, t0);
    const results = await Promise.all(
      Array.from({ length: 20 }, () => otp.verifyOtp(p, "000001", t0 + 1)),
    );
    assert.equal(results.every((result) => result === false), true);
    await expectRateLimited(otp.generateOtp(p, t0 + 30 * 1000));
  });

  test("10. Iraqi phone normalization variants share one limiter", async () => {
    const otp = bootOtp();
    const variants = ["07700010010", "7700010010", "+9647700010010", "009647700010010"];
    await otp.generateOtp(variants[0], t0);
    for (let i = 0; i < 5; i++) {
      await otp.verifyOtp(variants[i % variants.length], "000001", t0 + i + 1);
    }
    await expectRateLimited(otp.generateOtp(variants[1], t0 + 30 * 1000));
  });

  test("11. successful verification resets the phone abuse state", async () => {
    const otp = bootOtp();
    const p = phone(11);
    const first = await otp.generateOtp(p, t0);
    await otp.verifyOtp(p, "000001", t0 + 1);
    const second = await otp.generateOtp(p, t0 + 30 * 1000);
    assert.equal(await otp.verifyOtp(p, second, t0 + 30 * 1000 + 1), true);
    const third = await otp.generateOtp(p, t0 + 30 * 1000 + 2);
    assert.notEqual(third, first);
  });

  test("12. different phone numbers remain independent", async () => {
    const otp = bootOtp();
    const locked = phone(12);
    const independent = phone(13);
    await lockPhone(otp, locked);
    const code = await otp.generateOtp(independent, t0);
    assert.equal(await otp.verifyOtp(independent, code, t0 + 1), true);
  });

  test("13. persistent abuse state survives a restart and a second instance", async () => {
    const first = bootOtp();
    const p = phone(14);
    await first.issueOtp(p, t0);
    await first.verifyOtp(p, "000001", t0 + 1);
    const second = bootOtp(first.db);
    await second.issueOtp(p, t0 + 30 * 1000);
    await second.verifyOtp(p, "000001", t0 + 30 * 1000 + 1);
    const restarted = bootOtp(first.db);
    await expectRateLimited(restarted.generateOtp(p, t0 + 60 * 1000));
  });

  test("14. abuse state is TTL-compatible and can be swept after its hourly window", async () => {
    const otp = bootOtp();
    const p = phone(15);
    await otp.generateOtp(p, t0);
    assert.equal(await otp.sweepExpiredOtpAbuse(t0 + 60 * 60 * 1000 + 1), 1);
    assert.equal(otp.store.has(`otpAbuse/${p}`), false);
  });

  test("15. server enforcement returns a distinct 429 path for phone abuse", () => {
    assert.match(ROUTES_SRC, /err\?\.code === "otp_rate_limited"/);
    assert.match(ROUTES_SRC, /res\.status\(429\)\.json/);
    assert.match(ROUTES_SRC, /Retry-After/);
  });
});
