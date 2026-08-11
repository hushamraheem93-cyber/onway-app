/**
 * CORS allow-listing + admin CSRF tests (audit finding C-12).
 *
 * The old rule was `const allowed = !isProd || …`, so any NODE_ENV that was not
 * the exact string "production" reflected EVERY origin back together with
 * `Access-Control-Allow-Credentials: true`. A reflected origin is worse than `*`
 * here: browsers refuse to send credentials to `*` but will happily send the
 * admin's session cookie to a reflected attacker origin.
 *
 * These tests pin the decision logic (pure, in server/originGuard.ts) and guard
 * the middleware wiring in index.ts / routes.ts against regression.
 *
 * Run:  node --test tests/unit/cors-csrf.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments as sharedStripComments } from "./_source.mjs";

import {
  isOriginAllowed,
  isAdminCsrfAllowed,
  originMatchesEntry,
  isLocalOrigin,
  parseOriginList,
  selfOriginFromHeaders,
} from "../../server/originGuard.ts";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, "../../", p), "utf8");
/** Drop comments so prose *explaining* the old NODE_ENV bug cannot fail the check. */
const code = sharedStripComments;
const INDEX = read("server/index.ts");
const ROUTES = read("server/routes.ts");
const GUARD = read("server/originGuard.ts");

const SELF = "https://onwayiq.com";
const EVIL = "https://evil.example";

/** Production-shaped policy: one configured domain, no Replit, on a VPS. */
const prodPolicy = (over = {}) => ({
  allowedOrigins: ["onwayiq.com"],
  replitDomains: [],
  selfOrigin: SELF,
  ...over,
});

describe("C-12 — no origin is allowed just because of the environment", () => {
  test("an arbitrary origin is rejected with NO ALLOWED_ORIGINS configured", () => {
    // This is the exact old failure mode: unconfigured + non-production NODE_ENV.
    const policy = { allowedOrigins: [], replitDomains: [], selfOrigin: SELF };
    assert.equal(isOriginAllowed(EVIL, policy), false);
  });

  test("an arbitrary origin is rejected with ALLOWED_ORIGINS configured", () => {
    assert.equal(isOriginAllowed(EVIL, prodPolicy()), false);
  });

  test("the decision logic never reads NODE_ENV", () => {
    assert.doesNotMatch(
      code(GUARD),
      /NODE_ENV/,
      "REGRESSION: the origin decision must not depend on the environment name",
    );
  });

  test("setupCors no longer contains the `!isProd ||` bypass", () => {
    const fn = code(INDEX.slice(INDEX.indexOf("function setupCors"), INDEX.indexOf("function setupBodyParsing")));
    assert.doesNotMatch(fn, /!isProd\s*\|\|/, "REGRESSION: C-12 open-in-non-production bypass is back");
    assert.doesNotMatch(fn, /NODE_ENV/, "REGRESSION: CORS must not branch on NODE_ENV");
  });
});

describe("C-12 — wildcard is never combined with credentials", () => {
  test("no wildcard ACAO is ever emitted", () => {
    const fn = INDEX.slice(INDEX.indexOf("function setupCors"), INDEX.indexOf("function setupBodyParsing"));
    assert.doesNotMatch(
      fn,
      /Access-Control-Allow-Origin["'\s,]+\*/,
      "REGRESSION: `Access-Control-Allow-Origin: *` with credentials is forbidden",
    );
    // Credentials are enabled, so the origin MUST be the reflected, checked value.
    assert.match(fn, /Access-Control-Allow-Credentials["'\s,]+true/);
    assert.match(fn, /Access-Control-Allow-Origin["'\s,]+origin/);
  });

  test("responses vary on Origin so a proxy cannot cross-serve CORS headers", () => {
    const fn = INDEX.slice(INDEX.indexOf("function setupCors"), INDEX.indexOf("function setupBodyParsing"));
    assert.match(fn, /res\.header\("Vary", "Origin"\)/);
  });

  test("a disallowed origin is refused, not silently served", () => {
    const fn = INDEX.slice(INDEX.indexOf("function setupCors"), INDEX.indexOf("function setupBodyParsing"));
    assert.match(fn, /return res\.status\(403\)/);
  });

  test("preflight OPTIONS is answered only after the origin check", () => {
    const fn = INDEX.slice(INDEX.indexOf("function setupCors"), INDEX.indexOf("function setupBodyParsing"));
    const denyAt = fn.indexOf("return res.status(403)");
    const optionsAt = fn.indexOf('req.method === "OPTIONS"');
    assert.ok(denyAt > -1 && optionsAt > -1);
    assert.ok(
      denyAt < optionsAt,
      "REGRESSION: preflight must not short-circuit ahead of the origin check, or a denied origin gets a 200 preflight",
    );
  });
});

describe("C-12 — which origins ARE allowed", () => {
  test("the server's own origin (the web admin panel uses API_BASE='/api')", () => {
    assert.equal(isOriginAllowed(SELF, prodPolicy()), true);
  });

  test("same-origin works even when ALLOWED_ORIGINS is empty", () => {
    // Fail-closed must not lock the dashboard out of its own API.
    assert.equal(
      isOriginAllowed(SELF, { allowedOrigins: [], replitDomains: [], selfOrigin: SELF }),
      true,
    );
  });

  test("a configured bare domain matches both schemes and its subdomains", () => {
    const p = prodPolicy();
    assert.equal(isOriginAllowed("https://onwayiq.com", p), true);
    assert.equal(isOriginAllowed("http://onwayiq.com", p), true);
    assert.equal(isOriginAllowed("https://admin.onwayiq.com", p), true);
  });

  test("a scheme-qualified entry matches that exact origin only", () => {
    const p = prodPolicy({ allowedOrigins: ["https://panel.onwayiq.com"], selfOrigin: null });
    assert.equal(isOriginAllowed("https://panel.onwayiq.com", p), true);
    assert.equal(isOriginAllowed("http://panel.onwayiq.com", p), false, "scheme must match");
    assert.equal(isOriginAllowed("https://other.onwayiq.com", p), false);
  });

  test("a look-alike sibling domain is NOT a subdomain", () => {
    const p = prodPolicy({ selfOrigin: null });
    assert.equal(isOriginAllowed("https://evil-onwayiq.com", p), false);
    assert.equal(isOriginAllowed("https://onwayiq.com.evil.example", p), false);
    assert.equal(originMatchesEntry("https://xonwayiq.com", "onwayiq.com"), false);
  });

  test("Replit-assigned domains are allowed when present", () => {
    const p = { allowedOrigins: [], replitDomains: ["myapp.replit.dev"], selfOrigin: null };
    assert.equal(isOriginAllowed("https://myapp.replit.dev", p), true);
    assert.equal(isOriginAllowed("https://notmine.replit.dev", p), false);
  });

  test("loopback and private-LAN origins are allowed for development", () => {
    const p = { allowedOrigins: [], replitDomains: [], selfOrigin: null };
    for (const o of ["http://localhost:8081", "http://127.0.0.1:5000", "http://192.168.1.7:8081"]) {
      assert.equal(isOriginAllowed(o, p), true, `${o} should be allowed`);
    }
    assert.equal(isLocalOrigin("https://evil.example"), false);
  });

  test("local origins can be switched off without touching NODE_ENV", () => {
    const p = { allowedOrigins: [], replitDomains: [], selfOrigin: null, allowLocal: false };
    assert.equal(isOriginAllowed("http://localhost:8081", p), false);
  });

  test("garbage and non-http origins are rejected", () => {
    const p = prodPolicy();
    for (const o of ["", "null", "file://", "javascript:alert(1)", "notaurl"]) {
      assert.equal(isOriginAllowed(o, p), false, `${o} must not be allowed`);
    }
  });

  test("ALLOWED_ORIGINS parsing tolerates spacing and empties", () => {
    assert.deepEqual(parseOriginList(" a.com , b.com ,, "), ["a.com", "b.com"]);
    assert.deepEqual(parseOriginList(undefined), []);
  });

  test("self origin is derived from the proxy's forwarded protocol", () => {
    assert.equal(selfOriginFromHeaders("onwayiq.com", "https", "http"), "https://onwayiq.com");
    assert.equal(selfOriginFromHeaders("onwayiq.com", "https,http"), "https://onwayiq.com");
    assert.equal(selfOriginFromHeaders("localhost:5000", undefined, "http"), "http://localhost:5000");
    assert.equal(selfOriginFromHeaders(undefined, "https"), null);
  });
});

describe("C-12 — admin CSRF (cookie-authenticated state changes)", () => {
  const base = { hasSessionCookie: true, selfOrigin: SELF, allowedOrigins: ["onwayiq.com"] };

  test("a cookie-authenticated write from an attacker origin is BLOCKED", () => {
    assert.equal(isAdminCsrfAllowed({ ...base, method: "POST", origin: EVIL }), false);
    assert.equal(isAdminCsrfAllowed({ ...base, method: "DELETE", origin: EVIL }), false);
    assert.equal(isAdminCsrfAllowed({ ...base, method: "PUT", origin: EVIL }), false);
    assert.equal(isAdminCsrfAllowed({ ...base, method: "PATCH", origin: EVIL }), false);
  });

  test("the archive/wipe endpoint's method is covered", () => {
    // DELETE /api/admin/archive-old-orders is the highest-impact admin route.
    assert.equal(isAdminCsrfAllowed({ ...base, method: "DELETE", origin: EVIL }), false);
  });

  test("the panel's own same-origin write is allowed", () => {
    assert.equal(isAdminCsrfAllowed({ ...base, method: "POST", origin: SELF }), true);
  });

  test("an explicitly allow-listed origin may still use cookies", () => {
    assert.equal(
      isAdminCsrfAllowed({ ...base, method: "POST", origin: "https://admin.onwayiq.com" }),
      true,
    );
  });

  test("safe methods are never blocked", () => {
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
      assert.equal(isAdminCsrfAllowed({ ...base, method, origin: EVIL }), true);
    }
  });

  test("a Bearer-only request needs no CSRF check (React Native admin app)", () => {
    // No ambient cookie → the credential cannot be attached by a foreign page.
    assert.equal(
      isAdminCsrfAllowed({ ...base, hasSessionCookie: false, method: "POST", origin: EVIL }),
      true,
    );
  });

  test("a non-browser client sending neither Origin nor Referer is allowed", () => {
    // Browsers ALWAYS send Origin on cross-site state changes, so its absence
    // means the request cannot have been forged by a page. This is what keeps the
    // React Native admin app working when it holds a cookie in its native jar.
    assert.equal(isAdminCsrfAllowed({ ...base, method: "POST" }), true);
  });

  test("Referer is used as a fallback when Origin is absent", () => {
    assert.equal(
      isAdminCsrfAllowed({ ...base, method: "POST", referer: `${SELF}/admin` }),
      true,
    );
    assert.equal(
      isAdminCsrfAllowed({ ...base, method: "POST", referer: `${EVIL}/attack.html` }),
      false,
    );
  });

  test("a malformed Referer on a cookie write is not trusted", () => {
    assert.equal(isAdminCsrfAllowed({ ...base, method: "POST", referer: "not a url" }), false);
  });

  test("Origin wins over Referer when both are present", () => {
    assert.equal(
      isAdminCsrfAllowed({ ...base, method: "POST", origin: EVIL, referer: `${SELF}/admin` }),
      false,
    );
  });
});

describe("H-79 — the guard is mounted early enough to cover EVERY admin route", () => {
  // Express matches middleware in registration order. The guard used to be mounted
  // inside registerRoutes(), which runs AFTER configureExpoAndLanding() and
  // vendorRouter — leaving nine admin write routes reachable without ever running
  // it. It now lives in index.ts, ahead of both.
  const mountAt = INDEX.indexOf('app.use("/api/admin", requireAdminCsrf)');
  const expoAt = INDEX.indexOf("configureExpoAndLanding(app)");
  const vendorAt = INDEX.indexOf("app.use(vendorRouter)");
  const routesAt = INDEX.indexOf("registerRoutes(app)");

  test("the CSRF guard is mounted in index.ts", () => {
    assert.ok(mountAt > -1, "REGRESSION: admin CSRF guard is not mounted in index.ts");
  });

  test("it is mounted BEFORE configureExpoAndLanding (covers change-credentials)", () => {
    assert.ok(expoAt > -1);
    assert.ok(mountAt < expoAt, "REGRESSION: index.ts admin routes would bypass the guard");
  });

  test("it is mounted BEFORE vendorRouter (covers the eight vendor admin writes)", () => {
    assert.ok(vendorAt > -1);
    assert.ok(mountAt < vendorAt, "REGRESSION: vendor.ts admin routes would bypass the guard");
  });

  test("it is mounted BEFORE registerRoutes (covers routes.ts admin routes)", () => {
    assert.ok(routesAt > -1);
    assert.ok(mountAt < routesAt);
  });

  test("it is NOT mounted a second time inside registerRoutes", () => {
    assert.doesNotMatch(
      ROUTES,
      /app\.use\("\/api\/admin",\s*requireAdminCsrf\)/,
      "REGRESSION: duplicate CSRF middleware",
    );
  });

  test("the auth guard still runs for /api/admin", () => {
    assert.match(ROUTES, /app\.use\("\/api\/admin",\s*requireAdminAuth\)/);
  });

  test("the guard keys off the SESSION COOKIE, not any credential", () => {
    assert.match(
      GUARD,
      /hasSessionCookie:\s*!!readCookie\(req, ADMIN_SESSION_COOKIE\)/,
      "the check must apply only to the ambient (forgeable) credential",
    );
  });

  test("the cookie name matches adminAuth's ADMIN_COOKIE (no drift)", () => {
    const admin = read("server/adminAuth.ts");
    const declared = /export const ADMIN_COOKIE = "([^"]+)"/.exec(admin)?.[1];
    const mirrored = /export const ADMIN_SESSION_COOKIE = "([^"]+)"/.exec(GUARD)?.[1];
    assert.ok(declared && mirrored);
    assert.equal(mirrored, declared, "the duplicated cookie name drifted");
  });

  test("a blocked request is refused with 403 and logged", () => {
    assert.match(GUARD, /res\.status\(403\)/);
    assert.match(GUARD, /\[CSRF\]/);
  });

  test("the login path is exempt so an admin can never be locked out", () => {
    assert.match(GUARD, /CSRF_EXEMPT_ADMIN_PATHS\s*=\s*\["\/api\/admin\/login"\]/);
    assert.match(GUARD, /if \(isCsrfExempt\(req\)\) return next\(\)/);
  });

  test("google-signin is outside /api/admin so the mount cannot reach it", () => {
    assert.match(INDEX, /app\.post\("\/admin\/google-signin"/);
    assert.doesNotMatch(INDEX, /app\.post\("\/api\/admin\/google-signin"/);
  });
});

describe("H-79 — the nine routes that used to bypass the guard", () => {
  // Eight in vendor.ts + change-credentials in index.ts. Verified live: before the
  // fix each returned 401 (reached auth); the guard never ran.
  const NINE = [
    ["PUT", "/api/admin/vendor-partners/v1/status"],
    ["PATCH", "/api/admin/vendor-products/p1/toggle-active"],
    ["POST", "/api/admin/vendor-products"],
    ["PUT", "/api/admin/vendor-products/p1"],
    ["POST", "/api/admin/vendor-products/p1/approve"],
    ["POST", "/api/admin/vendor-products/p1/reject"],
    ["POST", "/api/admin/vendors/v1/products"],
    ["DELETE", "/api/admin/vendor-products/p1/image"],
    ["POST", "/api/admin/change-credentials"],
  ];
  const base = { hasSessionCookie: true, selfOrigin: SELF, allowedOrigins: ["onwayiq.com"] };

  for (const [method, path] of NINE) {
    test(`${method} ${path} — cookie + attacker Origin is blocked`, () => {
      assert.equal(isAdminCsrfAllowed({ ...base, method, origin: EVIL }), false);
    });

    test(`${method} ${path} — cookie + attacker Referer is blocked`, () => {
      assert.equal(
        isAdminCsrfAllowed({ ...base, method, referer: `${EVIL}/attack.html` }),
        false,
      );
    });

    test(`${method} ${path} — cookie + same-origin reaches authentication`, () => {
      assert.equal(isAdminCsrfAllowed({ ...base, method, origin: SELF }), true);
    });

    test(`${method} ${path} — Bearer / React Native (no Origin) still works`, () => {
      assert.equal(isAdminCsrfAllowed({ ...base, hasSessionCookie: false, method, origin: EVIL }), true);
      assert.equal(isAdminCsrfAllowed({ ...base, method }), true);
    });
  }

  test("the allow-listed Hostinger panel keeps working on all nine", () => {
    for (const [method] of NINE) {
      assert.equal(
        isAdminCsrfAllowed({ ...base, method, origin: "https://admin.onwayiq.com" }),
        true,
        `${method} must pass for an allow-listed origin`,
      );
    }
  });

  test("GET admin routes are untouched even from an attacker origin", () => {
    for (const p of ["/api/admin/vendor-partners", "/api/admin/vendor-products", "/api/admin/vendor-stats"]) {
      assert.equal(isAdminCsrfAllowed({ ...base, method: "GET", origin: EVIL }), true, p);
    }
  });
});
