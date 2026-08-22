/**
 * R-01 — disabling or demoting an admin must end that admin's live sessions.
 *
 * `getAdminIdentity()` verifies the JWT and nothing else: it never reads Firestore,
 * and the permission list is baked into the token at login. So `isActive: false` and
 * a changed `role` had no effect whatsoever on a token that already existed, and a
 * token lives for SESSION_TTL_SECS — seven days. Fire an operations admin, click
 * disable, and they keep working for a week. Demote a finance admin and their token
 * still carries `settlements.approve` and `wallet_adjustments.create`.
 *
 * The revocation machinery offered only two tools, neither of which fits:
 *
 *   invalidateSession(token)   needs the token itself, which the panel never has
 *   invalidateAllSessions()    signs EVERY admin out, including whoever clicked
 *
 * `updateAdminUser` originally called the second one after any edit, which logged
 * the acting admin out of their own panel; the button looked broken. That was
 * "fixed" by restricting the call to self-edits — solving the UX problem by
 * deleting the security property. This suite pins down the third option: revoke by
 * adminId, so the target's sessions end and nobody else's do.
 *
 * The `updateAdminUser` assertions execute the SHIPPED function, lifted out of
 * server/adminRbac.ts with its dependencies injected, against a Firestore double.
 *
 * Run:  node --test tests/unit/r01-admin-session-revocation.test.mjs
 */
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments } from "./_source.mjs";

process.env.SESSION_SECRET ||= "r01-suite-secret";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const ts = (await import(join(root, "node_modules/typescript/lib/typescript.js")))
  .default;

const RBAC_SRC = stripComments(readFileSync(join(root, "server/adminRbac.ts"), "utf8"));

const {
  createSession,
  getAdminIdentity,
  invalidateSessionsForAdmin,
  invalidateAllSessions,
} = await import(join(root, "server/adminAuth.ts"));
const { permissionsForRole, hasAdminPermission } = await import(
  join(root, "server/adminTypes.ts")
);
const { permissionForAdminRequest } = await import(
  join(root, "server/adminAuthorization.ts")
);

// Revocation state is module-level and deliberately outlives a single call, so each
// test mints its own adminId rather than sharing one and inheriting the previous
// test's cutoff.
let seq = 0;
const financeAdmin = () => ({
  adminId: `adm_finance_${++seq}`,
  username: `finance${seq}`,
  displayName: "مدير المالية",
  role: "finance_admin",
  permissions: permissionsForRole("finance_admin"),
});
const ownerAdmin = () => ({
  adminId: `adm_owner_${++seq}`,
  username: `owner${seq}`,
  displayName: "المدير العام",
  role: "super_admin",
  permissions: ["*"],
});

/** Fixed identities for the lifted-function tests, which use their own store. */
const FINANCE = {
  adminId: "adm_finance",
  username: "finance1",
  displayName: "مدير المالية",
  role: "finance_admin",
  permissions: permissionsForRole("finance_admin"),
};
const OWNER = {
  adminId: "adm_owner",
  username: "owner",
  displayName: "المدير العام",
  role: "super_admin",
  permissions: ["*"],
};

const reqWith = (token) => ({ headers: { authorization: `Bearer ${token}` } });

/** A token minted a whole second ago, so a revocation now is unambiguously later. */
function olderToken(identity) {
  const token = createSession(identity);
  return token;
}

// ── lifting updateAdminUser ──────────────────────────────────────────────────

function liftFunction(src, marker) {
  const at = src.indexOf(marker);
  assert.notEqual(at, -1, `moved or renamed: ${JSON.stringify(marker)}`);
  const open = src.indexOf("{", src.indexOf("):", at));
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(at, i + 1);
  }
  throw new Error(`unbalanced braces after ${marker}`);
}

/**
 * The REAL updateAdminUser, with every dependency injected. `revoked` collects the
 * adminIds whose sessions the function asked to end, and `allRevoked` counts any
 * resort to the blunt tool.
 */
function buildUpdate(records) {
  const src = liftFunction(RBAC_SRC, "export async function updateAdminUser(");
  const js = ts.transpileModule(src.replace(/^export /, ""), {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText;

  const revoked = [];
  let allRevoked = 0;
  const audits = [];

  const store = new Map(records.map((r) => [r.adminId, { ...r }]));
  const db = {
    collection: () => ({
      doc: (id) => ({
        update: async (patch) => {
          const cur = store.get(id);
          if (cur) store.set(id, { ...cur, ...patch });
        },
      }),
    }),
  };

  const deps = {
    ADMIN_USERS_COLLECTION: "adminUsers",
    getFirestore: () => db,
    getAdminUserById: async (id) => store.get(id) ?? null,
    getAdminUserByUsername: async (name) =>
      [...store.values()].find((r) => r.username === name) ?? null,
    isAdminRole: (v) =>
      ["super_admin", "operations_admin", "finance_admin", "support_admin", "catalog_admin"].includes(v),
    activeSuperAdminCount: async () =>
      [...store.values()].filter((r) => r.role === "super_admin" && r.isActive !== false).length,
    hashAdminPassword: async (p) => `hashed:${p}`,
    normalizeUsername: (u) => String(u).trim().toLowerCase(),
    permissionsForRole,
    now: () => 1,
    recordAudit: async (entry) => { audits.push(entry); },
    invalidateAllSessions: () => { allRevoked += 1; },
    invalidateSessionsForAdmin: (id) => { revoked.push(id); },
  };

  const names = Object.keys(deps);
  const fn = new Function(
    ...names,
    `${js}\nreturn updateAdminUser;`,
  )(...names.map((n) => deps[n]));

  return { updateAdminUser: fn, revoked, audits, store, allRevokedCount: () => allRevoked };
}

const RECORDS = [
  { ...OWNER, isActive: true, passwordHash: "x", usernameNormalized: "owner" },
  { ...FINANCE, isActive: true, passwordHash: "x", usernameNormalized: "finance1" },
  {
    adminId: "adm_owner2",
    username: "owner2",
    displayName: "مدير عام ثانٍ",
    role: "super_admin",
    permissions: ["*"],
    isActive: true,
    passwordHash: "x",
    usernameNormalized: "owner2",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
describe("R-01 · revoking one admin's sessions", () => {
  test("the entry point exists and is exported", () => {
    assert.equal(
      typeof invalidateSessionsForAdmin,
      "function",
      "there is still no way to end one admin's sessions",
    );
  });

  test("the target's live token stops being accepted", () => {
    const who = financeAdmin();
    const token = olderToken(who);
    assert.ok(getAdminIdentity(reqWith(token)), "precondition: the token works");
    invalidateSessionsForAdmin(who.adminId);
    assert.equal(
      getAdminIdentity(reqWith(token)),
      null,
      "the disabled admin's token is still accepted",
    );
  });

  test("a demoted admin can no longer approve settlements", () => {
    const who = financeAdmin();
    const token = olderToken(who);
    const permission = permissionForAdminRequest("POST", "/settlements/approve");
    assert.equal(
      hasAdminPermission(getAdminIdentity(reqWith(token)), permission),
      true,
      "precondition: finance_admin approves settlements",
    );
    invalidateSessionsForAdmin(who.adminId);
    assert.equal(
      getAdminIdentity(reqWith(token)),
      null,
      "the demoted admin's token still authorizes money movement",
    );
  });

  test("NOBODY ELSE is signed out — the whole point of not using the blunt tool", () => {
    const victimWho = financeAdmin();
    const victim = olderToken(victimWho);
    const bystander = olderToken(ownerAdmin());
    invalidateSessionsForAdmin(victimWho.adminId);
    assert.equal(getAdminIdentity(reqWith(victim)), null);
    assert.ok(
      getAdminIdentity(reqWith(bystander)),
      "REGRESSION: revoking one admin signed another one out — this is invalidateAllSessions again",
    );
  });

  test("re-activating works: a session minted afterwards is accepted", async () => {
    const who = financeAdmin();
    const stale = olderToken(who);
    invalidateSessionsForAdmin(who.adminId);
    assert.equal(getAdminIdentity(reqWith(stale)), null);

    // The cutoff covers the whole second it was taken in, so a token minted in the
    // NEXT second must be accepted — otherwise disable/re-enable/login deadlocks.
    await new Promise((r) => setTimeout(r, 1100));
    const fresh = createSession(who);
    assert.ok(
      getAdminIdentity(reqWith(fresh)),
      "a re-activated admin cannot sign back in",
    );
  });

  test("revoking an unknown adminId affects nobody", () => {
    const token = olderToken(financeAdmin());
    invalidateSessionsForAdmin("adm_does_not_exist");
    assert.ok(getAdminIdentity(reqWith(token)));
  });

  test("an empty or missing adminId is ignored rather than revoking everything", () => {
    const token = olderToken(financeAdmin());
    invalidateSessionsForAdmin("");
    invalidateSessionsForAdmin(undefined);
    assert.ok(
      getAdminIdentity(reqWith(token)),
      "a falsy adminId must not become a global revocation",
    );
  });
});

describe("R-01 · updateAdminUser revokes the TARGET, not the actor", () => {
  test("deactivating another admin revokes that admin only", async () => {
    const h = buildUpdate(RECORDS);
    await h.updateAdminUser({ adminId: "adm_finance", actor: OWNER, isActive: false });
    assert.deepEqual(h.revoked, ["adm_finance"]);
    assert.equal(h.allRevokedCount(), 0, "invalidateAllSessions was used again");
  });

  test("changing another admin's role revokes that admin only", async () => {
    const h = buildUpdate(RECORDS);
    await h.updateAdminUser({ adminId: "adm_finance", actor: OWNER, role: "support_admin" });
    assert.deepEqual(h.revoked, ["adm_finance"]);
    assert.equal(h.allRevokedCount(), 0);
  });

  test("editing yourself still ends your own sessions", async () => {
    const h = buildUpdate(RECORDS);
    await h.updateAdminUser({ adminId: "adm_owner", actor: OWNER, password: "a-new-password" });
    assert.deepEqual(h.revoked, ["adm_owner"]);
    assert.equal(h.allRevokedCount(), 0);
  });

  test("a cosmetic edit revokes nothing", async () => {
    const h = buildUpdate(RECORDS);
    await h.updateAdminUser({ adminId: "adm_finance", actor: OWNER, displayName: "اسم جديد" });
    assert.deepEqual(h.revoked, [], "a display-name change signed someone out");
  });

  test("the last active super admin is still protected", async () => {
    const single = [RECORDS[0], RECORDS[1]];
    const h = buildUpdate(single);
    await assert.rejects(
      () => h.updateAdminUser({ adminId: "adm_owner", actor: OWNER, isActive: false }),
      /last_super_admin/,
    );
    assert.deepEqual(h.revoked, [], "a rejected update must not revoke anything");
  });

  test("the role change is still written and still audited", async () => {
    const h = buildUpdate(RECORDS);
    await h.updateAdminUser({ adminId: "adm_finance", actor: OWNER, role: "support_admin" });
    const stored = h.store.get("adm_finance");
    assert.equal(stored.role, "support_admin");
    assert.deepEqual(stored.permissions, permissionsForRole("support_admin"));
    assert.equal(h.audits.length, 1);
    assert.equal(h.audits[0].action, "admin.role_changed");
    assert.equal(h.audits[0].actorId, "adm_owner");
    assert.equal(h.audits[0].targetId, "adm_finance");
  });
});

describe("R-01 · the blunt tool still exists for credential rotation", () => {
  test("invalidateAllSessions is unchanged and still ends every session", () => {
    const a = olderToken(financeAdmin());
    const b = olderToken(ownerAdmin());
    invalidateAllSessions();
    assert.equal(getAdminIdentity(reqWith(a)), null);
    assert.equal(getAdminIdentity(reqWith(b)), null);
  });
});
