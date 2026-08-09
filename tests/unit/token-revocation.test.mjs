/**
 * Token revocation tests (audit findings H-10 and H-11).
 *
 * H-10 — customer tokens live 30 days and had NO revocation mechanism of any kind.
 *   Admin sessions already had one (persisted, hydrated at boot, checked on every
 *   request); customers did not. Deleting the account did not invalidate its token,
 *   so a stolen phone meant a month of access to addresses, order history and
 *   support chat with nothing support could do.
 *
 * H-11 — clearAdminToken() was defined in client/lib/adminAuth.ts and had no caller
 *   anywhere. logout() cleared the vendor, customer, driver and guest credentials
 *   but not the admin one, so on a shared phone the supervisor signed out and handed
 *   the device over with a live admin token that the fetch interceptor kept attaching.
 *
 * Run:  node --test tests/unit/token-revocation.test.mjs
 */
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  revokeCustomerTokens,
  isCustomerTokenRevoked,
  __resetCustomerRevocationForTests,
} from "../../server/customerRevocation.ts";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, "../../", p), "utf8");
const ROUTES = read("server/routes.ts");
const VENDOR = read("server/vendor.ts");
const INDEX = read("server/index.ts");
const REVOCATION = read("server/customerRevocation.ts");
const AUTH_CTX = read("client/context/AuthContext.tsx");
const CLIENT_ADMIN = read("client/lib/adminAuth.ts");

const nowSecs = () => Math.floor(Date.now() / 1000);

describe("H-10 — a customer's tokens can be revoked", () => {
  beforeEach(() => __resetCustomerRevocationForTests());

  test("an untouched phone is never revoked", () => {
    assert.equal(isCustomerTokenRevoked("07701234567", nowSecs()), false);
  });

  test("a token issued before the revocation is refused", () => {
    const issuedAt = nowSecs() - 60;
    revokeCustomerTokens("07701234567");
    assert.equal(isCustomerTokenRevoked("07701234567", issuedAt), true);
  });

  test("a token issued AFTER the revocation still works — re-registering is not punished", () => {
    revokeCustomerTokens("07701234567");
    const reIssued = nowSecs() + 5;
    assert.equal(isCustomerTokenRevoked("07701234567", reIssued), false);
  });

  test("revoking one phone does not touch anyone else", () => {
    const issuedAt = nowSecs() - 60;
    revokeCustomerTokens("07701234567");
    assert.equal(isCustomerTokenRevoked("07709999999", issuedAt), false);
  });

  test("a token with no iat fails closed", () => {
    revokeCustomerTokens("07701234567");
    for (const iat of [undefined, null, "abc", NaN, Infinity]) {
      assert.equal(isCustomerTokenRevoked("07701234567", iat), true, `iat ${JSON.stringify(iat)}`);
    }
  });

  test("a missing or blank phone is not treated as a revoked identity", () => {
    revokeCustomerTokens("");
    revokeCustomerTokens(null);
    assert.equal(isCustomerTokenRevoked("", nowSecs()), false);
  });

  test("phones are matched after trimming, so stray whitespace cannot dodge it", () => {
    const issuedAt = nowSecs() - 60;
    revokeCustomerTokens("  07701234567 ");
    assert.equal(isCustomerTokenRevoked("07701234567", issuedAt), true);
  });
});

describe("H-10 — every customer verifier consults it", () => {
  test("the main middleware checks before granting identity", () => {
    assert.match(
      ROUTES,
      /if \(isCustomerTokenRevoked\(String\(decoded\.phoneNumber\), decoded\.iat\)\) throw new Error\("revoked"\);\s*\n\s*\(req as any\)\.customerPhone = decoded\.phoneNumber as string;/,
      "REGRESSION: requireCustomerAuth grants access without checking revocation",
    );
  });

  test("no customer token is accepted anywhere without the check", () => {
    // Every site that reads role === "customer" out of a verified token.
    const sites = [...ROUTES.matchAll(/decoded\.role [!=]== "customer"/g)].length
      + [...VENDOR.matchAll(/decoded\.role === "customer"/g)].length;
    const checks = [...ROUTES.matchAll(/isCustomerTokenRevoked\(/g)].length
      + [...VENDOR.matchAll(/isCustomerTokenRevoked\(/g)].length;
    assert.ok(
      checks >= sites,
      `REGRESSION: ${sites} customer-token sites but only ${checks} revocation checks`,
    );
  });

  test("the vendor router checks too", () => {
    assert.match(VENDOR, /isCustomerTokenRevoked\(String\(decoded\.phoneNumber\), decoded\.iat\)/);
  });

  test("deleting an account revokes its tokens", () => {
    assert.match(
      ROUTES,
      /revokeCustomerTokens\(phoneNumber\);\s*\n\s*\n\s*return res\.json\(\{ success: true \}\);/,
      "REGRESSION: a deleted account keeps a working token for up to 30 days",
    );
  });

  test("the state is hydrated at boot, before the server listens", () => {
    assert.match(INDEX, /await loadCustomerRevocationState\(\);/);
    const load = INDEX.indexOf("await loadCustomerRevocationState();");
    const listen = INDEX.search(/\.listen\(/);
    assert.ok(load > -1 && (listen === -1 || load < listen), "hydration must precede listening");
  });
});

describe("H-10 — the design keeps the hot path free", () => {
  test("the check is synchronous — no Firestore read per request", () => {
    assert.match(REVOCATION, /export function isCustomerTokenRevoked\(/);
    assert.doesNotMatch(
      REVOCATION.slice(REVOCATION.indexOf("export function isCustomerTokenRevoked")),
      /await |getFirestore\(\)/,
      "REGRESSION: the per-request check started hitting the database",
    );
  });

  test("revocation outlives the user document it belongs to", () => {
    // Keyed on the phone number, not on a field of users/{id} — the deleted-account
    // case is exactly the one that has to keep working.
    assert.match(REVOCATION, /const REVOCATION_DOC = "customerRevocation";/);
    assert.doesNotMatch(REVOCATION, /collection\("users"\)/);
  });

  test("entries older than the longest token life are pruned", () => {
    assert.match(REVOCATION, /const CUSTOMER_TOKEN_TTL_MS = 30 \* 24 \* 60 \* 60 \* 1000;/);
    assert.match(REVOCATION, /if \(Number\(at\) > cutoff\)/);
  });

  test("a boot-time load failure does not take the server down", () => {
    assert.match(REVOCATION, /catch \(err: any\) \{[\s\S]{0,300}Could not load customer revocation state/);
  });

  test("in-memory first, then persisted — the next request is covered immediately", () => {
    const fn = REVOCATION.slice(REVOCATION.indexOf("export function revokeCustomerTokens"));
    const set = fn.indexOf("revokedBefore.set(phone, Date.now())");
    const persist = fn.indexOf("persist()");
    assert.ok(set > -1 && persist > set, "persist must not precede the in-memory update");
  });
});

describe("H-11 — the admin token is cleared on logout", () => {
  test("clearAdminToken is imported into AuthContext", () => {
    assert.match(AUTH_CTX, /import \{ clearAdminToken, installAdminAuthInterceptor \} from "@\/lib\/adminAuth";/);
  });

  test("logout clears it alongside the other credentials", () => {
    const logout = AUTH_CTX.slice(AUTH_CTX.indexOf("const logout = async () => {"));
    const body = logout.slice(0, logout.indexOf("\n  };"));
    assert.match(body, /await clearAdminToken\(\);/, "REGRESSION: the admin token survives logout again");
    for (const other of ["VENDOR_TOKEN_KEY", "CUSTOMER_TOKEN_KEY", "clearDriverToken", "GUEST_MODE_KEY"]) {
      assert.match(body, new RegExp(other), `logout stopped clearing ${other}`);
    }
  });

  test("deleteAccount clears it too, via logout", () => {
    const del = AUTH_CTX.slice(AUTH_CTX.indexOf("const deleteAccount = async () => {"));
    const body = del.slice(0, del.indexOf("\n  };"));
    assert.match(body, /await logout\(\);/, "deleteAccount must end by logging out");
  });

  test("clearAdminToken is no longer dead code", () => {
    assert.match(CLIENT_ADMIN, /export async function clearAdminToken\(\)/);
    const callers = [...AUTH_CTX.matchAll(/clearAdminToken\(\)/g)].length;
    assert.ok(callers >= 1, "REGRESSION: clearAdminToken has no caller again");
  });

  test("the interceptor that made this matter is still scoped to admin URLs", () => {
    // It attaches the stored token to every /api/admin/* call, which is exactly why
    // a leftover token on a shared phone was usable.
    assert.match(CLIENT_ADMIN, /function isAdminApiUrl\(url: string\): boolean/);
    assert.match(CLIENT_ADMIN, /if \(resolved\.origin !== new URL\(base\)\.origin\) return false;/);
    assert.match(CLIENT_ADMIN, /if \(!resolved\.pathname\.startsWith\("\/api\/admin\/"\)\) return false;/);
  });
});
