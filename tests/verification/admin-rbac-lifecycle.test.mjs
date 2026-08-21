import assert from "node:assert/strict";
import { after, before, test, mock } from "node:test";
import { readFileSync } from "node:fs";

process.env.JWT_SECRET = "admin-rbac-lifecycle-test-secret";

function makeFakeDb() {
  const docs = new Map();
  const audit = [];

  function snapshot(id, data) {
    return {
      id,
      exists: Boolean(data),
      data: () => data,
    };
  }

  function collection(name) {
    const prefix = `${name}/`;
    return {
      doc(id) {
        const key = `${prefix}${id}`;
        return {
          id,
          async get() {
            return snapshot(id, docs.get(key));
          },
          async create(data) {
            if (docs.has(key)) throw new Error("already-exists");
            docs.set(key, { ...data });
          },
          async update(patch) {
            if (!docs.has(key)) throw new Error("not-found");
            docs.set(key, { ...docs.get(key), ...patch });
          },
          async set(data, options = {}) {
            docs.set(key, options.merge ? { ...docs.get(key), ...data } : { ...data });
          },
        };
      },
      where(field, _operator, value) {
        return {
          limit(limit) {
            return {
              async get() {
                const rows = [...docs.entries()]
                  .filter(([key, data]) => key.startsWith(prefix) && data?.[field] === value)
                  .slice(0, limit);
                return {
                  empty: rows.length === 0,
                  docs: rows.map(([key, data]) => snapshot(key.slice(prefix.length), data)),
                };
              },
            };
          },
          async get() {
            const rows = [...docs.entries()]
              .filter(([key, data]) => key.startsWith(prefix) && data?.[field] === value);
            return { empty: rows.length === 0, docs: rows.map(([key, data]) => snapshot(key.slice(prefix.length), data)) };
          },
        };
      },
      limit(limit) {
        return {
          async get() {
            const rows = [...docs.entries()]
              .filter(([key]) => key.startsWith(prefix))
              .slice(0, limit);
            return { empty: rows.length === 0, docs: rows.map(([key, data]) => snapshot(key.slice(prefix.length), data)) };
          },
        };
      },
      orderBy() {
        return {
          async get() {
            const rows = [...docs.entries()].filter(([key]) => key.startsWith(prefix));
            return { empty: rows.length === 0, docs: rows.map(([key, data]) => snapshot(key.slice(prefix.length), data)) };
          },
        };
      },
      async add(data) {
        audit.push(data);
        return { id: `audit-${audit.length}` };
      },
    };
  }

  return {
    collection,
    async runTransaction(callback) {
      const tx = {
        async get(ref) { return ref.get(); },
        set(ref, data) { return ref.set(data); },
      };
      return callback(tx);
    },
    _docs: docs,
    _audit: audit,
  };
}

const fakeDb = makeFakeDb();
mock.module("/home/ubuntu/onway-app/server/firebase.ts", {
  namedExports: { getFirestore: () => fakeDb },
});
mock.module("/home/ubuntu/onway-app/server/adminAuth.ts", {
  namedExports: {
    getAdminIdentity: () => null,
    invalidateAllSessions: () => { sessionInvalidations += 1; },
  },
});

const {
  authenticateAdmin,
  createAdminUser,
  updateAdminUser,
} = await import("/home/ubuntu/onway-app/server/adminRbac.ts");

const actor = {
  adminId: "primary-id",
  username: "primary.admin",
  displayName: "Primary Admin",
  role: "super_admin",
  permissions: ["*"],
};

let primary;
let second;
let sessionInvalidations = 0;

before(async () => {
  primary = await createAdminUser({
    username: "Primary.Admin",
    displayName: "Primary Admin",
    password: "primary-pass-123",
    role: "super_admin",
    actor,
  });
  second = await createAdminUser({
    username: "Second.Admin",
    displayName: "Second Admin",
    password: "second-pass-123",
    role: "operations_admin",
    actor,
  });
});

after(() => {
  mock.reset();
});

test("create stores a second admin with normalized username, active state, role permissions, and hashed password", () => {
  assert.equal(second.username, "Second.Admin");
  assert.equal(second.usernameNormalized, "second.admin");
  assert.equal(second.isActive, true);
  assert.ok(second.passwordHash);
  assert.notEqual(second.passwordHash, "second-pass-123");
  assert.ok(second.permissions.includes("orders.read"));
});

test("second admin login accepts normalized username and rejects wrong password", async () => {
  const authenticated = await authenticateAdmin("  SECOND.ADMIN ", "second-pass-123", async () => false);
  assert.ok(authenticated);
  assert.equal(authenticated.identity.adminId, second.adminId);
  assert.equal(authenticated.identity.username, "Second.Admin");
  assert.ok(authenticated.identity.permissions.includes("orders.read"));

  const wrongPassword = await authenticateAdmin("second.admin", "wrong-pass-123", async () => false);
  assert.equal(wrongPassword, null);
});

test("edit updates the same admin record and keeps permissions attached to the selected role", async () => {
  const before = sessionInvalidations;
  const updated = await updateAdminUser({
    adminId: second.adminId,
    actor,
    displayName: "Second Admin Updated",
    role: "catalog_admin",
  });
  assert.equal(updated.displayName, "Second Admin Updated");
  assert.equal(updated.role, "catalog_admin");
  assert.ok(updated.permissions.includes("catalog.manage"));
  assert.ok(updated.permissions.includes("website_cms.manage"));
  assert.equal(updated.isActive, true);
  assert.equal(sessionInvalidations, before);
});

test("disable makes login fail, and re-enable restores login", async () => {
  const before = sessionInvalidations;
  const disabled = await updateAdminUser({ adminId: second.adminId, actor, isActive: false });
  assert.equal(disabled.isActive, false);
  assert.equal(await authenticateAdmin("second.admin", "second-pass-123", async () => false), null);

  const enabled = await updateAdminUser({ adminId: second.adminId, actor, isActive: true });
  assert.equal(enabled.isActive, true);
  const authenticatedAgain = await authenticateAdmin("second.admin", "second-pass-123", async () => false);
  assert.ok(authenticatedAgain);
  assert.equal(authenticatedAgain.identity.adminId, second.adminId);
  assert.equal(sessionInvalidations, before);
});

test("self admin credential-affecting update still invalidates sessions", async () => {
  const before = sessionInvalidations;
  await updateAdminUser({ adminId: primary.adminId, actor: { ...actor, adminId: primary.adminId }, role: "super_admin" });
  assert.equal(sessionInvalidations, before + 1);
});

test("primary admin remains able to authenticate after secondary admin lifecycle changes", async () => {
  const authenticated = await authenticateAdmin("primary.admin", "primary-pass-123", async () => false);
  assert.ok(authenticated);
  assert.equal(authenticated.identity.adminId, primary.adminId);
  assert.deepEqual(authenticated.identity.permissions, ["*"]);
});

test("Admin Web escapes adminId before using it in edit and activate/deactivate onclick attributes", () => {
  const html = readFileSync("/home/ubuntu/onway-app/server/templates/admin.html", "utf8");
  assert.match(html, /const adminIdArg = escHtml\(JSON\.stringify\(String\(u\.adminId \|\| ''\)\)\)/);
  assert.match(html, /onclick="editAdminUser\(\$\{adminIdArg\}\)"/);
  assert.match(html, /onclick="toggleAdminUser\(\$\{adminIdArg\}, \$\{!u\.isActive\}\)"/);
  assert.doesNotMatch(html, /onclick="editAdminUser\(\$\{JSON\.stringify\(String\(u\.adminId/);
});

test("Admin Users API permission mapping covers read and every write lifecycle route", async () => {
  const { permissionForAdminRequest } = await import("/home/ubuntu/onway-app/server/adminAuthorization.ts");
  assert.equal(permissionForAdminRequest("GET", "/admin-users"), "admin_users.read");
  assert.equal(permissionForAdminRequest("POST", "/admin-users"), "admin_users.manage");
  assert.equal(permissionForAdminRequest("PATCH", "/admin-users/secondary"), "admin_users.manage");
  assert.equal(permissionForAdminRequest("POST", "/admin-users/secondary/deactivate"), "admin_users.manage");
  assert.equal(permissionForAdminRequest("POST", "/admin-users/secondary/activate"), "admin_users.manage");
});
