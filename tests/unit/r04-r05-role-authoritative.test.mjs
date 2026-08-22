/**
 * R-04 — the ROLE decides what an admin may do, not a list carried in the token.
 * R-05 — no debug tracing left in the authentication path.
 *
 * R-04: `identityFromClaims` preferred `claims.permissions` and fell back to the
 * role only when the claim was absent:
 *
 *     permissions: Array.isArray(claims.permissions)
 *       ? claims.permissions.map(String)
 *       : permissionsForRole(claims.role)
 *
 * and `hasAdminPermission` answers from that list, so `role` played no part in any
 * authorization decision — a token stating `role: "support_admin"` with
 * `permissions: ["*"]` was a super admin. Signing such a token needs the secret, so
 * this was never reachable from outside; what it cost was the layer that makes the
 * two fields unable to disagree. Every write path already stores
 * `permissionsForRole(role)` — createAdminUser, updateAdminUser, both bootstraps —
 * so deriving at read time changes no real admin's access and removes the divergence.
 *
 * Together with R-01 the rule becomes complete: the role is authoritative, and
 * changing it ends the sessions that were issued under the old one.
 *
 * Run:  node --test tests/unit/r04-r05-role-authoritative.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments } from "./_source.mjs";

process.env.SESSION_SECRET ||= "r04-suite-secret";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");

const RBAC_SRC = stripComments(readFileSync(join(root, "server/adminRbac.ts"), "utf8"));

const { identityFromClaims, permissionsForRole, hasAdminPermission, ADMIN_ROLES } =
  await import(join(root, "server/adminTypes.ts"));
const { createSession, getAdminIdentity } = await import(join(root, "server/adminAuth.ts"));
const { permissionForAdminRequest } = await import(
  join(root, "server/adminAuthorization.ts")
);

const reqWith = (token) => ({ headers: { authorization: `Bearer ${token}` } });

const claims = (over = {}) => ({
  adminId: "adm_1",
  username: "someone",
  displayName: "مدير",
  role: "support_admin",
  ...over,
});

// ─────────────────────────────────────────────────────────────────────────────
describe("R-04 · the role decides, the claim list does not", () => {
  test("a wildcard in the token does not make a support admin a super admin", () => {
    const identity = identityFromClaims(claims({ permissions: ["*"] }));
    assert.ok(identity);
    assert.equal(
      hasAdminPermission(identity, "settlements.approve"),
      false,
      "a permissions claim overrode the role",
    );
    assert.deepEqual(identity.permissions, permissionsForRole("support_admin"));
  });

  test("a single smuggled financial permission is ignored too", () => {
    const identity = identityFromClaims(
      claims({ permissions: [...permissionsForRole("support_admin"), "wallet_adjustments.create"] }),
    );
    assert.equal(hasAdminPermission(identity, "wallet_adjustments.create"), false);
  });

  test("a narrowed list does not silently widen either — the role is the whole answer", () => {
    const identity = identityFromClaims(
      claims({ role: "finance_admin", permissions: ["settlements.approve"] }),
    );
    assert.deepEqual(identity.permissions, permissionsForRole("finance_admin"));
  });

  test("every role resolves exactly its own permission set", () => {
    for (const role of ADMIN_ROLES) {
      const identity = identityFromClaims(claims({ role, permissions: ["*"] }));
      assert.deepEqual(
        identity.permissions,
        permissionsForRole(role),
        `${role} did not resolve its own set`,
      );
    }
  });

  test("a super admin is still a super admin", () => {
    const identity = identityFromClaims(claims({ role: "super_admin", permissions: [] }));
    assert.equal(hasAdminPermission(identity, "settlements.approve"), true);
    assert.equal(hasAdminPermission(identity, "system.maintenance"), true);
  });

  test("an unknown or missing role is still rejected outright", () => {
    assert.equal(identityFromClaims(claims({ role: "root" })), null);
    assert.equal(identityFromClaims(claims({ role: undefined })), null);
    assert.equal(identityFromClaims({ username: "x", role: "super_admin" }), null);
    assert.equal(identityFromClaims(null), null);
  });

  test("the rest of the identity is untouched", () => {
    const identity = identityFromClaims(
      claims({ role: "catalog_admin", email: "a@b.c", displayName: "مدير الكتالوج" }),
    );
    assert.equal(identity.adminId, "adm_1");
    assert.equal(identity.username, "someone");
    assert.equal(identity.displayName, "مدير الكتالوج");
    assert.equal(identity.email, "a@b.c");
    assert.equal(identity.role, "catalog_admin");
  });
});

describe("R-04 · end to end, through a real signed session", () => {
  test("a token minted with inflated permissions cannot approve settlements", () => {
    // Only the server can sign this, but the whole point is that it no longer
    // matters if one is ever minted with the two fields out of step.
    const token = createSession({
      adminId: "adm_support",
      username: "support1",
      displayName: "مدير الدعم",
      role: "support_admin",
      permissions: ["*"],
    });
    const identity = getAdminIdentity(reqWith(token));
    const needed = permissionForAdminRequest("POST", "/settlements/approve");
    assert.ok(identity, "the session must still be valid");
    assert.equal(identity.role, "support_admin");
    assert.equal(
      hasAdminPermission(identity, needed),
      false,
      "the inflated claim survived all the way to the authorization decision",
    );
  });

  test("a real finance admin still approves settlements", () => {
    const token = createSession({
      adminId: "adm_finance",
      username: "finance1",
      displayName: "مدير المالية",
      role: "finance_admin",
      permissions: permissionsForRole("finance_admin"),
    });
    const identity = getAdminIdentity(reqWith(token));
    assert.equal(
      hasAdminPermission(identity, permissionForAdminRequest("POST", "/settlements/approve")),
      true,
      "REGRESSION: a legitimate finance admin lost access",
    );
  });

  test("a real catalog admin still manages products and still cannot touch money", () => {
    const token = createSession({
      adminId: "adm_catalog",
      username: "catalog1",
      displayName: "مدير الكتالوج",
      role: "catalog_admin",
      permissions: permissionsForRole("catalog_admin"),
    });
    const identity = getAdminIdentity(reqWith(token));
    assert.equal(
      hasAdminPermission(identity, permissionForAdminRequest("POST", "/products")),
      true,
    );
    assert.equal(
      hasAdminPermission(identity, permissionForAdminRequest("POST", "/driver-wallet/adjustment")),
      false,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
/** The body of a top-level function, matching from the brace that ends its line. */
function functionBody(src, declaration) {
  const at = src.indexOf(declaration);
  assert.notEqual(at, -1, `moved or renamed: ${declaration}`);
  let open = src.indexOf("{", at);
  for (;;) {
    assert.notEqual(open, -1, `no body brace for ${declaration}`);
    let j = open + 1;
    while (j < src.length && src[j] !== "\n" && /\s/.test(src[j])) j++;
    if (j >= src.length || src[j] === "\n") break;
    open = src.indexOf("{", open + 1);
  }
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(at, i + 1);
  }
  throw new Error(`unbalanced braces in ${declaration}`);
}

describe("R-05 · no debug tracing in the authentication path", () => {
  const AUTH = functionBody(RBAC_SRC, "export async function authenticateAdmin(");

  test("the leftover DEBUG statements are gone", () => {
    assert.doesNotMatch(AUTH, /DEBUG/, "debug tracing is still shipped");
  });

  test("no console call narrates the authentication decision", () => {
    assert.doesNotMatch(
      AUTH,
      /console\.(log|error|warn|info)\(\s*["'`]DEBUG/,
      "the auth flow still logs its own decisions",
    );
  });

  test("the three refusal guards they were attached to still refuse", () => {
    assert.match(AUTH, /if \(await hasAnyAdminUsers\(\)\) \{?\s*return null;?/);
    assert.match(AUTH, /if \(!\(await legacyValidator\(\)\)\) \{?\s*return null;?/);
    assert.match(AUTH, /if \(!db\) \{?\s*return null;?/);
  });

  test("the bootstrap-only rule is unchanged", () => {
    // Existing admin users must still shut the legacy credentials out entirely.
    // Compare the CALLS, not the names — `legacyValidator` is also a parameter, so
    // it appears in the signature before either call site.
    assert.ok(
      AUTH.indexOf("await hasAnyAdminUsers()") < AUTH.indexOf("await legacyValidator()"),
      "the legacy validator now runs before the existing-admin check",
    );
  });
});
