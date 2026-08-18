/**
 * H-79 — "the global admin guard protects routes.ts only: any new admin route in
 * index.ts or vendor.ts is exposed by default."
 *
 * `app.use("/api/admin", requireAdminAuth)` lived at routes.ts:621, inside
 * registerRoutes(). Express matches middleware in REGISTRATION order, and
 * index.ts does this:
 *
 *     app.use("/api/admin", requireAdminCsrf);   // csrf only
 *     configureExpoAndLanding(app);              //  5 × /api/admin/* routes
 *     app.use(vendorRouter);                     // 11 × /api/admin/* routes
 *     await registerRoutes(app);                 // ← the auth guard mounts HERE
 *
 * so sixteen admin routes were registered before the guard existed. Each of them
 * happened to carry its own `isValidSession` check, so nothing was reachable —
 * but protection was a convention, not a boundary, and the next admin route
 * added to either file would have been public with nothing to say so.
 *
 * The boundary now mounts in index.ts before any module registers anything.
 *
 * These tests EXECUTE the real middleware against real request objects, and
 * separately walk the AST of all three files to prove no admin route escapes it.
 *
 * Run:  node --test tests/unit/h79-admin-boundary.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import {
  createAdminBoundary,
  isPublicAdminPath,
  normalizeAdminPath,
  PUBLIC_ADMIN_SUBPATHS,
} from "../../server/adminBoundary.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const read = (p) => readFileSync(join(root, p), "utf8");

const INDEX = read("server/index.ts");
const ROUTES = read("server/routes.ts");
const VENDOR = read("server/vendor.ts");

// ─── executing the real boundary ─────────────────────────────────────────────

/** Run the boundary for one request; returns what the handler chain saw. */
function callBoundary(path, { validSession = false } = {}) {
  const boundary = createAdminBoundary(() => validSession);
  const req = { path, method: "GET", headers: {} };
  let status = null;
  let body = null;
  let passed = false;
  const res = {
    status(code) { status = code; return this; },
    json(payload) { body = payload; return this; },
  };
  boundary(req, res, () => { passed = true; });
  return { passed, status, body };
}

// ═════════════════════════════════════════════════════════════════════════════
describe("H-79 · E+F+G. the boundary itself fails closed", () => {
  test("G. no session → 401, handler never runs", () => {
    const r = callBoundary("/orders", { validSession: false });
    assert.equal(r.passed, false, "an unauthenticated request reached the handler");
    assert.equal(r.status, 401);
    assert.equal(r.body.error, "غير مصرح");
  });

  test("F. a valid admin session passes through", () => {
    const r = callBoundary("/orders", { validSession: true });
    assert.equal(r.passed, true, "a real admin was refused");
    assert.equal(r.status, null);
  });

  test("E. anything that is not a valid admin session is refused", () => {
    // The session check is the single authority; a customer, vendor or driver
    // token is not one, so isValidSession answers false for all of them.
    for (const label of ["customer token", "vendor token", "driver token", "garbage"]) {
      const r = callBoundary("/settlements", { validSession: false });
      assert.equal(r.passed, false, `${label} was allowed through the admin boundary`);
      assert.equal(r.status, 401);
    }
  });

  test("the guard decides before the handler, never after", () => {
    // next() and res.status() are mutually exclusive on any single request.
    for (const valid of [true, false]) {
      const r = callBoundary("/anything", { validSession: valid });
      assert.notEqual(r.passed, r.status !== null,
        "the boundary both refused and continued");
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-79 · H. the public admin subpaths, and only those", () => {
  test("login and logout stay reachable without a session", () => {
    for (const p of ["/login", "/logout"]) {
      assert.equal(callBoundary(p).passed, true, `${p} is no longer reachable`);
    }
  });

  test("the public list is exactly those two", () => {
    assert.deepEqual([...PUBLIC_ADMIN_SUBPATHS].sort(), ["/login", "/logout"]);
  });

  test("session and credentials-info are NOT public", () => {
    for (const p of ["/session", "/credentials-info", "/change-credentials"]) {
      assert.equal(callBoundary(p).passed, false, `${p} became public`);
      assert.equal(callBoundary(p).status, 401);
    }
  });

  test("a path cannot be made public by respelling it", () => {
    // Express routing is case-insensitive and ignores a trailing slash, so a
    // literal comparison would let /Orders/ skip a check the router still
    // resolves — the bypass class H-69 closed on the rate limiter.
    for (const p of ["/Orders", "/orders/", "/ORDERS", "/orders//"]) {
      assert.equal(callBoundary(p).passed, false, `${p} slipped past the boundary`);
    }
    // …and the genuinely public ones still resolve under any spelling.
    for (const p of ["/Login", "/login/", "/LOGOUT"]) {
      assert.equal(callBoundary(p).passed, true, `${p} should be public`);
    }
  });

  test("normalisation is total — no path throws or returns empty", () => {
    for (const p of ["", "/", "//", "/a", null, undefined]) {
      const out = normalizeAdminPath(p);
      assert.equal(typeof out, "string");
      assert.ok(out.length > 0, `normalising ${JSON.stringify(p)} produced ""`);
    }
    assert.equal(isPublicAdminPath("/nope"), false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
/** Every `/api/admin/...` route literal registered in a file, via the AST. */
function adminRoutesIn(src, fileName) {
  const sf = ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const found = [];
  const walk = (n) => {
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      ["get", "post", "put", "patch", "delete", "all"].includes(n.expression.name.text) &&
      n.arguments[0] &&
      ts.isStringLiteral(n.arguments[0]) &&
      n.arguments[0].text.startsWith("/api/admin")
    ) {
      found.push({
        path: n.arguments[0].text,
        method: n.expression.name.text,
        // Everything between the path and the handler is middleware.
        guards: n.arguments.slice(1, -1).map((a) => a.getText(sf)),
      });
    }
    ts.forEachChild(n, walk);
  };
  walk(sf);
  return found;
}

const INVENTORY = {
  "server/routes.ts": adminRoutesIn(ROUTES, "routes.ts"),
  "server/index.ts": adminRoutesIn(INDEX, "index.ts"),
  "server/vendor.ts": adminRoutesIn(VENDOR, "vendor.ts"),
};

describe("H-79 · A+B+C. every admin route in every file is behind the boundary", () => {
  test("the inventory is non-trivial — the scan is not vacuous", () => {
    assert.ok(INVENTORY["server/routes.ts"].length > 50,
      `only ${INVENTORY["server/routes.ts"].length} admin routes found in routes.ts`);
    assert.ok(INVENTORY["server/index.ts"].length >= 5);
    assert.ok(INVENTORY["server/vendor.ts"].length >= 10);
  });

  test("D. the boundary is mounted before ANY module registers a route", () => {
    const mount = INDEX.indexOf('app.use("/api/admin", createAdminBoundary(isValidSession))');
    assert.ok(mount > 0, "the admin boundary is not mounted in index.ts");

    const expoLanding = INDEX.indexOf("configureExpoAndLanding(app)");
    const vendorMount = INDEX.indexOf("app.use(vendorRouter)");
    const register = INDEX.indexOf("await registerRoutes(app)");

    assert.ok(mount < expoLanding,
      "the boundary mounts after index.ts's own admin routes are registered");
    assert.ok(mount < vendorMount,
      "the boundary mounts after vendorRouter — its 11 admin routes would bypass it");
    assert.ok(mount < register,
      "the boundary mounts after registerRoutes");
  });

  test("D. a route added to any of the three files is covered by path alone", () => {
    // The boundary matches on the "/api/admin" prefix, so coverage does not
    // depend on the file, the router, or anyone remembering a per-route guard.
    for (const [file, routes] of Object.entries(INVENTORY)) {
      for (const r of routes) {
        assert.ok(r.path.startsWith("/api/admin"),
          `${file} ${r.method} ${r.path} is not under the guarded prefix`);
      }
    }
  });

  test("A+C. the per-route checks are kept as defence in depth", () => {
    // Redundant is the correct state for an authorisation check: if the mount is
    // ever moved, these are what is left.
    const vendorRoutes = INVENTORY["server/vendor.ts"];
    const unguarded = vendorRoutes.filter((r) => !r.guards.includes("requireAdmin"));
    assert.deepEqual(unguarded.map((r) => r.path), [],
      "a vendor.ts admin route lost its own requireAdmin");
  });

  test("routes.ts still mounts its own guard too", () => {
    assert.match(ROUTES, /app\.use\("\/api\/admin", requireAdminAuth\)/,
      "the routes.ts guard was removed — the boundary would be the only layer");
  });

  test("the CSRF guard still mounts ahead of everything", () => {
    const csrf = INDEX.indexOf('app.use("/api/admin", requireAdminCsrf)');
    const boundary = INDEX.indexOf('app.use("/api/admin", createAdminBoundary');
    assert.ok(csrf > 0 && csrf < boundary,
      "the CSRF guard no longer runs before the auth boundary");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-79 · H. non-admin surfaces are not closed by mistake", () => {
  test("the boundary is scoped to /api/admin only", () => {
    // Mounted with a path prefix, so customer, vendor, driver and public routes
    // never reach it.
    assert.match(INDEX, /app\.use\("\/api\/admin", createAdminBoundary\(isValidSession\)\)/,
      "the boundary is mounted without a path prefix — it would guard the whole API");
    assert.ok(!/app\.use\(createAdminBoundary/.test(INDEX),
      "the boundary is mounted globally");
  });

  test("the other role guards are untouched", () => {
    assert.match(ROUTES, /app\.use\("\/api\/driver", requireDriverAuth\)/,
      "the driver guard changed");
    assert.match(ROUTES, /function requireCustomerAuth/, "the customer guard disappeared");
    assert.match(VENDOR, /function requireVendor/, "the vendor guard disappeared");
  });

  test("H-72…H-77 are not disturbed by this change", () => {
    assert.match(read("server/firebase.ts"), /walletId: mintDriverWalletId\(\)/);
    assert.match(read("server/firebase.ts"), /export async function findDriverDocByPhone\(/);
    assert.match(read("server/otpStore.ts"), /export async function consumeOtp\(/);
    assert.match(read("server/scripts/verify-storage.ts"), /initializeFirebase\(\)/);
  });
});
