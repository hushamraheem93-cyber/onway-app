/**
 * OTP authentication tests.
 *
 * OTP is the single gate to every account on the platform — customer, and by
 * extension driver and vendor, since both exchange the OTP-issued customer JWT
 * for their own token. It had zero automated tests.
 *
 * These exercise the REAL functions against their real in-memory store. Nothing
 * is mocked: `otpStore` needs no Firestore, so this is genuine behaviour, not
 * mock behaviour. Each test uses a distinct phone number because the store is
 * module-level shared state.
 *
 * Run:  npm run test:unit
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";

import { generateOtp, verifyOtp } from "../../server/firebase.ts";

// Unique phone per test so the shared store cannot leak between cases.
let seq = 0;
const phone = () => `0770000${String(++seq).padStart(4, "0")}`;

// isDevMode() reads process.env at call time, so tests drive it directly.
const origEnv = { ...process.env };
function setEnv(vars) {
  for (const k of ["NODE_ENV", "DEV_MODE", "REPLIT_DEPLOYMENT"]) delete process.env[k];
  Object.assign(process.env, vars);
}
after(() => {
  for (const k of ["NODE_ENV", "DEV_MODE", "REPLIT_DEPLOYMENT"]) delete process.env[k];
  Object.assign(process.env, origEnv);
});

describe("OTP — code generation", () => {
  before(() => setEnv({ NODE_ENV: "production" }));

  // C-04: the code was 4 digits (9,000 possibilities) — the finding's "guessable
  // within hours". It is 6 now (900,000). These assertions pinned the old size.
  test("issues a 6-digit numeric code", () => {
    const code = generateOtp(phone());
    assert.match(code, /^\d{6}$/, "code must be exactly 6 digits");
  });

  test("code is within the documented 100000-999999 range", () => {
    for (let i = 0; i < 50; i++) {
      const n = Number(generateOtp(phone()));
      assert.ok(n >= 100000 && n <= 999999, `code ${n} out of range`);
    }
  });

  test("codes are not sequential or constant across calls", () => {
    // Guards against a broken RNG (e.g. a stubbed or seeded generator that
    // returns the same value, which would make every account guessable).
    const codes = new Set();
    for (let i = 0; i < 60; i++) codes.add(generateOtp(phone()));
    assert.ok(codes.size > 20, `expected varied codes, got only ${codes.size} distinct of 60`);
  });

  test("re-issuing for the same phone replaces the previous code", () => {
    const p = phone();
    const first = generateOtp(p);
    let second = generateOtp(p);
    // Regenerate on the rare collision so the assertion tests replacement, not luck.
    let guard = 0;
    while (second === first && guard++ < 20) second = generateOtp(p);

    assert.equal(verifyOtp(p, first), false, "the superseded code must stop working");
    assert.equal(verifyOtp(p, second), true, "the newest code must work");
  });
});

describe("OTP — verification", () => {
  before(() => setEnv({ NODE_ENV: "production" }));

  test("accepts the correct code", () => {
    const p = phone();
    const code = generateOtp(p);
    assert.equal(verifyOtp(p, code), true);
  });

  test("rejects an incorrect code", () => {
    const p = phone();
    const code = generateOtp(p);
    const wrong = String(((Number(code) - 100000 + 1) % 900000) + 100000);
    assert.equal(verifyOtp(p, wrong), false);
  });

  test("a code is single-use — it cannot be replayed", () => {
    const p = phone();
    const code = generateOtp(p);

    assert.equal(verifyOtp(p, code), true, "first use succeeds");
    assert.equal(verifyOtp(p, code), false, "replaying the same code must fail");
  });

  test("rejects verification for a phone that never requested a code", () => {
    assert.equal(verifyOtp(phone(), "123456"), false);
  });

  test("a code issued for one phone does not verify another phone", () => {
    const a = phone();
    const b = phone();
    const codeA = generateOtp(a);
    generateOtp(b);

    assert.equal(verifyOtp(b, codeA), false, "codes must be scoped to their phone number");
  });
});

describe("OTP — brute-force protection", () => {
  before(() => setEnv({ NODE_ENV: "production" }));

  test("invalidates the code after 5 wrong attempts", () => {
    const p = phone();
    const code = generateOtp(p);
    const wrong = String(((Number(code) - 100000 + 1) % 900000) + 100000);

    for (let i = 0; i < 5; i++) {
      assert.equal(verifyOtp(p, wrong), false, `wrong attempt ${i + 1} must fail`);
    }

    // The correct code must now be dead: even at 6 digits an unlimited-attempt
    // so the attempt cap is what makes the short code safe.
    assert.equal(
      verifyOtp(p, code),
      false,
      "after 5 wrong attempts the code must be invalidated, even for the correct value",
    );
  });

  test("the correct code still works on the 5th attempt if not yet exhausted", () => {
    const p = phone();
    const code = generateOtp(p);
    const wrong = String(((Number(code) - 100000 + 1) % 900000) + 100000);

    for (let i = 0; i < 4; i++) verifyOtp(p, wrong);

    assert.equal(verifyOtp(p, code), true, "4 wrong attempts must not lock out a legitimate user");
  });

  test("requesting a fresh code clears the failed-attempt counter", () => {
    const p = phone();
    const code1 = generateOtp(p);
    const wrong = String((Number(code1) % 9000) + 1000).padStart(4, "0");
    for (let i = 0; i < 4; i++) verifyOtp(p, wrong);

    const code2 = generateOtp(p);
    for (let i = 0; i < 4; i++) verifyOtp(p, wrong);

    assert.equal(verifyOtp(p, code2), true, "a new code must start with a fresh attempt budget");
  });
});

describe("OTP — development bypass must never work in production", () => {
  test('"0000" is accepted when DEV_MODE=true', () => {
    setEnv({ NODE_ENV: "development", DEV_MODE: "true" });
    assert.equal(verifyOtp(phone(), "0000"), true);
  });

  test('"0000" is REJECTED when NODE_ENV=production', () => {
    // The highest-severity assertion in this file: if this ever passes,
    // anyone can log in as anyone with a fixed code.
    setEnv({ NODE_ENV: "production", DEV_MODE: "true" });
    assert.equal(
      verifyOtp(phone(), "0000"),
      false,
      "production must ignore DEV_MODE — the fixed bypass code cannot be live",
    );
  });

  test('"0000" is REJECTED on a published Replit deployment', () => {
    setEnv({ DEV_MODE: "true", REPLIT_DEPLOYMENT: "1" });
    assert.equal(
      verifyOtp(phone(), "0000"),
      false,
      "REPLIT_DEPLOYMENT=1 must disable the bypass as defence-in-depth",
    );
  });

  test('"0000" is rejected when DEV_MODE is simply unset', () => {
    setEnv({ NODE_ENV: "development" });
    assert.equal(
      verifyOtp(phone(), "0000"),
      false,
      "the bypass requires an explicit DEV_MODE=true, not merely a non-production NODE_ENV",
    );
  });

  test("the dev bypass does not weaken real code verification", () => {
    setEnv({ NODE_ENV: "development", DEV_MODE: "true" });
    const p = phone();
    const code = generateOtp(p);
    const wrong = String(((Number(code) - 100000 + 1) % 900000) + 100000);

    assert.equal(verifyOtp(p, wrong), false, "a wrong code must still fail in dev mode");
    assert.equal(verifyOtp(p, code), true, "the real code must still work in dev mode");
  });
});
