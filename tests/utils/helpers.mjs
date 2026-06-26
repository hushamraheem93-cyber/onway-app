import { createHmac } from "node:crypto";
import { createSigner } from "./jwt.mjs";

export const BASE_URL = "http://localhost:5000";
export const TEST_PREFIX = "TEST_ONWAY_";
export const TEST_PHONE_BASE = "07799999";

let _testSeq = 0;
export function testPhone() {
  _testSeq++;
  return `${TEST_PHONE_BASE}${String(_testSeq).padStart(3, "0")}`;
}

export function makeAdminCookie() {
  const user = process.env.ADMIN_USERNAME;
  const pass = process.env.ADMIN_PASSWORD;
  if (!user || !pass) throw new Error("ADMIN_USERNAME / ADMIN_PASSWORD not set");
  const secret = `${user}:${pass}`;
  const token = createHmac("sha256", secret).update("onway_admin").digest("hex");
  return `onway_admin_session=${token}`;
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
