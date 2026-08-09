/**
 * Identity boundary tests (audit findings H-12 and H-13).
 *
 * H-12 — "Admin" and "AdminLogin" are routes on the SAME stack every customer and
 *   guest gets, and AdminScreen mounted for anyone who reached it. The only
 *   protection was that the network calls would fail — the panel's layout, its
 *   operation names and the shape of every admin route were on display regardless.
 *
 * H-13 — four driver routes read the phone number out of the request body. They are
 *   safe today only because requireDriverAuth overwrites `req.body.phoneNumber`
 *   with the token's phone before the handler runs. That is a load-bearing
 *   invariant with nothing enforcing it, so these tests enforce it: the overwrite
 *   must stay, no driver route may bring its own body parser (which would re-parse
 *   the client's value AFTER the overwrite), and none may read the phone from the
 *   query string, which the overwrite does not cover.
 *
 * Run:  node --test tests/unit/identity-boundaries.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, "../../", p), "utf8");
const ROUTES = read("server/routes.ts");
const ADMIN_SCREEN = read("client/screens/AdminScreen.tsx");
const NAVIGATOR = read("client/navigation/RootStackNavigator.tsx");

describe("H-12 — the admin panel does not render without an admin token", () => {
  test("the screen reads the stored token on mount", () => {
    assert.match(ADMIN_SCREEN, /import \{ getAdminToken \} from "@\/lib\/adminAuth";/);
    assert.match(
      ADMIN_SCREEN,
      /const token = await getAdminToken\(\);/,
      "REGRESSION: the screen mounts without checking for a token",
    );
  });

  test("no token sends the user to the login screen, with no way back", () => {
    // replace(), not navigate() — otherwise the panel stays on the back stack.
    assert.match(ADMIN_SCREEN, /else navigation\.replace\("AdminLogin"\);/);
    assert.doesNotMatch(ADMIN_SCREEN, /navigation\.navigate\("AdminLogin"\)/);
  });

  test("nothing of the panel is rendered while the check is pending", () => {
    const gate = ADMIN_SCREEN.indexOf('if (adminAuthState === "checking")');
    const panel = ADMIN_SCREEN.indexOf("{/* Sticky tab bar */}");
    assert.ok(gate > -1, "REGRESSION: the render gate is gone");
    assert.ok(gate < panel, "the gate must come before the panel markup");
  });

  test("the gate starts closed", () => {
    assert.match(
      ADMIN_SCREEN,
      /useState<"checking" \| "ok">\("checking"\)/,
      "REGRESSION: the panel renders first and checks afterwards",
    );
  });

  test("the check is not left hanging on unmount", () => {
    const eff = ADMIN_SCREEN.slice(ADMIN_SCREEN.indexOf("let cancelled = false;"));
    assert.match(eff.slice(0, 500), /if \(cancelled\) return;/);
    assert.match(eff.slice(0, 500), /cancelled = true;/);
  });

  test("the routes are still reachable for a legitimate admin", () => {
    // The fix must not remove the entry point, only gate it.
    assert.match(NAVIGATOR, /name="AdminLogin"/);
    assert.match(NAVIGATOR, /name="Admin"/);
  });
});

describe("H-13 — driver identity comes from the token, never the body", () => {
  test("the middleware overwrites the body phone with the token's", () => {
    assert.match(
      ROUTES,
      /if \(req\.body && typeof req\.body === "object"\) \(req\.body as any\)\.phoneNumber = driverPhone;/,
      "REGRESSION: the body phone is trusted again — a driver can act as another driver",
    );
  });

  test("the overwrite happens before next(), and after the identity is established", () => {
    const fn = ROUTES.slice(ROUTES.indexOf("async function requireDriverAuth"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    const assign = body.indexOf('(req as any).driverPhone = driverPhone;');
    const overwrite = body.indexOf("(req.body as any).phoneNumber = driverPhone;");
    const next = body.indexOf("\n    next();");
    assert.ok(assign > -1 && overwrite > assign, "the overwrite must follow the token identity");
    assert.ok(next > overwrite, "the overwrite must precede next()");
  });

  test("the middleware is mounted on the whole driver prefix", () => {
    assert.match(ROUTES, /app\.use\("\/api\/driver", requireDriverAuth\);/);
  });

  test("only the token issuer is exempt", () => {
    const fn = ROUTES.slice(ROUTES.indexOf("async function requireDriverAuth"));
    const exempts = [...fn.slice(0, 900).matchAll(/endsWith\("(\/api\/driver\/[^"]+)"\)\) return next\(\)/g)]
      .map((m) => m[1]);
    assert.deepEqual(exempts, ["/api/driver/mobile-auth"], `unexpected exemptions: ${exempts}`);
  });

  test("no driver route brings its own body parser", () => {
    // A per-route parser runs AFTER the middleware and would re-populate req.body
    // from the client, silently undoing the overwrite.
    const bad = [...ROUTES.matchAll(/app\.(post|put|patch)\("(\/api\/driver\/[^"]*)",\s*([A-Za-z_$][\w$.]*)/g)]
      .filter((m) => m[3] !== "async")
      .map((m) => `${m[1].toUpperCase()} ${m[2]} (${m[3]})`);
    assert.deepEqual(bad, [], "REGRESSION: a body parser after requireDriverAuth re-opens the IDOR");
  });

  test("no driver route reads the phone from the query string", () => {
    // The overwrite covers req.body only; req.query would still be attacker-controlled.
    const routeRe = /app\.(post|put|patch|delete|get)\("(\/api\/driver\/[^"]*)"/g;
    const offenders = [];
    for (const m of ROUTES.matchAll(routeRe)) {
      const rest = ROUTES.slice(m.index + m[0].length);
      const next = rest.search(/\n\s*app\.(get|post|put|patch|delete)\(/);
      const body = rest.slice(0, next === -1 ? 3000 : next);
      if (/req\.query\.(phoneNumber|phone)\b|req\.query\["(phoneNumber|phone)"\]/.test(body)) {
        offenders.push(`${m[1].toUpperCase()} ${m[2]}`);
      }
    }
    assert.deepEqual(offenders, [], "REGRESSION: a driver route takes its identity from the query string");
  });

  test("driver registration checks the phone against the customer token", () => {
    // POST /api/drivers is the one driver-related write outside the prefix.
    const at = ROUTES.indexOf('app.post("/api/drivers", requireCustomerAuth');
    assert.ok(at > -1, "route not found");
    const body = ROUTES.slice(at, at + 900);
    assert.match(body, /if \(\(req as any\)\.customerPhone !== phoneNumber\)/);
    assert.match(body, /رقم الهاتف لا يطابق حسابك/);
  });

  test("the approval gate is not bypassable through the pre-approval list", () => {
    assert.match(
      ROUTES,
      /const DRIVER_PREAPPROVAL_ROUTES = \["\/api\/driver\/status", "\/api\/driver\/profile", "\/api\/driver\/refresh-push-token"\];/,
      "the pre-approval allow-list changed — every entry is reachable by an unapproved driver",
    );
  });
});
