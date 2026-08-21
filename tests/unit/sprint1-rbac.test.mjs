import { describe, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.JWT_SECRET ??= crypto.randomBytes(32).toString("hex");

const types = await import("../../server/adminTypes.ts");
const auth = await import("../../server/adminAuth.ts");
const authorization = await import("../../server/adminAuthorization.ts");
const ledger = await import("../../server/financialLedger.ts");

function requestFor(identity, method = "GET", path = "/api/admin/session") {
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
  const listeners = {};
  return {
    status(code) { statusCode = code; return this; },
    json(value) { body = value; return this; },
    once(event, fn) { listeners[event] = fn; return this; },
    get statusCode() { return statusCode; },
    get body() { return body; },
    finish() { listeners.finish?.(); },
  };
}

const identities = {
  super: { adminId: "admin-super", username: "super", displayName: "Super", role: "super_admin", permissions: ["*"] },
  operations: { adminId: "admin-ops", username: "ops", displayName: "Operations", role: "operations_admin", permissions: types.permissionsForRole("operations_admin") },
  finance: { adminId: "admin-fin", username: "finance", displayName: "Finance", role: "finance_admin", permissions: types.permissionsForRole("finance_admin") },
  support: { adminId: "admin-support", username: "support", displayName: "Support", role: "support_admin", permissions: types.permissionsForRole("support_admin") },
};

describe("Sprint 1 — RBAC matrix", () => {
  test("roles have explicit permissions and only Super Admin has wildcard", () => {
    assert.deepEqual(types.ROLE_PERMISSIONS.super_admin, ["*"]);
    for (const role of ["operations_admin", "finance_admin", "support_admin", "catalog_admin"]) {
      assert.ok(types.ROLE_PERMISSIONS[role].length > 0);
      assert.equal(types.ROLE_PERMISSIONS[role].includes("*"), false);
    }
  });

  test("Operations Admin is denied settlement approval by backend boundary", () => {
    const req = requestFor(identities.operations, "POST", "/api/admin/settlements/approve");
    const res = responseProbe();
    let nextCalled = false;
    authorization.createAdminAuthorizationBoundary()(req, res, () => { nextCalled = true; });
    assert.equal(res.statusCode, 403);
    assert.equal(nextCalled, false);
    assert.equal(res.body.permission, "settlements.approve");
  });

  test("Finance Admin is allowed to approve settlements and denied driver management", () => {
    const guard = authorization.createAdminAuthorizationBoundary();
    const approveRes = responseProbe();
    let approveNext = false;
    guard(requestFor(identities.finance, "POST", "/api/admin/settlements/approve"), approveRes, () => { approveNext = true; });
    assert.equal(approveNext, true);
    const driverRes = responseProbe();
    let driverNext = false;
    guard(requestFor(identities.finance, "PUT", "/api/admin/drivers/d-1/status"), driverRes, () => { driverNext = true; });
    assert.equal(driverNext, false);
    assert.equal(driverRes.statusCode, 403);
  });

  test("unknown Admin paths fail closed for non-Super Admin", () => {
    const res = responseProbe();
    let nextCalled = false;
    authorization.createAdminAuthorizationBoundary()(requestFor(identities.operations, "POST", "/api/admin/future-danger"), res, () => { nextCalled = true; });
    assert.equal(res.statusCode, 403);
    assert.equal(nextCalled, false);
  });

  test("Admin identity is recovered from signed session claims", () => {
    const req = requestFor(identities.finance);
    assert.deepEqual(auth.getAdminIdentity(req), identities.finance);
    assert.equal(auth.getSessionUsername(req), "finance");
  });
});

describe("Sprint 1 — Audit identity and secret scrubbing", () => {
  test("audit persistence stores actor identity, resource aliases and sanitized before/after", async () => {
    let saved;
    const db = { collection() { return { add: async (value) => { saved = value; } }; } };
    await ledger.recordAudit({
      action: "settlement.complete",
      actorId: "admin-fin",
      actorUsername: "finance",
      actorRole: "finance_admin",
      resourceType: "driver",
      resourceId: "drv-1",
      before: { outstandingTotal: 1000, password: "must-not-appear" },
      after: { outstandingTotal: 500, token: "must-not-appear" },
      metadata: { reason: "correction", apiKey: "must-not-appear" },
    }, db);
    assert.equal(saved.actorId, "admin-fin");
    assert.equal(saved.actorUsername, "finance");
    assert.equal(saved.actorRole, "finance_admin");
    assert.equal(saved.resourceType, "driver");
    assert.equal(saved.resourceId, "drv-1");
    assert.deepEqual(saved.before, { outstandingTotal: 1000 });
    assert.deepEqual(saved.after, { outstandingTotal: 500 });
    assert.deepEqual(saved.metadata, { reason: "correction" });
  });
});

describe("Sprint 1 — endpoint mapping", () => {
  test("financial operations have distinct permissions", () => {
    assert.equal(authorization.permissionForAdminRequest("POST", "/approve"), "system.maintenance");
    assert.equal(authorization.permissionForAdminRequest("POST", "/settlements/approve"), "settlements.approve");
    assert.equal(authorization.permissionForAdminRequest("POST", "/settlements/reject"), "settlements.reject");
    assert.equal(authorization.permissionForAdminRequest("POST", "/settlements/complete"), "settlements.complete");
    assert.equal(authorization.permissionForAdminRequest("POST", "/driver-wallet/adjustment"), "wallet_adjustments.create");
  });
});
