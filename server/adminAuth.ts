// Single shared admin-session store.
//
// FOUND DURING TESTING (2026-07-04): there were THREE separate, independent
// implementations of admin-session validation in this codebase — one in
// index.ts (which had already been upgraded to real per-login random tokens),
// and two older duplicates in routes.ts (isAdminSessionValid) and vendor.ts
// (isAdminSession) that still computed a fixed deterministic value from
// ADMIN_USERNAME/ADMIN_PASSWORD. Because all three checked the exact same
// cookie name ("onway_admin_session") but expected DIFFERENT token formats,
// a real admin login (which now sets a random session token) was accepted by
// index.ts's own routes but REJECTED by every /api/admin/* route in routes.ts
// and every /api/admin/vendor-partners route in vendor.ts — the admin panel's
// core buttons (assign driver, update order status, vendor/driver lists) were
// silently broken for any real login.
//
// Fix: index.ts, routes.ts, and vendor.ts must all import the SAME functions
// from this one file. There must never be a second implementation of this logic.
import type { Request } from "express";
import * as crypto from "crypto";

export const ADMIN_COOKIE = "onway_admin_session";

interface AdminSession { username: string; expiresAt: number; }
const adminSessions = new Map<string, AdminSession>();
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function createSession(username: string): string {
  const token = crypto.randomBytes(32).toString("hex");
  adminSessions.set(token, { username, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

export function invalidateSession(token: string | undefined | null): void {
  if (token) adminSessions.delete(token);
}

export function invalidateAllSessions(): void {
  adminSessions.clear();
}

/** Lightweight cookie parser — duplicated intentionally to avoid importing express-level
 *  request-parsing middleware here; matches the parser already used across the codebase. */
function parseCookieHeader(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  (header || "").split(";").forEach((part) => {
    const [k, ...v] = part.trim().split("=");
    if (k) cookies[k.trim()] = decodeURIComponent(v.join("=").trim());
  });
  return cookies;
}

export function getSessionToken(req: Request): string | undefined {
  const parsed = (req as any).cookies || parseCookieHeader(req.headers.cookie);
  const raw = parsed?.[ADMIN_COOKIE];
  if (raw) return raw;
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return undefined;
}

export function isValidSession(req: Request): boolean {
  const token = getSessionToken(req);
  if (!token) return false;
  const session = adminSessions.get(token);
  if (!session) return false;
  if (Date.now() > session.expiresAt) {
    adminSessions.delete(token);
    return false;
  }
  return true;
}
