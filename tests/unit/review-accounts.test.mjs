/**
 * App-store review accounts — the login path that reaches production.
 *
 * The development bypass ("0000") is unreachable in production because
 * isDevMode() is false there. This mechanism IS reachable in production, so
 * every bound on it is load-bearing and every one is asserted here by executing
 * the shipped functions rather than by reading the source for reassuring words.
 *
 * server/reviewAccounts.ts is imported directly — it has no Firestore dependency,
 * so there is nothing to stub. The two call sites in routes.ts are checked
 * structurally at the end, because a perfect module wired in wrongly is still a
 * hole.
 *
 * Run:  node --test tests/unit/review-accounts.test.mjs
 */
import { test, describe, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { stripComments } from "./_source.mjs";

const ts = createRequire(import.meta.url)("typescript");

import {
  reviewAccountsEnabled,
  reviewRoleFor,
  isReviewPhone,
  reviewCodeMatches,
  reviewAccountList,
} from "../../server/reviewAccounts.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const ROUTES = stripComments(readFileSync(join(root, "server/routes.ts"), "utf8"));

const CODE = "rev-code-123456";
const CUSTOMER = "07701111104";
const VENDOR = "07701111105";
const DRIVER = "07701111106";
// A real user's number, and two near-misses for the review numbers.
const ORDINARY = "07701234567";
const NEAR_MISS = ["07701111107", "07701111103", "0770111110", "077011111040"];

const origEnv = process.env.REVIEW_LOGIN_CODE;
beforeEach(() => { process.env.REVIEW_LOGIN_CODE = CODE; });
after(() => {
  if (origEnv === undefined) delete process.env.REVIEW_LOGIN_CODE;
  else process.env.REVIEW_LOGIN_CODE = origEnv;
});

describe("review accounts · the three numbers and their roles", () => {
  test("exactly three accounts exist", () => {
    assert.equal(reviewAccountList().length, 3,
      "the review allowlist changed size — every entry is a production login");
  });

  test("each number is pinned to the role it is provisioned for", () => {
    assert.equal(reviewRoleFor(CUSTOMER), "customer");
    assert.equal(reviewRoleFor(VENDOR), "vendor");
    assert.equal(reviewRoleFor(DRIVER), "driver");
  });

  test("no two review numbers share a role", () => {
    const roles = reviewAccountList().map((a) => a.role);
    assert.equal(new Set(roles).size, roles.length);
  });

  test("every entry is a canonical Iraqi mobile number", () => {
    for (const { phoneNumber } of reviewAccountList()) {
      assert.match(phoneNumber, /^07\d{9}$/, `${phoneNumber} is not canonical`);
    }
  });
});

describe("review accounts · the reviewer may type the number either way", () => {
  // A reviewer typing 7701111104 without the leading zero must get in. That works
  // only because BOTH endpoints normalise before consulting the allowlist, so
  // this executes the shipped toLocalPhone and then the shipped allowlist, and
  // separately proves the ordering in routes.ts — the allowlist itself only ever
  // sees canonical numbers and would not match a raw one.
  const toLocalPhone = (() => {
    const m = ROUTES.match(/function toLocalPhone\(raw: string\): string \{[\s\S]*?\n  \}/);
    assert.ok(m, "toLocalPhone disappeared");
    const js = ts.transpileModule(`${m[0]}\nreturn toLocalPhone;`, {
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None },
    }).outputText;
    return new Function(js)();
  })();

  test("every Iraqi notation of a review number reaches the same account", () => {
    for (const { phoneNumber, role } of reviewAccountList()) {
      const bare = phoneNumber.slice(1);                 // 7701111104
      for (const typed of [
        phoneNumber, bare, `+964${bare}`, `00964${bare}`, `964${bare}`,
        `${phoneNumber.slice(0, 4)} ${phoneNumber.slice(4, 7)} ${phoneNumber.slice(7)}`,
      ]) {
        const canonical = toLocalPhone(typed);
        assert.equal(canonical, phoneNumber, `${typed} normalised to ${canonical}`);
        assert.equal(reviewRoleFor(canonical), role, `${typed} lost its role`);
        assert.equal(reviewCodeMatches(canonical, CODE), true, `${typed} could not sign in`);
      }
    }
  });

  test("both endpoints normalise BEFORE they consult the allowlist", () => {
    // Order matters: reversed, a reviewer typing 7701111104 would be treated as
    // an ordinary number and sent an SMS to a handset nobody holds.
    for (const [route, guard] of [
      ['app.post("/api/auth/send-otp"', "isReviewPhone(phoneNumber)"],
      ['app.post("/api/auth/verify-otp"', "reviewCodeMatches(phoneNumber, code)"],
    ]) {
      const at = ROUTES.indexOf(route);
      assert.ok(at > 0, `${route} disappeared`);
      const body = ROUTES.slice(at, at + 2200);
      const norm = body.indexOf("toLocalPhone(String(req.body.phoneNumber))");
      const check = body.indexOf(guard);
      assert.ok(norm > 0, `${route} no longer normalises the number`);
      assert.ok(check > 0, `${route} no longer consults the allowlist`);
      assert.ok(norm < check, `${route} consults the allowlist before normalising`);
    }
  });

  test("the allowlist itself rejects a non-canonical number", () => {
    // Proof the guarantee above comes from the endpoints, not from luck here.
    assert.equal(isReviewPhone("7701111104"), false);
    assert.equal(isReviewPhone("+9647701111104"), false);
  });
});

describe("review accounts · the code unlocks only these numbers", () => {
  test("the right code signs in each of the three", () => {
    for (const { phoneNumber } of reviewAccountList()) {
      assert.equal(reviewCodeMatches(phoneNumber, CODE), true, `${phoneNumber} could not sign in`);
    }
  });

  test("a wrong code signs in none of them", () => {
    for (const { phoneNumber } of reviewAccountList()) {
      for (const bad of [
        "", " ", "0000", "123456", CODE + "x", CODE.slice(0, -1),
        CODE.toUpperCase(), null, undefined, 123456, {}, [],
      ]) {
        assert.equal(reviewCodeMatches(phoneNumber, bad), false,
          `${phoneNumber} accepted ${JSON.stringify(bad)}`);
      }
    }
  });

  test("an ordinary user's number is never unlocked, not even by the review code", () => {
    // The most important assertion in the file: if this ever passes, the code is
    // a master key to every account on the platform.
    assert.equal(reviewCodeMatches(ORDINARY, CODE), false);
    assert.equal(isReviewPhone(ORDINARY), false);
    assert.equal(reviewRoleFor(ORDINARY), null);
  });

  test("a number one digit away from a review number is an ordinary number", () => {
    for (const near of NEAR_MISS) {
      assert.equal(reviewCodeMatches(near, CODE), false, `${near} was treated as a review number`);
      assert.equal(isReviewPhone(near), false);
    }
  });

  test("malformed and hostile phone inputs are rejected, never thrown on", () => {
    for (const bad of ["", " ", null, undefined, 0, {}, [], "__proto__", "constructor", "toString"]) {
      assert.equal(reviewCodeMatches(bad, CODE), false, `${JSON.stringify(bad)} unlocked something`);
      assert.equal(isReviewPhone(bad), false);
    }
  });
});

describe("review accounts · the mechanism is off unless deliberately armed", () => {
  test("with REVIEW_LOGIN_CODE unset, the three numbers are ordinary numbers", () => {
    delete process.env.REVIEW_LOGIN_CODE;
    assert.equal(reviewAccountsEnabled(), false);
    for (const { phoneNumber } of reviewAccountList()) {
      assert.equal(isReviewPhone(phoneNumber), false);
      assert.equal(reviewRoleFor(phoneNumber), null);
      assert.equal(reviewCodeMatches(phoneNumber, CODE), false);
      assert.equal(reviewCodeMatches(phoneNumber, ""), false,
        "an unset code must not mean an empty code unlocks the account");
    }
  });

  test("an empty or too-short code does not arm it", () => {
    for (const weak of ["", " ", "1", "12345", "     "]) {
      process.env.REVIEW_LOGIN_CODE = weak;
      assert.equal(reviewAccountsEnabled(), false, `"${weak}" armed the review path`);
      assert.equal(reviewCodeMatches(CUSTOMER, weak), false);
      assert.equal(reviewCodeMatches(CUSTOMER, weak.trim()), false);
    }
  });

  test("the code is read at call time, so unsetting it takes effect on restart-free reload", () => {
    assert.equal(reviewCodeMatches(CUSTOMER, CODE), true);
    process.env.REVIEW_LOGIN_CODE = "a-different-code-entirely";
    assert.equal(reviewCodeMatches(CUSTOMER, CODE), false,
      "the old code still worked — the value was captured at import");
  });

  test("the code comparison is constant-time", () => {
    // Honest about what this is: a STRUCTURAL check, not a behavioural one.
    // Swapping timingSafeEqual for `===` leaves every observable result
    // identical — only the timing differs, and timing is not measurable
    // reliably enough in a unit test to assert on. So the guard is that the
    // constant-time primitive is still the one being called. A reviewer
    // changing this line has to change this test too, which is the point.
    const src = readFileSync(join(root, "server/reviewAccounts.ts"), "utf8");
    assert.match(src, /crypto\.timingSafeEqual\(a, b\)/,
      "the comparison is no longer constant-time — a shared prefix leaks by timing");
    assert.match(src, /if \(supplied\.length !== expected\.length\) return false;/,
      "the length pre-check is gone — timingSafeEqual throws on unequal lengths");
    assert.doesNotMatch(src, /supplied === expected|expected === supplied/,
      "a plain string compare short-circuits the constant-time path");
  });

  test("no code literal is committed to the repository", () => {
    const src = readFileSync(join(root, "server/reviewAccounts.ts"), "utf8");
    const assignment = src.match(/REVIEW_LOGIN_CODE\s*=\s*["'][^"']+["']/);
    assert.equal(assignment, null, "a default code is hardcoded — it would ship in every deploy");
  });
});

describe("review accounts · ordinary OTP is untouched", () => {
  test("the ordinary verification path still runs for every non-review number", () => {
    const at = ROUTES.indexOf('app.post("/api/auth/verify-otp"');
    assert.ok(at > 0, "verify-otp disappeared");
    const body = ROUTES.slice(at, at + 1400);
    // The review check may short-circuit, but verifyOtpCode must still be the
    // path taken when it does not.
    assert.match(body, /reviewCodeMatches\(phoneNumber, code\)/);
    assert.match(body, /await verifyOtpCode\(phoneNumber, code\)/,
      "the real OTP check is gone — every login would depend on the review path");
    assert.ok(
      body.indexOf("reviewCodeMatches") < body.indexOf("verifyOtpCode"),
      "the review check must be the exception, evaluated before the fallback",
    );
  });

  test("send-otp still generates and sends for ordinary numbers", () => {
    const at = ROUTES.indexOf('app.post("/api/auth/send-otp"');
    const body = ROUTES.slice(at, at + 2200);
    assert.match(body, /isReviewPhone\(phoneNumber\)/);
    assert.match(body, /await generateOtp\(phoneNumber\)/,
      "ordinary numbers no longer get a code generated");
    assert.match(body, /deliverOtp\(phoneNumber, code/,
      "ordinary numbers no longer get an SMS");
    assert.ok(
      body.indexOf("isReviewPhone") < body.indexOf("generateOtp"),
      "a review number should return before a code is minted and an SMS is spent",
    );
  });

  test("the rate limiter and the dev bypass are both left alone", () => {
    const index = readFileSync(join(root, "server/index.ts"), "utf8");
    assert.match(index, /\/api\/auth\/send-otp": 5/, "the send-otp rate limit changed");
    assert.match(index, /\/api\/auth\/verify-otp": 15/, "the verify-otp rate limit changed");
    const fb = readFileSync(join(root, "server/firebase.ts"), "utf8");
    assert.match(fb, /if \(code === "0000" && isDevMode\(\)\)/,
      "the development bypass was altered — it must stay exactly as it was");
  });

  test("the review path never widens who may mint a driver or vendor token", () => {
    // Role isolation comes from these two checks, not from reviewAccounts.ts.
    assert.match(ROUTES, /const driver = await getDriverByPhone\(phoneNumber\);\s*if \(!driver\) return res\.json\(\{ driver: null, token: null \}\)/,
      "the driver token no longer requires a driver record");
    const vendor = stripComments(readFileSync(join(root, "server/vendor.ts"), "utf8"));
    assert.match(vendor, /if \(snap\.empty\) \{\s*return res\.json\(\{ vendor: null, token: null \}\)/,
      "the vendor token no longer requires a vendor record");
    // And nothing in the review module can be reached from those paths.
    assert.doesNotMatch(vendor, /reviewAccounts|reviewCodeMatches|isReviewPhone/,
      "the vendor token path consults the review allowlist — roles would stop being data-driven");
  });
});

describe("review accounts · nothing secret reaches the logs or the client", () => {
  test("the review log lines carry a masked number and never the code", () => {
    const at = ROUTES.indexOf('app.post("/api/auth/verify-otp"');
    const body = ROUTES.slice(at, at + 1400);
    const line = body.match(/console\.log\(`\[REVIEW\][^`]*`\)/);
    assert.ok(line, "the review sign-in is not recorded at all");
    assert.match(line[0], /maskPhone\(/, "the raw phone number is logged");
    assert.doesNotMatch(line[0], /\$\{code\}|REVIEW_LOGIN_CODE/, "the code is logged");
  });

  test("maskPhone actually masks", () => {
    const m = ROUTES.match(/function maskPhone\(raw: string\): string \{[\s\S]*?\n  \}/);
    assert.ok(m, "maskPhone disappeared");
    // Transpiled, not regex-stripped: the source carries TypeScript annotations
    // that `new Function` cannot parse.
    const js = ts.transpileModule(`${m[0]}\nreturn maskPhone;`, {
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None },
    }).outputText;
    const fn = new Function("toLocalPhone", js)(
      (r) => String(r ?? "").replace(/\D/g, ""),
    );
    assert.equal(fn(CUSTOMER), "077****104");
    assert.equal(fn("07701234567"), "077****567");
    assert.equal(fn("garbage"), "0*********");
    // The middle four digits must be gone, whatever the number.
    assert.doesNotMatch(fn(CUSTOMER), /1111104$/);
  });

  test("no review phone number or code appears anywhere in the client bundle source", () => {
    // The reviewer's credentials go in the store's review notes, never in the app.
    const files = [
      "client/screens/OtpVerificationScreen.tsx",
      "client/screens/PhoneLoginScreen.tsx",
    ];
    for (const f of files) {
      let src;
      try { src = readFileSync(join(root, f), "utf8"); } catch { continue; }
      for (const p of [CUSTOMER, VENDOR, DRIVER, "REVIEW_LOGIN_CODE"]) {
        assert.ok(!src.includes(p), `${f} contains ${p}`);
      }
    }
  });
});
