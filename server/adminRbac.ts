import type { Express, Request, Response } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import admin from "firebase-admin";
import { getFirestore } from "./firebase";
import { recordAudit } from "./financialLedger";
import { getAdminIdentity, invalidateSessionsForAdmin } from "./adminAuth";
import {
  ADMIN_PERMISSIONS,
  ADMIN_ROLES,
  AdminIdentity,
  AdminRole,
  AdminUserRecord,
  ROLE_LABELS_AR,
  identityFromClaims,
  identityFromRecord,
  isAdminRole,
  permissionsForRole,
} from "./adminTypes";

export const ADMIN_USERS_COLLECTION = "adminUsers";
export const ADMIN_RBAC_STATE_DOC = "adminConfig/rbacState";

function now(): admin.firestore.Timestamp {
  return admin.firestore.Timestamp.now();
}

function normalizeUsername(value: string): string {
  return String(value || "").trim().toLowerCase();
}

function adminIdForUsername(username: string): string {
  return `admin_${crypto.createHash("sha256").update(normalizeUsername(username)).digest("hex").slice(0, 24)}`;
}

function publicUser(record: AdminUserRecord): Omit<AdminUserRecord, "passwordHash"> {
  const { passwordHash: _passwordHash, ...safe } = record;
  return safe;
}

export function hashAdminPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export function verifyAdminPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

function recordFromDoc(doc: any): AdminUserRecord | null {
  if (!doc?.exists) return null;
  const data = doc.data() as Partial<AdminUserRecord>;
  if (!data.adminId || !data.username || !data.role || !isAdminRole(data.role)) return null;
  return {
    adminId: String(data.adminId),
    username: String(data.username),
    usernameNormalized: String(data.usernameNormalized || normalizeUsername(String(data.username))),
    displayName: String(data.displayName || data.username),
    ...(data.email ? { email: String(data.email) } : {}),
    passwordHash: String(data.passwordHash || ""),
    role: data.role,
    permissions: Array.isArray(data.permissions) ? data.permissions.map(String) : permissionsForRole(data.role),
    isActive: data.isActive !== false,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    ...(data.lastLoginAt ? { lastLoginAt: data.lastLoginAt } : {}),
  };
}

export async function getAdminUserById(adminId: string): Promise<AdminUserRecord | null> {
  const db = getFirestore();
  if (!db || !adminId) return null;
  return recordFromDoc(await db.collection(ADMIN_USERS_COLLECTION).doc(adminId).get());
}

export async function getAdminUserByUsername(username: string): Promise<AdminUserRecord | null> {
  const db = getFirestore();
  if (!db) return null;
  const normalized = normalizeUsername(username);
  if (!normalized) return null;
  const snap = await db.collection(ADMIN_USERS_COLLECTION)
    .where("usernameNormalized", "==", normalized).limit(1).get();
  return snap.empty ? null : recordFromDoc(snap.docs[0]);
}

export async function getAdminUserByEmail(email: string): Promise<AdminUserRecord | null> {
  const db = getFirestore();
  if (!db || !email) return null;
  const snap = await db.collection(ADMIN_USERS_COLLECTION).where("email", "==", String(email).trim().toLowerCase()).limit(1).get();
  return snap.empty ? null : recordFromDoc(snap.docs[0]);
}

export async function authenticateGoogleAdmin(email: string): Promise<AdminIdentity | null> {
  const existing = await getAdminUserByEmail(email);
  if (existing) return existing.isActive ? identityFromRecord(existing) : null;
  if (await hasAnyAdminUsers()) return null;
  const db = getFirestore();
  if (!db) return null;
  const adminId = adminIdForUsername(email);
  const timestamp = now();
  const bootstrapPasswordHash = await hashAdminPassword(crypto.randomBytes(32).toString("hex"));
  const ref = db.collection(ADMIN_USERS_COLLECTION).doc(adminId);
  const stateRef = db.collection("adminConfig").doc("rbacState");
  let identity: AdminIdentity | null = null;
  await db.runTransaction(async (tx: any) => {
    const [state, user] = await Promise.all([tx.get(stateRef), tx.get(ref)]);
    if (state.exists || user.exists) return;
    const next: AdminUserRecord = {
      adminId,
      username: String(email).trim(),
      usernameNormalized: normalizeUsername(email),
      displayName: String(email).trim(),
      email: String(email).trim().toLowerCase(),
      passwordHash: bootstrapPasswordHash,
      role: "super_admin",
      permissions: permissionsForRole("super_admin"),
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastLoginAt: timestamp,
    };
    tx.set(ref, next);
    tx.set(stateRef, { enabled: true, migratedFromSharedAdmin: true, bootstrapAdminId: adminId, migratedAt: timestamp });
    identity = identityFromRecord(next);
  });
  const googleIdentity = identity as AdminIdentity | null;
  if (googleIdentity) {
    await recordAudit({
      action: "admin.google_bootstrap",
      actorType: "admin",
      actorId: googleIdentity.adminId,
      actorUsername: googleIdentity.username,
      actorRole: googleIdentity.role,
      targetType: "adminUser",
      targetId: googleIdentity.adminId,
      metadata: { source: "google" },
    });
  }
  return googleIdentity;
}

export async function hasAnyAdminUsers(): Promise<boolean> {
  const db = getFirestore();
  if (!db) return false;
  const snap = await db.collection(ADMIN_USERS_COLLECTION).limit(1).get();
  return !snap.empty;
}

export async function authenticateAdmin(
  username: string,
  password: string,
  legacyValidator: () => Promise<boolean>,
): Promise<{ identity: AdminIdentity; migrated: boolean } | null> {
  const existing = await getAdminUserByUsername(username);
  if (existing) {
    if (!existing.isActive || !existing.passwordHash) return null;
    if (!(await verifyAdminPassword(password, existing.passwordHash))) return null;
    const db = getFirestore();
    if (db) await db.collection(ADMIN_USERS_COLLECTION).doc(existing.adminId).update({ lastLoginAt: now(), updatedAt: now() }).catch(() => {});
    return { identity: identityFromRecord(existing), migrated: false };
  }

  // Bootstrap-only compatibility: the old environment credentials can create the
  // first Super Admin, but cannot authenticate after the first Admin User exists.
  if (await hasAnyAdminUsers()) return null;
  if (!(await legacyValidator())) return null;
  const db = getFirestore();
  if (!db) return null;
  const normalized = normalizeUsername(username);
  const adminId = adminIdForUsername(username);
  const userRef = db.collection(ADMIN_USERS_COLLECTION).doc(adminId);
  const stateRef = db.collection("adminConfig").doc("rbacState");
  const passwordHash = await hashAdminPassword(password);
  const timestamp = now();
  let created = false;
  let record: AdminUserRecord | null = null;
  await db.runTransaction(async (tx: any) => {
    const state = await tx.get(stateRef);
    const user = await tx.get(userRef);
    if (user.exists) {
      record = recordFromDoc(user);
      return;
    }
    if (state.exists) return;
    const next: AdminUserRecord = {
      adminId,
      username: String(username).trim(),
      usernameNormalized: normalized,
      displayName: String(username).trim(),
      passwordHash,
      role: "super_admin",
      permissions: permissionsForRole("super_admin"),
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastLoginAt: timestamp,
    };
    tx.set(userRef, next);
    tx.set(stateRef, { enabled: true, migratedFromSharedAdmin: true, bootstrapAdminId: adminId, migratedAt: timestamp });
    record = next;
    created = true;
  });
  const migratedRecord = record as AdminUserRecord | null;
  if (!migratedRecord || !migratedRecord.isActive) return null;
  if (created) {
    await recordAudit({
      action: "admin.migrated_from_shared",
      actorType: "admin",
      actorId: migratedRecord.adminId,
      actorUsername: migratedRecord.username,
      actorRole: migratedRecord.role,
      targetType: "adminUser",
      targetId: migratedRecord.adminId,
      metadata: { source: "ADMIN_USERNAME/ADMIN_PASSWORD" },
    });
  }
  return { identity: identityFromRecord(migratedRecord), migrated: created };
}

export async function createAdminUser(input: {
  username: string;
  displayName: string;
  email?: string;
  password: string;
  role: AdminRole;
  actor: AdminIdentity;
}): Promise<AdminUserRecord> {
  const db = getFirestore();
  if (!db) throw new Error("Database unavailable");
  const username = String(input.username || "").trim();
  const normalized = normalizeUsername(username);
  if (normalized.length < 3) throw new Error("invalid_username");
  if (!input.password || input.password.length < 8) throw new Error("invalid_password");
  if (!isAdminRole(input.role)) throw new Error("invalid_role");
  if (await getAdminUserByUsername(username)) throw new Error("duplicate_username");
  const timestamp = now();
  const record: AdminUserRecord = {
    adminId: `admin_${crypto.randomBytes(12).toString("hex")}`,
    username,
    usernameNormalized: normalized,
    displayName: String(input.displayName || username).trim(),
    ...(input.email ? { email: String(input.email).trim() } : {}),
    passwordHash: await hashAdminPassword(input.password),
    role: input.role,
    permissions: permissionsForRole(input.role),
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await db.collection(ADMIN_USERS_COLLECTION).doc(record.adminId).create(record);
  await recordAudit({
    action: "admin.created",
    actorType: "admin",
    actorId: input.actor.adminId,
    actorUsername: input.actor.username,
    actorRole: input.actor.role,
    targetType: "adminUser",
    targetId: record.adminId,
    metadata: { username: record.username, role: record.role },
  });
  return record;
}

async function activeSuperAdminCount(): Promise<number> {
  const db = getFirestore();
  if (!db) return 0;
  const snap = await db.collection(ADMIN_USERS_COLLECTION).where("role", "==", "super_admin").get();
  return snap.docs.filter((doc: any) => doc.data()?.isActive !== false).length;
}

export async function updateAdminUser(input: {
  adminId: string;
  actor: AdminIdentity;
  username?: string;
  displayName?: string;
  email?: string;
  password?: string;
  role?: AdminRole;
  isActive?: boolean;
}): Promise<AdminUserRecord> {
  const db = getFirestore();
  if (!db) throw new Error("Database unavailable");
  const current = await getAdminUserById(input.adminId);
  if (!current) throw new Error("not_found");
  const nextRole = input.role ?? current.role;
  if (!isAdminRole(nextRole)) throw new Error("invalid_role");
  const nextActive = input.isActive ?? current.isActive;
  if (current.role === "super_admin" && current.isActive && (nextRole !== "super_admin" || !nextActive)) {
    if ((await activeSuperAdminCount()) <= 1) throw new Error("last_super_admin");
  }
  if (input.username !== undefined) {
    const duplicate = await getAdminUserByUsername(input.username);
    if (duplicate && duplicate.adminId !== current.adminId) throw new Error("duplicate_username");
  }
  const timestamp = now();
  const patch: Record<string, unknown> = {
    ...(input.username !== undefined ? { username: String(input.username).trim(), usernameNormalized: normalizeUsername(input.username) } : {}),
    ...(input.displayName !== undefined ? { displayName: String(input.displayName).trim() } : {}),
    ...(input.email !== undefined ? { email: String(input.email).trim() } : {}),
    ...(input.password ? { passwordHash: await hashAdminPassword(input.password) } : {}),
    role: nextRole,
    permissions: permissionsForRole(nextRole),
    isActive: nextActive,
    updatedAt: timestamp,
  };
  await db.collection(ADMIN_USERS_COLLECTION).doc(current.adminId).update(patch);
  const updated = await getAdminUserById(current.adminId);
  if (!updated) throw new Error("not_found");
  const action = input.role !== undefined && input.role !== current.role ? "admin.role_changed" :
    input.isActive !== undefined && input.isActive !== current.isActive ? "admin.activation_changed" : "admin.updated";
  await recordAudit({
    action,
    actorType: "admin",
    actorId: input.actor.adminId,
    actorUsername: input.actor.username,
    actorRole: input.actor.role,
    targetType: "adminUser",
    targetId: updated.adminId,
    metadata: { username: updated.username, role: updated.role, isActive: updated.isActive },
  });
  // R-01: end the sessions of the admin whose authority just changed — and only
  // theirs.
  //
  // The first version called invalidateAllSessions() after any edit, which signed
  // the acting admin out of their own panel; the button looked broken. That was
  // then narrowed to self-edits, which fixed the panel by giving up the security
  // property: disabling or demoting someone left their existing token working, with
  // its old permissions, for the seven days a session lives. A fired operations
  // admin kept working; a demoted finance admin could still approve settlements.
  //
  // Revoking by adminId is what both of those wanted. The target is signed out
  // immediately, the actor's own session is untouched, and a self-edit still ends
  // the editor's sessions because they are the target.
  if (input.role !== undefined || input.isActive !== undefined || input.password || input.username !== undefined) {
    invalidateSessionsForAdmin(current.adminId);
  }
  return updated;
}

export function registerAdminRbacRoutes(app: Express): void {
  app.get("/api/admin/permissions", (_req: Request, res: Response) => {
    res.json({ permissions: ADMIN_PERMISSIONS });
  });
  app.get("/api/admin/roles", (_req: Request, res: Response) => {
    res.json({ roles: ADMIN_ROLES.map((role) => ({ role, label: ROLE_LABELS_AR[role], permissions: permissionsForRole(role) })) });
  });
  app.get("/api/admin/admin-users", async (_req: Request, res: Response) => {
    try {
      const db = getFirestore();
      if (!db) return res.status(503).json({ error: "Database unavailable" });
      const snap = await db.collection(ADMIN_USERS_COLLECTION).orderBy("createdAt", "desc").get();
      return res.json({ users: snap.docs.map((doc: any) => publicUser(recordFromDoc(doc)!)).filter(Boolean) });
    } catch (error: any) {
      console.error("GET /api/admin/admin-users:", error?.message);
      return res.status(500).json({ error: "فشل تحميل المستخدمين الإداريين" });
    }
  });
  app.post("/api/admin/admin-users", async (req: Request, res: Response) => {
    try {
      const actor = getAdminIdentity(req);
      if (!actor) return res.status(401).json({ error: "غير مصرح" });
      const created = await createAdminUser({ ...req.body, actor });
      return res.status(201).json({ user: publicUser(created) });
    } catch (error: any) {
      const message = error?.message === "duplicate_username" ? "اسم المستخدم مستخدم مسبقاً" :
        error?.message === "invalid_password" ? "كلمة المرور يجب أن تكون 8 أحرف على الأقل" : "فشل إنشاء المستخدم الإداري";
      return res.status(error?.message === "duplicate_username" || error?.message === "invalid_password" ? 400 : 500).json({ error: message });
    }
  });
  app.patch("/api/admin/admin-users/:id", async (req: Request, res: Response) => {
    try {
      const actor = getAdminIdentity(req);
      if (!actor) return res.status(401).json({ error: "غير مصرح" });
      const updated = await updateAdminUser({ adminId: String(req.params.id), actor, ...req.body });
      return res.json({ user: publicUser(updated) });
    } catch (error: any) {
      const code = error?.message;
      const message = code === "last_super_admin" ? "لا يمكن تعطيل أو تخفيض آخر مدير عام" :
        code === "duplicate_username" ? "اسم المستخدم مستخدم مسبقاً" : "فشل تحديث المستخدم الإداري";
      return res.status(code === "not_found" ? 404 : code === "last_super_admin" || code === "duplicate_username" ? 400 : 500).json({ error: message });
    }
  });
  app.post("/api/admin/admin-users/:id/activate", async (req: Request, res: Response) => {
    req.body = { ...(req.body || {}), isActive: true };
    return updateAdminUserRoute(req, res);
  });
  app.post("/api/admin/admin-users/:id/deactivate", async (req: Request, res: Response) => {
    req.body = { ...(req.body || {}), isActive: false };
    return updateAdminUserRoute(req, res);
  });
}

async function updateAdminUserRoute(req: Request, res: Response): Promise<Response> {
  try {
    const actor = getAdminIdentity(req);
    if (!actor) return res.status(401).json({ error: "غير مصرح" });
    const updated = await updateAdminUser({ adminId: String(req.params.id), actor, ...req.body });
    return res.json({ user: publicUser(updated) });
  } catch (error: any) {
    const code = error?.message;
    return res.status(code === "not_found" ? 404 : code === "last_super_admin" ? 400 : 500).json({ error: "فشل تحديث حالة المستخدم الإداري" });
  }
}

/**
 * Second entry point for the same job as adminTypes.identityFromClaims, kept for
 * callers outside this module. It delegates rather than reimplementing: it carried
 * its own copy of the claim-list logic R-04 removed, so two places decided what an
 * admin may do and only one of them was ever fixed.
 */
export function adminIdentityFromClaims(claims: any): AdminIdentity | null {
  return identityFromClaims(claims);
}
