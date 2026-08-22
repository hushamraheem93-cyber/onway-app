import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import crypto from "node:crypto";

process.env.JWT_SECRET ??= crypto.randomBytes(32).toString("hex");

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");
const source = await read("server/templates/admin.html");
const authorization = await import("../../server/adminAuthorization.ts");
const auth = await import("../../server/adminAuth.ts");
const types = await import("../../server/adminTypes.ts");

function requestFor(identity, method = "GET", path = "/api/admin/audit-log") {
  const token = auth.createSession(identity);
  return {
    method,
    path: path.replace(/^\/api\/admin/, "") || "/",
    headers: { authorization: `Bearer ${token}` },
  };
}

function responseProbe() {
  let statusCode = 200;
  let body;
  return {
    status(code) { statusCode = code; return this; },
    json(value) { body = value; return this; },
    get statusCode() { return statusCode; },
    get body() { return body; },
  };
}

// R-04: permissions are derived from the role, so an identity can no longer carry
// a permission its role does not grant. This fixture used to be an operations admin
// with "audit.read" appended by hand — a combination the server never mints and
// which the boundary now ignores. `audit.read` belongs to super_admin in
// ROLE_PERMISSIONS, so that is the role that exercises the allowed path. The test's
// subject is unchanged: the boundary lets audit.read through and stops everyone else.
const auditAdmin = {
  adminId: "audit-admin",
  username: "audit-admin",
  displayName: "Audit Admin",
  role: "super_admin",
  permissions: types.permissionsForRole("super_admin"),
};
const nonAuditAdmin = {
  adminId: "no-audit",
  username: "no-audit",
  displayName: "No Audit",
  role: "support_admin",
  permissions: types.permissionsForRole("support_admin").filter((p) => p !== "audit.read"),
};

test("Sprint 8 — standalone nav item is guarded by audit.read", () => {
  assert.match(source, /data-admin-permission="audit\.read"[\s\S]*showSection\('auditLog', this\)/);
  assert.match(source, /id="auditLog-section" class="section"/);
});

test("Sprint 8 — backend maps audit-log reads to audit.read", () => {
  assert.equal(authorization.permissionForAdminRequest("GET", "/audit-log"), "audit.read");
});

test("Sprint 8 — authorized admin can pass the backend boundary", () => {
  const res = responseProbe();
  let nextCalled = false;
  authorization.createAdminAuthorizationBoundary()(requestFor(auditAdmin), res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
});

test("Sprint 8 — admin without audit.read is denied by backend", () => {
  const res = responseProbe();
  let nextCalled = false;
  authorization.createAdminAuthorizationBoundary()(requestFor(nonAuditAdmin), res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.permission, "audit.read");
});

test("Sprint 8 — audit UI calls the real backend filters and pagination", () => {
  assert.match(source, /\$\{API_BASE\}\/admin\/audit-log/);
  assert.match(source, /params\.set\('actorUsername', actor\)/);
  assert.match(source, /params\.set\('actorId', actorId\)/);
  assert.match(source, /params\.set\('action', action\)/);
  assert.match(source, /params\.set\('from', auditDateQueryValue\(from\)\)/);
  assert.match(source, /params\.set\('to', auditDateQueryValue\(to\)\)/);
  assert.match(source, /page: String\(auditLogState\.page\), pageSize: String\(auditLogState\.pageSize\)/);
  assert.match(source, /Boolean\(data\.hasMore\)/);
});

test("Sprint 8 — loading, empty, error and retry states are explicit", () => {
  assert.match(source, /جارٍ تحميل سجل التدقيق/);
  assert.match(source, /لا توجد سجلات مطابقة/);
  assert.match(source, /تعذّر تحميل سجل التدقيق/);
  assert.match(source, /onclick="loadAuditLog\(\)"/);
  assert.match(source, /auditLogState\.loading/);
});

test("Sprint 8 — details modal is read-only and exposes audit fields", () => {
  assert.match(source, /id="audit-log-details-modal"/);
  assert.match(source, /openAuditLogDetails\('/);
  for (const id of ["audit-detail-metadata", "audit-detail-before", "audit-detail-after"]) {
    assert.match(source, new RegExp(`id="${id}"`));
  }
  assert.match(source, /هذا العرض للقراءة فقط/);
  assert.doesNotMatch(source, /audit-detail.*(input|textarea|contenteditable)/i);
});

test("Sprint 8 — sensitive audit keys are scrubbed again before details render", () => {
  assert.match(source, /const AUDIT_SENSITIVE_KEY = \/\(password\|passwd\|secret\|token/);
  assert.match(source, /auditEntries = new Map|auditLogEntries = new Map/);
  assert.match(source, /auditSanitizeValue\(entry\)/);
  assert.match(source, /metadata\.textContent = auditFormatValue\(entry\.metadata\)/);
  assert.match(source, /before\.textContent = auditFormatValue\(entry\.before\)/);
  assert.match(source, /after\.textContent = auditFormatValue\(entry\.after\)/);
});

test("Sprint 8 — audit section remains read-only with no mutation controls", () => {
  const section = source.match(/<div id="auditLog-section"[\s\S]*?<\/div>\s*\n\s*<!-- ═+ SETTLEMENT REQUESTS/)[0];
  assert.doesNotMatch(section, /method\s*:\s*['"](POST|PUT|PATCH|DELETE)['"]/i);
  assert.doesNotMatch(section, /contenteditable|onclick="(?:delete|edit|clear|remove)[^"(]*/i);
  assert.match(section, /type="button"/);
});

test("Sprint 8 — backend audit route is still read-only and paginated", async () => {
  const routes = await read("server/routes.ts");
  const route = routes.match(/app\.get\("\/api\/admin\/audit-log"[\s\S]*?\n\s*\}\);/)[0];
  assert.match(route, /listAuditLog\(filter/);
  assert.match(route, /pageSize/);
  assert.match(route, /hasMore/);
  assert.doesNotMatch(route, /app\.(post|put|patch|delete)\("\/api\/admin\/audit-log"/);
});
