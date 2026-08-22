import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const DRIVER_AUTH = readFileSync(join(root, "client/lib/driverAuth.ts"), "utf8");
const AUTH_CONTEXT = readFileSync(join(root, "client/context/AuthContext.tsx"), "utf8");
const AUTH_BOOTSTRAP = readFileSync(join(root, "client/lib/authBootstrap.ts"), "utf8");

function section(source, start, end) {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `missing section marker: ${start}`);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(to, -1, `missing section end marker: ${end}`);
  return source.slice(from, to);
}

const INTERCEPTOR = section(DRIVER_AUTH, "export function installDriverAuthInterceptor", "\n}");
const ISSUE = section(DRIVER_AUTH, "export async function issueDriverToken", "\nexport async function clearDriverToken");
const CLEAR = section(DRIVER_AUTH, "export async function clearDriverToken", "\n// Self-healing");

describe("C-11 — Driver interceptor and token lifecycle", () => {
  test("only same-origin /api/driver requests are eligible", () => {
    assert.match(DRIVER_AUTH, /resolved\.origin !== new URL\(base\)\.origin/);
    assert.match(DRIVER_AUTH, /resolved\.pathname\.startsWith\("\/api\/driver\/"\)/);
    assert.doesNotMatch(DRIVER_AUTH, /url\.includes\("\/admin\/"\)/);
    assert.doesNotMatch(DRIVER_AUTH, /origin.*includes|origin.*endsWith/);
  });

  test("driver token issuer is excluded from interceptor recursion", () => {
    assert.match(DRIVER_AUTH, /resolved\.pathname === MOBILE_AUTH_PATH/);
    assert.match(ISSUE, /new URL\(MOBILE_AUTH_PATH, getApiUrl\(\)\)/);
    assert.match(ISSUE, /Authorization: `Bearer \$\{customerToken\}`/);
  });

  test("third-party URLs containing the driver path cannot receive the token", () => {
    assert.match(DRIVER_AUTH, /resolved\.origin !== new URL\(base\)\.origin/);
    assert.match(DRIVER_AUTH, /new URL\(url, base\)/);
    assert.match(DRIVER_AUTH, /return false;/);
  });

  test("existing Authorization headers are never overwritten", () => {
    assert.match(INTERCEPTOR, /if \(!headers\.has\("Authorization"\)\)/);
    assert.match(INTERCEPTOR, /headers\.set\("Authorization", `Bearer \$\{token\}`\)/);
  });

  test("all driver API calls share the interceptor instead of hand-rolled credentials", () => {
    assert.match(DRIVER_AUTH, /every \/api\/driver\/\* request/);
    assert.match(INTERCEPTOR, /readToken\(DRIVER_TOKEN_KEY\)/);
    assert.match(INTERCEPTOR, /orig\(input, init\)/);
  });

  test("a driver 401 triggers one customer-backed reissue and one retry", () => {
    assert.match(INTERCEPTOR, /isDriverCall && res\.status === 401/);
    assert.match(INTERCEPTOR, /const fresh = await reissueDriverToken\(\)/);
    assert.match(INTERCEPTOR, /headers\.set\("Authorization", `Bearer \$\{fresh\}`\)/);
    assert.match(INTERCEPTOR, /return await orig\(input, \{ \.\.\.init, headers \}\)/);
    assert.match(DRIVER_AUTH, /reissueInFlight/);
    assert.match(DRIVER_AUTH, /getToken\(CUSTOMER_TOKEN_KEY\)/);
  });

  test("refresh failure falls through to the original 401 instead of looping", () => {
    assert.match(INTERCEPTOR, /return res;/);
    assert.doesNotMatch(INTERCEPTOR, /while\s*\(|for\s*\(/);
    assert.match(DRIVER_AUTH, /\.finally\(\(\) => \{[\s\S]*reissueInFlight = null/);
  });

  test("driver logout removes the driver token from the shared secure cache", () => {
    assert.match(CLEAR, /forgetToken\(DRIVER_TOKEN_KEY\)/);
    assert.match(AUTH_CONTEXT, /await clearDriverToken\(\)/);
    assert.match(AUTH_CONTEXT, /await removeToken\(CUSTOMER_TOKEN_KEY\)/);
  });

  test("interceptor installation is idempotent and centralized", () => {
    assert.match(DRIVER_AUTH, /if \(installed\) return;/);
    assert.match(AUTH_BOOTSTRAP, /if \(installed\) return;/);
    assert.match(AUTH_BOOTSTRAP, /installDriverAuthInterceptor\(\)/);
  });
});
