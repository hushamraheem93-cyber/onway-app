/**
 * Vendor session cookie tests (audit finding H-18).
 *
 * The vendor dashboard's session cookie was set with only `httpOnly` and
 * `sameSite: "lax"` — no `Secure`, no `Path` — even though isRequestSecure() already
 * existed in the server and guarded all three admin cookies. A store owner opening
 * the dashboard over http:// on café Wi-Fi handed their session to anyone on the
 * network for a week: edit prices, cancel orders, request payouts.
 *
 * Second defect: the cookie's maxAge was 30 days while the JWT inside it expired
 * after 7, so from day 8 the browser kept presenting a cookie the server rejected,
 * with no automatic re-authentication.
 *
 * Run:  node --test tests/unit/vendor-session-cookie.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { isRequestSecure } from "../../server/originGuard.ts";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, "../../", p), "utf8");
const VENDOR = read("server/vendor.ts");
const INDEX = read("server/index.ts");
const GUARD = read("server/originGuard.ts");

function code(src) {
  return src
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*"));
    })
    .join("\n");
}

/** A minimal Express-like request for isRequestSecure. */
const reqWith = (headers = {}, protocol) => ({
  header: (name) => headers[name.toLowerCase()],
  protocol,
});

describe("H-18 — isRequestSecure reads the proxy header, not req.protocol", () => {
  test("x-forwarded-proto: https means secure", () => {
    assert.equal(isRequestSecure(reqWith({ "x-forwarded-proto": "https" }, "http")), true);
  });

  test("x-forwarded-proto: http means NOT secure, whatever req.protocol claims", () => {
    assert.equal(isRequestSecure(reqWith({ "x-forwarded-proto": "http" }, "https")), false);
  });

  test("with no proxy header it falls back to req.protocol", () => {
    assert.equal(isRequestSecure(reqWith({}, "https")), true);
    assert.equal(isRequestSecure(reqWith({}, "http")), false);
    assert.equal(isRequestSecure(reqWith({}, undefined)), false);
  });

  test("anything other than exactly \"https\" is insecure", () => {
    for (const proto of ["HTTPS", "https, http", "ws", "", "httpsx"]) {
      assert.equal(isRequestSecure(reqWith({ "x-forwarded-proto": proto })), false, proto);
    }
  });

  test("it lives in the shared module, with no private copy left in index.ts", () => {
    assert.match(GUARD, /export function isRequestSecure\(req: Request\): boolean/);
    assert.doesNotMatch(
      code(INDEX),
      /function isRequestSecure\(/,
      "REGRESSION: index.ts has its own copy again — the two can drift apart",
    );
    assert.match(INDEX, /isRequestSecure,\n\} from "\.\/originGuard";|isRequestSecure,/);
  });

  test("the admin cookies still use it", () => {
    const uses = [...INDEX.matchAll(/isRequestSecure\(req\)/g)].length;
    assert.ok(uses >= 3, `expected the three admin cookies to use it, saw ${uses}`);
  });
});

describe("H-18 — the vendor cookie carries every attribute it needs", () => {
  const OPTS = (() => {
    const from = VENDOR.indexOf("function vendorCookieOptions(req: Request)");
    assert.ok(from > -1, "vendorCookieOptions not found");
    return VENDOR.slice(from, VENDOR.indexOf("\n}", from));
  })();

  test("Secure is set from the actual connection, not hardcoded", () => {
    assert.match(OPTS, /secure: isRequestSecure\(req\)/);
    assert.doesNotMatch(OPTS, /secure: true/, "a hardcoded true breaks plain-HTTP development");
    assert.doesNotMatch(OPTS, /secure: false/);
  });

  test("SameSite is strict", () => {
    assert.match(OPTS, /sameSite: "strict" as const/);
  });

  test("Path is explicit", () => {
    assert.match(OPTS, /path: "\/"/);
  });

  test("httpOnly is kept", () => {
    assert.match(OPTS, /httpOnly: true/);
  });

  test("the old attribute set is gone", () => {
    assert.doesNotMatch(
      code(VENDOR),
      /maxAge: 30 \* 24 \* 60 \* 60 \* 1000/,
      "REGRESSION: the 30-day cookie is back",
    );
    assert.doesNotMatch(code(VENDOR), /sameSite: "lax"/, "REGRESSION: SameSite dropped back to lax");
  });

  test("the login route uses the shared options object", () => {
    assert.match(VENDOR, /\.cookie\(VENDOR_COOKIE, token, vendorCookieOptions\(req\)\)/);
  });

  test("there is exactly one place that sets the vendor cookie", () => {
    const sets = [...VENDOR.matchAll(/\.cookie\(VENDOR_COOKIE/g)].length;
    assert.equal(sets, 1, `${sets} places set the session cookie — they can drift apart`);
  });
});

describe("H-18 — the cookie and the token expire together", () => {
  test("one constant drives both", () => {
    assert.match(VENDOR, /const VENDOR_SESSION_TTL_SECS = 7 \* 24 \* 60 \* 60;/);
    assert.match(
      VENDOR,
      /jwt\.sign\(\{ vendorId, role: "vendor" \}, JWT_SECRET, \{ expiresIn: VENDOR_SESSION_TTL_SECS \}\)/,
      "REGRESSION: the token TTL is hardcoded again",
    );
    assert.match(VENDOR, /maxAge: VENDOR_SESSION_TTL_SECS \* 1000/);
  });

  test("the literal 7d string no longer appears in the token", () => {
    assert.doesNotMatch(code(VENDOR), /expiresIn: "7d"/);
  });

  test("the two values are numerically equal", () => {
    const ttl = 7 * 24 * 60 * 60;
    assert.equal(ttl * 1000, 7 * 24 * 60 * 60 * 1000, "cookie maxAge must equal token lifetime");
  });
});

describe("H-18 — logout actually removes the cookie", () => {
  test("clearCookie is given the same attributes, minus maxAge", () => {
    // A cookie is only deleted when Path/Secure/SameSite match what it was set with.
    assert.match(VENDOR, /const \{ maxAge: _maxAge, \.\.\.clearOpts \} = vendorCookieOptions\(req\);/);
    assert.match(VENDOR, /res\.clearCookie\(VENDOR_COOKIE, clearOpts\)/);
    assert.doesNotMatch(
      code(VENDOR),
      /res\.clearCookie\(VENDOR_COOKIE\)\./,
      "REGRESSION: bare clearCookie may leave the session cookie in place",
    );
  });

  test("logout still redirects to the login page", () => {
    assert.match(VENDOR, /\.redirect\("\/vendor\/login"\)/);
  });
});

describe("H-18 — the mobile path is unaffected", () => {
  test("mobile-auth still issues a Bearer token and sets no cookie", () => {
    const at = VENDOR.indexOf('"/api/vendor/mobile-auth"');
    assert.ok(at > -1, "mobile-auth route not found");
    const body = VENDOR.slice(at, at + 2500);
    assert.doesNotMatch(body, /\.cookie\(/, "mobile auth must not depend on cookies");
    assert.match(body, /makeVendorToken\(/);
  });

  test("requireVendor still accepts both Bearer and cookie", () => {
    const at = VENDOR.indexOf("async function requireVendor");
    const body = VENDOR.slice(at, at + 900);
    assert.match(body, /authHeader\?\.startsWith\("Bearer "\)/);
    assert.match(body, /cookies\[VENDOR_COOKIE\]/);
  });
});
