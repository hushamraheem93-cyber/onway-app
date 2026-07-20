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
// Fix: sessions are now self-verifying JWTs signed with JWT_SECRET. The server
// verifies the signature on each request — no in-memory state required — so
// restarts do NOT invalidate existing admin sessions.
//
// Explicit logout / password-reset invalidation: a small in-memory revocation
// set holds jti values of explicitly logged-out tokens, and a revokedBefore
// timestamp rejects all tokens issued before a password reset. Both are
// in-memory (cleared on restart), which is acceptable: a logged-out mobile
// client clears its own token, and a password reset is a rare admin action.
import type { Request } from "express";
import * as crypto from "crypto";
import jwt from "jsonwebtoken";

export const ADMIN_COOKIE = "onway_admin_session";

const SESSION_TTL_SECS = 7 * 24 * 60 * 60; // 7 days

// Revocation: per-token jti set + a "revoke all issued before" timestamp.
const revokedJtis = new Set<string>();
let revokedBefore = 0; // epoch ms — tokens with iat*1000 < revokedBefore are invalid

function getJwtSecret(): string {
  return process.env.JWT_SECRET || "dev-admin-secret-not-for-production";
}

export function createSession(username: string): string {
  const jti = crypto.randomBytes(16).toString("hex");
  return jwt.sign(
    { username, type: "admin", jti },
    getJwtSecret(),
    { expiresIn: SESSION_TTL_SECS }
  );
}

export function invalidateSession(token: string | undefined | null): void {
  if (!token) return;
  try {
    const decoded = jwt.decode(token) as any;
    if (decoded?.jti) revokedJtis.add(decoded.jti);
  } catch { /* ignore malformed tokens */ }
}

export function invalidateAllSessions(): void {
  revokedJtis.clear();
  revokedBefore = Date.now();
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
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as any;
    if (decoded?.type !== "admin") return false;
    // Check per-token revocation
    if (decoded.jti && revokedJtis.has(decoded.jti)) return false;
    // Check "revoke all before" timestamp (password reset)
    if (revokedBefore > 0 && (decoded.iat || 0) * 1000 < revokedBefore) return false;
    return true;
  } catch {
    return false;
  }
}
