/**
 * H-51 — the admin test helper must produce a session the server accepts.
 *
 * tests/utils/helpers.mjs built the admin cookie as an HMAC hex digest:
 *
 *   createHmac("sha256", `${user}:${pass}`).update("onway_admin").digest("hex")
 *
 * That was the format the server abandoned when admin sessions became
 * self-verifying JWTs. A 64-char hex string has no JWT structure, so
 * jwt.verify() threw and isValidSession() returned false for every request the
 * suite made — 28 adminApi() calls across tests/api/05-admin.test.mjs (22) and
 * tests/api/06-e2e.test.mjs (6), covering vendors, drivers, wallets, settlements
 * and notifications, all hitting 401 while the suite still read as coverage.
 *
 * Nothing here checks the helper's TEXT. Every assertion runs the helper's output
 * through the REAL server/adminAuth.ts — isValidSession, getSessionUsername and
 * invalidateSession — so the helper is proved equivalent to a session the server
 * itself issues, and the old format is proved to be rejected by that same code.
 *
 * Run:  node --test tests/unit/h51-admin-session-helper.test.mjs
 */
import { test, describe, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");

// The suite signs with these; set them before anything reads process.env.
process.env.JWT_SECRET ??= randomBytes(32).toString("hex");
process.env.ADMIN_USERNAME ??= "h51-admin";
process.env.ADMIN_PASSWORD ??= "h51-password";

let adminAuth, helpers;
before(async () => {
  adminAuth = await import(join(root, "server/adminAuth.ts"));
  helpers = await import(join(root, "tests/utils/helpers.mjs"));
});

/** Minimal Express-shaped request carrying a cookie header. */
const reqWithCookie = (cookie) => ({ headers: { cookie } });

/** The helper as it was before this fix, reproduced verbatim from the finding. */
function legacyHmacCookie() {
  const secret = `${process.env.ADMIN_USERNAME}:${process.env.ADMIN_PASSWORD}`;
  const token = createHmac("sha256", secret).update("onway_admin").digest("hex");
  return `onway_admin_session=${token}`;
}

// ─────────────────────────────────────────────────────────────────────────────
describe("H-51 · the abandoned HMAC format is rejected by the real server code", () => {
  test("the legacy cookie fails isValidSession()", () => {
    const cookie = legacyHmacCookie();
    assert.match(cookie, /^onway_admin_session=[0-9a-f]{64}$/,
      "the reproduction of the old helper drifted from the finding");
    assert.equal(adminAuth.isValidSession(reqWithCookie(cookie)), false,
      "the old format would have to be accepted for the old suite to have tested anything");
  });

  test("the legacy cookie yields no username, so audit attribution was empty too", () => {
    assert.equal(adminAuth.getSessionUsername(reqWithCookie(legacyHmacCookie())), "");
  });

  test("it fails because it is not a JWT at all, not because of a wrong secret", () => {
    const raw = legacyHmacCookie().split("=")[1];
    assert.equal(raw.split(".").length, 1,
      "a JWT has three dot-separated parts; the old token had one");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("H-51 · the new helper produces a session the server accepts", () => {
  test("makeAdminCookie() passes isValidSession()", () => {
    assert.equal(adminAuth.isValidSession(reqWithCookie(helpers.makeAdminCookie())), true);
  });

  test("it uses the cookie name the server reads", () => {
    assert.match(helpers.makeAdminCookie(), /^onway_admin_session=/);
    assert.equal(adminAuth.ADMIN_COOKIE, "onway_admin_session");
  });

  test("getSessionUsername() recovers the admin identity", () => {
    assert.equal(
      adminAuth.getSessionUsername(reqWithCookie(helpers.makeAdminCookie())),
      process.env.ADMIN_USERNAME,
      "financial audit records are attributed from this claim (H-07)");
  });

  test("the token is also accepted through the Authorization header path", () => {
    const token = helpers.makeAdminSessionToken();
    const req = { headers: { authorization: `Bearer ${token}` } };
    assert.equal(adminAuth.isValidSession(req), true);
  });

  test("every call mints a distinct session (unique jti), like createSession()", () => {
    const jtis = new Set();
    for (let i = 0; i < 50; i++) {
      const [, payload] = helpers.makeAdminSessionToken().split(".");
      jtis.add(JSON.parse(Buffer.from(payload, "base64url")).jti);
    }
    assert.equal(jtis.size, 50, "a shared jti would let one revocation kill every test session");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("H-51 · the helper's token is equivalent to one the server issues", () => {
  const claimsOf = (token) =>
    JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
  const headerOf = (token) =>
    JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString());

  test("same claim set as createSession()", () => {
    const real = adminAuth.createSession(process.env.ADMIN_USERNAME);
    const mine = helpers.makeAdminSessionToken();
    assert.deepEqual(
      Object.keys(claimsOf(mine)).sort(),
      Object.keys(claimsOf(real)).sort(),
      "the helper's payload shape drifted from server/adminAuth.ts");
    assert.equal(claimsOf(mine).type, claimsOf(real).type);
    assert.equal(claimsOf(mine).username, claimsOf(real).username);
  });

  test("same algorithm — JWT_VERIFY_OPTS pins HS256", () => {
    const real = adminAuth.createSession(process.env.ADMIN_USERNAME);
    assert.equal(headerOf(helpers.makeAdminSessionToken()).alg, headerOf(real).alg);
    assert.equal(headerOf(helpers.makeAdminSessionToken()).alg, "HS256");
  });

  test("same 7-day lifetime", () => {
    const real = claimsOf(adminAuth.createSession(process.env.ADMIN_USERNAME));
    const mine = claimsOf(helpers.makeAdminSessionToken());
    assert.equal(mine.exp - mine.iat, real.exp - real.iat);
    assert.equal(mine.exp - mine.iat, 7 * 24 * 60 * 60);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("H-51 · it behaves like a real session, not a lookalike", () => {
  test("invalidateSession() revokes it", () => {
    const token = helpers.makeAdminSessionToken();
    const req = { headers: { authorization: `Bearer ${token}` } };
    assert.equal(adminAuth.isValidSession(req), true, "precondition");
    adminAuth.invalidateSession(token);
    assert.equal(adminAuth.isValidSession(req), false,
      "a token the revocation machinery cannot reach is not a real session");
  });

  test("revoking one session does not revoke another", () => {
    const a = helpers.makeAdminSessionToken();
    const b = helpers.makeAdminSessionToken();
    adminAuth.invalidateSession(a);
    assert.equal(adminAuth.isValidSession({ headers: { authorization: `Bearer ${a}` } }), false);
    assert.equal(adminAuth.isValidSession({ headers: { authorization: `Bearer ${b}` } }), true);
  });

  test("invalidateAllSessions() kills tokens issued before it", async () => {
    const before = helpers.makeAdminSessionToken();
    // `iat` has one-second resolution while revokedBefore is in milliseconds, so
    // wait past the boundary rather than racing it.
    await new Promise((r) => setTimeout(r, 1100));
    adminAuth.invalidateAllSessions();
    assert.equal(adminAuth.isValidSession({ headers: { authorization: `Bearer ${before}` } }), false,
      "a password reset must kill sessions minted by this helper too");
  });

  test("a session minted after that reset is valid again", async () => {
    // Same resolution mismatch, the other way round: adminAuth compares
    // `iat * 1000 < revokedBefore`, and iat is floored to the second, so a token
    // minted inside the same second as the reset is ALSO rejected. That is the
    // server's own behaviour (it fails closed, which is the safe direction) and
    // is deliberately left alone here — H-51 is about the test helper, not about
    // adminAuth.ts. Crossing the boundary is what a real login would do anyway.
    adminAuth.invalidateAllSessions();
    await new Promise((r) => setTimeout(r, 1100));
    const after = helpers.makeAdminSessionToken();
    assert.equal(adminAuth.isValidSession({ headers: { authorization: `Bearer ${after}` } }), true,
      "the helper must be able to mint a fresh, valid session after a reset");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("H-51 · the helper cannot mint something the server would not", () => {
  test("a token signed with the wrong secret is rejected", () => {
    const real = process.env.JWT_SECRET;
    process.env.JWT_SECRET = randomBytes(32).toString("hex");
    let forged;
    try { forged = helpers.makeAdminSessionToken(); }
    finally { process.env.JWT_SECRET = real; }
    assert.equal(adminAuth.isValidSession({ headers: { authorization: `Bearer ${forged}` } }), false);
  });

  test('a token whose type is not "admin" is rejected', () => {
    const token = helpers.makeAdminSessionToken({ type: "vendor" });
    assert.equal(adminAuth.isValidSession({ headers: { authorization: `Bearer ${token}` } }), false);
  });

  test("an expired token is rejected", () => {
    const token = helpers.makeAdminSessionToken({ expiresIn: -60 });
    assert.equal(adminAuth.isValidSession({ headers: { authorization: `Bearer ${token}` } }), false);
  });

  test("no cookie at all is rejected", () => {
    assert.equal(adminAuth.isValidSession({ headers: {} }), false);
  });

  test("the helper refuses to run without JWT_SECRET rather than minting a dud", () => {
    const real = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    try {
      assert.throws(() => helpers.makeAdminSessionToken(), /JWT_SECRET/);
    } finally { process.env.JWT_SECRET = real; }
  });

  test("the helper refuses to run without ADMIN_USERNAME", () => {
    const real = process.env.ADMIN_USERNAME;
    delete process.env.ADMIN_USERNAME;
    try {
      assert.throws(() => helpers.makeAdminSessionToken(), /ADMIN_USERNAME/);
    } finally { process.env.ADMIN_USERNAME = real; }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("H-51 · the old format is gone from the helper", () => {
  const SRC = readFileSync(join(root, "tests/utils/helpers.mjs"), "utf8");

  test("no HMAC digest is used to build the admin cookie", () => {
    const active = SRC.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(active, /createHmac\([^)]*\)[\s\S]{0,120}onway_admin/,
      "the abandoned HMAC session format is back in the helper");
  });

  test("adminApi() still routes through makeAdminCookie(), so the fix reaches every caller", () => {
    assert.match(SRC, /Cookie:\s*makeAdminCookie\(\)/);
  });

  test("production admin auth was not touched", () => {
    const auth = readFileSync(join(root, "server/adminAuth.ts"), "utf8");
    assert.match(auth, /export function createSession\(username: string\): string;/);
    assert.match(auth, /adminId:.*username,.*displayName:.*role: "super_admin"/s);
    assert.match(auth, /jwt\.sign\(claims/);
    assert.doesNotMatch(auth, /createHmac/,
      "the server was changed to match the test instead of the other way round");
  });
});
