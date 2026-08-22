// Single shared admin-session store.
//
// PREVIOUS BUG (2026-07-04): THREE separate session implementations existed —
// all checking the same cookie but expecting different formats. Fixed by
// consolidating into this single file.
//
// PREVIOUS BUG (2026-07-19): Sessions were stored in an in-memory Map. Every
// server restart wiped all sessions, causing every subsequent admin action
// (approve driver, update order, etc.) to silently return 401 — the mobile
// admin app had no onError handlers so the user saw nothing happen.
//
// Fix: sessions are now self-verifying JWTs signed with SESSION_SECRET. The server
// verifies the signature on each request — no in-memory state required — so
// restarts do NOT invalidate existing admin sessions. A JWT_SECRET fallback remains
// only for older test/development environments that have not provisioned SESSION_SECRET.
//
// PREVIOUS BUG (2026-07-25): revocation was in-memory only, so it did not survive
// a restart — while the tokens it had to outlive live for 7 days. JWT_SECRET does
// not change on restart, so after any restart a stolen admin cookie verified again.
// `max_memory_restart: 512M` guarantees restarts happen. invalidateAllSessions()
// exists precisely so a leaked cookie dies on password reset, and it did not.
//
// Fix: revocation state is persisted to Firestore (adminConfig/sessionRevocation,
// backend-only per firestore.rules) and hydrated into memory during boot, before
// the server accepts requests. Reads stay synchronous — isValidSession is called
// from middleware on every admin request — while the durable copy is the source of
// truth across restarts.
import type { Request } from "express";
import * as crypto from "crypto";
import jwt from "jsonwebtoken";
import { getFirestore } from "./firebase";
import { JWT_VERIFY_OPTS } from "./orderValidation";
import type { AdminIdentity } from "./adminTypes";
import { identityFromClaims } from "./adminTypes";

export const ADMIN_COOKIE = "onway_admin_session";

const SESSION_TTL_SECS = 7 * 24 * 60 * 60; // 7 days

const REVOCATION_COLLECTION = "adminConfig";
const REVOCATION_DOC = "sessionRevocation";

// Revocation: per-token jti → token expiry (epoch ms), plus a "revoke all issued
// before" timestamp. Expiry is tracked so the persisted set can be pruned; a jti
// whose token has already expired can never be presented again.
const revokedJtis = new Map<string, number>();
let revokedBefore = 0; // epoch ms — tokens with iat*1000 < revokedBefore are invalid

/**
 * Load persisted revocation state into memory. Call once during boot, BEFORE the
 * server starts listening, so no request is served with an empty revocation set.
 */
export async function loadRevocationState(): Promise<void> {
  try {
    const db = getFirestore();
    if (!db) return;
    const snap = await db.collection(REVOCATION_COLLECTION).doc(REVOCATION_DOC).get();
    if (!snap.exists) return;
    const data = snap.data() as any;
    revokedBefore = Number(data?.revokedBefore) || 0;
    const now = Date.now();
    revokedJtis.clear();
    for (const [jti, expiresAt] of Object.entries(data?.jtis || {})) {
      if (Number(expiresAt) > now) revokedJtis.set(jti, Number(expiresAt));
    }
    console.log(`[ADMIN] Loaded session revocation state (${revokedJtis.size} revoked token(s)).`);
  } catch (err: any) {
    // Do not fail the boot: an unreachable Firestore would otherwise take the whole
    // server down. The condition is logged loudly because it degrades revocation.
    console.error("[ADMIN] Could not load session revocation state:", err?.message);
  }
}

/** Persist the in-memory state, pruning entries whose tokens have already expired. */
function persistRevocationState(): void {
  const db = getFirestore();
  if (!db) return;
  const now = Date.now();
  const jtis: Record<string, number> = {};
  for (const [jti, expiresAt] of revokedJtis) {
    if (expiresAt > now) jtis[jti] = expiresAt;
    else revokedJtis.delete(jti);
  }
  db.collection(REVOCATION_COLLECTION)
    .doc(REVOCATION_DOC)
    .set({ revokedBefore, jtis, updatedAt: now }, { merge: false })
    .catch((err: any) => console.error("[ADMIN] Could not persist session revocation:", err?.message));
}

function getJwtSecret(): string {
  // Admin sessions have their own rotation boundary. Rotating SESSION_SECRET
  // invalidates every admin cookie without rotating customer/vendor/driver tokens.
  // The JWT_SECRET fallback preserves compatibility for legacy test/dev invocations;
  // production deployment requires SESSION_SECRET in the environment template.
  const secret = process.env.SESSION_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET environment variable is required but not set.");
  }
  return secret;
}

export function createSession(username: string): string;
export function createSession(identity: AdminIdentity): string;
export function createSession(usernameOrIdentity: string | AdminIdentity): string {
  const jti = crypto.randomBytes(16).toString("hex");
  const identity = typeof usernameOrIdentity === "string" ? null : usernameOrIdentity;
  const username = typeof usernameOrIdentity === "string" ? usernameOrIdentity : usernameOrIdentity.username;
  const claims = identity
    ? {
        adminId: identity.adminId,
        username: identity.username,
        displayName: identity.displayName,
        ...(identity.email ? { email: identity.email } : {}),
        role: identity.role,
        permissions: identity.permissions,
        type: "admin" as const,
        jti,
      }
    : {
        adminId: `legacy_${crypto.createHash("sha256").update(username).digest("hex").slice(0, 24)}`,
        username,
        displayName: username,
        role: "super_admin" as const,
        permissions: ["*"],
        type: "admin" as const,
        jti,
      };
  return jwt.sign(claims, getJwtSecret(), { expiresIn: SESSION_TTL_SECS });
}

export function invalidateSession(token: string | undefined | null): void {
  if (!token) return;
  try {
    const decoded = jwt.decode(token) as any;
    if (!decoded?.jti) return;
    // Remember when this token would have expired anyway, so the persisted set can
    // be pruned instead of growing forever.
    const expiresAt = decoded.exp ? decoded.exp * 1000 : Date.now() + SESSION_TTL_SECS * 1000;
    revokedJtis.set(decoded.jti, expiresAt);
    persistRevocationState();
  } catch { /* ignore malformed tokens */ }
}

export function invalidateAllSessions(): void {
  revokedJtis.clear();
  revokedBefore = Date.now();
  persistRevocationState();
}

/** Lightweight cookie parser — avoids importing express middleware here. */
function parseCookieHeader(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  (header || "").split(";").forEach((part) => {
    const [k, ...v] = part.trim().split("=");
    if (k) cookies[k.trim()] = decodeURIComponent(v.join("=").trim());
  });
  return cookies;
}

/**
 * Is the admin SESSION COOKIE present on this request?
 *
 * Distinct from getSessionToken(), which also accepts a Bearer header. The CSRF
 * guard needs to know specifically whether a browser-attached ambient credential
 * is in play, because that is the only credential CSRF can abuse.
 */
export function hasAdminSessionCookie(req: Request): boolean {
  const parsed = (req as any).cookies || parseCookieHeader(req.headers.cookie);
  return typeof parsed?.[ADMIN_COOKIE] === "string" && parsed[ADMIN_COOKIE].length > 0;
}

export function getSessionToken(req: Request): string | undefined {
  const parsed = (req as any).cookies || parseCookieHeader(req.headers.cookie);
  const raw = parsed?.[ADMIN_COOKIE];
  if (raw) return raw;
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return undefined;
}

/**
 * The signed-in admin's username, taken from the session token — never from the
 * request body.
 *
 * Financial audit records must name who performed the movement (H-07). The admin
 * panel never sent an `adminName` field at all, so every manual balance adjustment
 * was attributed to "". Returns "" when there is no valid session; callers behind
 * requireAdminAuth always have one.
 */
export function getSessionClaims(req: Request): any | null {
  const token = getSessionToken(req);
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, getJwtSecret(), JWT_VERIFY_OPTS) as any;
    if (decoded?.type !== "admin") return null;
    if (decoded.jti && revokedJtis.has(decoded.jti)) return null;
    if (revokedBefore > 0 && (decoded.iat || 0) * 1000 < revokedBefore) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function getAdminIdentity(req: Request): AdminIdentity | null {
  return identityFromClaims(getSessionClaims(req));
}

export function getSessionUsername(req: Request): string {
  const claims = getSessionClaims(req);
  return typeof claims?.username === "string" ? claims.username : "";
}

export function isValidSession(req: Request): boolean {
  return getSessionClaims(req) !== null;
}
