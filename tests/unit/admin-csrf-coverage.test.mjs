/**
 * Admin CSRF coverage tests (audit finding H-08).
 *
 * H-08 is the surface-area half of the CSRF problem: "no CSRF protection on 97
 * admin routes", citing index.ts:532, 566, 614. C-12 built the guard and H-79
 * fixed where it was mounted; this file pins down the thing neither of those
 * covers — that the guard's mount point still spans the WHOLE cookie-authenticated
 * admin write surface, and that nothing has been added outside it.
 *
 * The three lines the finding cites are login/recovery paths, not session
 * authenticated, so CSRF does not apply to them — asserted below so that stays true.
 *
 * Run:  node --test tests/unit/admin-csrf-coverage.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, "../../", p), "utf8");
const SOURCES = {
  "server/index.ts": read("server/index.ts"),
  "server/routes.ts": read("server/routes.ts"),
  "server/vendor.ts": read("server/vendor.ts"),
};

const WRITE_RE = /(?:app|router)\.(post|put|patch|delete)\("([^"]+)"/g;

/** Every state-changing route the server registers, with its file. */
function writeRoutes() {
  const out = [];
  for (const [file, src] of Object.entries(SOURCES)) {
    for (const m of src.matchAll(WRITE_RE)) {
      out.push({ file, method: m[1].toUpperCase(), path: m[2], at: m.index });
    }
  }
  return out;
}

/** One handler's source, bounded by the NEXT route registration (never the one after). */
function handlerAt(src, at) {
  const rest = src.slice(at + 10);
  const next = rest.search(/\n\s*(?:app|router)\.(?:get|post|put|patch|delete)\(/);
  return rest.slice(0, next === -1 ? rest.length : next);
}

/** Does this route authenticate with the ADMIN SESSION COOKIE? */
function isAdminSessionRoute(route) {
  const src = SOURCES[route.file];
  const head = src.slice(route.at, route.at + 1200);
  return /isValidSession\(|requireAdmin\b/.test(head);
}

describe("H-08 — the guard's mount point spans the admin write surface", () => {
  const routes = writeRoutes();
  const adminWrites = routes.filter((r) => r.path.startsWith("/api/admin"));

  test("there is a substantial admin write surface to protect", () => {
    assert.ok(adminWrites.length >= 60, `only ${adminWrites.length} admin write routes found — did the scan break?`);
  });

  test("the guard is mounted on the prefix that covers all of them", () => {
    assert.match(SOURCES["server/index.ts"], /app\.use\("\/api\/admin", requireAdminCsrf\);/);
    for (const r of adminWrites) {
      assert.ok(
        r.path.startsWith("/api/admin"),
        `${r.method} ${r.path} sits outside the guarded prefix`,
      );
    }
  });

  test("the guard is registered before every module that declares admin routes", () => {
    const idx = SOURCES["server/index.ts"];
    const mount = idx.indexOf('app.use("/api/admin", requireAdminCsrf);');
    assert.ok(mount > -1, "the guard is not mounted");
    for (const marker of ["configureExpoAndLanding(app);", "app.use(vendorRouter);", "registerRoutes(app)"]) {
      const at = idx.indexOf(marker);
      assert.ok(at > -1, `${marker} not found`);
      assert.ok(mount < at, `REGRESSION: routes in ${marker} are registered before the guard`);
    }
  });

  test("no cookie-authenticated admin write route escapes the prefix", () => {
    const escapees = routes
      .filter((r) => !r.path.startsWith("/api/admin"))
      .filter(isAdminSessionRoute)
      .map((r) => `${r.method} ${r.path} [${r.file}]`);
    assert.deepEqual(
      escapees,
      [],
      "REGRESSION: an admin-session write route was added outside /api/admin, where the guard never runs",
    );
  });
});

describe("H-08 — the three routes the finding cites carry no session credential", () => {
  const idx = SOURCES["server/index.ts"];

  for (const path of ["/admin/login", "/admin/google-signin", "/admin/reset-password"]) {
    test(`POST ${path} does not authenticate with the session cookie`, () => {
      const at = idx.indexOf(`app.post("${path}"`);
      assert.ok(at > -1, `${path} not found`);
      const body = handlerAt(idx, at);
      assert.doesNotMatch(
        body,
        /isValidSession\(req\)/,
        `${path} became session-authenticated — it now needs CSRF protection`,
      );
    });
  }

  test("reset-password is gated on a separate secret, not on the session", () => {
    // An attacker who lacks MASTER_RECOVERY_PASSWORD cannot use CSRF to reach it;
    // one who has it does not need CSRF.
    const at = idx.indexOf('app.post("/admin/reset-password"');
    const body = handlerAt(idx, at);
    assert.match(body, /process\.env\.MASTER_RECOVERY_PASSWORD/);
    assert.match(body, /timingSafeEqualStr\(String\(recoveryCode \|\| ""\), masterRecoveryPassword\)/);
    assert.match(body, /if \(!masterRecoveryPassword\)/, "must be disabled when the secret is unset");
  });

  test("change-credentials — the session-authenticated one — IS under the prefix", () => {
    assert.match(idx, /app\.post\("\/api\/admin\/change-credentials"/);
    const at = idx.indexOf('app.post("/api/admin/change-credentials"');
    assert.match(idx.slice(at, at + 400), /if \(!isValidSession\(req\)\)/);
  });

  test("it also re-checks the current password, so a forged call alone cannot rotate credentials", () => {
    const at = idx.indexOf('app.post("/api/admin/change-credentials"');
    const body = handlerAt(idx, at);
    assert.match(body, /if \(!currentPassword\)/);
    assert.match(body, /await validateAdminCredentials\(currentUsername, currentPassword\)/);
  });
});

describe("H-08 — the guard's decision rules", () => {
  const guard = read("server/originGuard.ts");

  test("only the login path is exempt", () => {
    assert.match(guard, /const CSRF_EXEMPT_ADMIN_PATHS = \["\/api\/admin\/login"\];/);
  });

  test("the session cookie is what triggers the check", () => {
    assert.match(guard, /hasSessionCookie: !!readCookie\(req, ADMIN_SESSION_COOKIE\)/);
  });

  test("Referer is consulted when Origin is absent", () => {
    assert.match(guard, /referer: req\.header\("referer"\)/);
  });

  test("a blocked request is refused, not merely logged", () => {
    assert.match(guard, /res\.status\(403\)\.json\(\{ error: "طلب غير موثوق المصدر" \}\)/);
    assert.match(guard, /\[CSRF\] blocked/);
  });
});
