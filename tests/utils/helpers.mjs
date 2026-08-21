import { randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { createSigner } from "./jwt.mjs";

export const BASE_URL = "http://localhost:5000";
export const TEST_PREFIX = "TEST_ONWAY_";
export const TEST_PHONE_BASE = "07799999";

let _testSeq = 0;
export function testPhone() {
  _testSeq++;
  return `${TEST_PHONE_BASE}${String(_testSeq).padStart(3, "0")}`;
}

// ── Admin session (H-51) ─────────────────────────────────────────────────────
//
// This helper used to build the cookie as
//   createHmac("sha256", `${user}:${pass}`).update("onway_admin").digest("hex")
// which was the session format the server abandoned when admin sessions became
// self-verifying JWTs (server/adminAuth.ts). A hex digest is not a JWT, so
// jwt.verify() threw on every request and isValidSession() returned false — every
// adminApi() call in the suite hit 401. The highest-privilege surface in the
// system therefore had no working test coverage at all, while the suite still
// looked like it was exercising it.
//
// The values below mirror server/adminAuth.ts exactly:
//   cookie name  ADMIN_COOKIE          = "onway_admin_session"
//   payload      { adminId, username, displayName, role, permissions, type: "admin", jti }
//   signature    HS256 over JWT_SECRET  (JWT_VERIFY_OPTS pins the algorithm)
//   lifetime     SESSION_TTL_SECS       = 7 days
//
// It is minted here rather than fetched from POST /admin/login so the helper stays
// synchronous for its callers; tests/unit/h51-admin-session-helper.test.mjs proves
// the result is accepted by the REAL isValidSession() and is revocable like any
// session the server issues.
const ADMIN_COOKIE = "onway_admin_session";
const ADMIN_SESSION_TTL_SECS = 7 * 24 * 60 * 60;

/**
 * Mint an admin session token in the format the server actually verifies.
 * `overrides` is for negative tests (a wrong `type`, an expired token, …); the
 * default shape is exactly what createSession() produces.
 */
export function makeAdminSessionToken(overrides = {}) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    // No fallback, for the same reason server/adminAuth.ts has none: a default
    // here would quietly mint tokens the real server rejects, which is the
    // failure mode this whole change exists to remove.
    throw new Error("JWT_SECRET not set — admin sessions are signed with it");
  }
  const username = process.env.ADMIN_USERNAME;
  if (!username) {
    // Carried in the token because getSessionUsername() attributes financial
    // audit records to it (H-07).
    throw new Error("ADMIN_USERNAME not set — it is the session's identity claim");
  }
  const { expiresIn = ADMIN_SESSION_TTL_SECS, ...claims } = overrides;
  return jwt.sign(
    {
      adminId: `legacy_${username}`,
      username,
      displayName: username,
      role: "super_admin",
      permissions: ["*"],
      type: "admin",
      jti: randomBytes(16).toString("hex"),
      ...claims,
    },
    secret,
    { expiresIn },
  );
}

export function makeAdminCookie(overrides) {
  return `${ADMIN_COOKIE}=${makeAdminSessionToken(overrides)}`;
}

export function makeVendorToken(vendorId) {
  return createSigner(vendorId);
}

export async function api(method, path, body, headers = {}) {
  const url = `${BASE_URL}${path}`;
  const opts = {
    method,
    headers: { "Content-Type": "application/json", ...headers },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  let json = null;
  try {
    const text = await res.text();
    json = text ? JSON.parse(text) : null;
  } catch {}
  return { status: res.status, body: json };
}

export async function adminApi(method, path, body) {
  return api(method, path, body, { Cookie: makeAdminCookie() });
}

export async function vendorApi(method, path, body, token) {
  return api(method, path, body, { Authorization: `Bearer ${token}` });
}

export function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

export function assertStatus(res, expected, label = "") {
  if (res.status !== expected) {
    throw new Error(
      `${label} — Expected status ${expected}, got ${res.status}. Body: ${JSON.stringify(res.body)}`
    );
  }
}

export async function getVendorToken(phoneNumber) {
  const res = await api("POST", "/api/vendor/mobile-auth", { phoneNumber });
  if (res.status !== 200 || !res.body?.token) return null;
  return res.body.token;
}

export async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export const results = {
  tests: [],
  pass: 0,
  fail: 0,
  skip: 0,
  startTime: Date.now(),
};

export async function runTest(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    const ms = Date.now() - t0;
    results.tests.push({ name, status: "pass", ms });
    results.pass++;
    process.stdout.write(`  ✓ ${name} (${ms}ms)\n`);
  } catch (err) {
    const ms = Date.now() - t0;
    results.tests.push({ name, status: "fail", ms, error: err.message });
    results.fail++;
    process.stdout.write(`  ✗ ${name} (${ms}ms)\n    → ${err.message}\n`);
  }
}

export async function runSuite(name, tests) {
  console.log(`\n▶ ${name}`);
  const t0 = Date.now();
  for (const [label, fn] of tests) {
    await runTest(label, fn);
  }
  console.log(`  ⏱  Suite done in ${Date.now() - t0}ms`);
}
