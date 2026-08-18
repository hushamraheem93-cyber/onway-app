/**
 * H-79 — one boundary for every administrative route.
 *
 * `app.use("/api/admin", requireAdminAuth)` lived inside registerRoutes(), and
 * Express matches middleware in REGISTRATION order. index.ts registers the admin
 * auth endpoints (configureExpoAndLanding) and mounts vendorRouter — sixteen
 * `/api/admin/*` routes between them — BEFORE registerRoutes() ever runs. Those
 * sixteen therefore never passed through the guard at all: each one was
 * protected only by an `isValidSession` call someone remembered to write inside
 * the handler, or by a per-route `requireAdmin` in vendor.ts.
 *
 * Nothing was reachable without a session when this was written — every one of
 * the sixteen does carry its own check — but the protection was a convention,
 * not a boundary. The next `/api/admin/*` route added to index.ts or vendor.ts,
 * or to any router mounted before registerRoutes(), is public by default and
 * nothing fails to tell anyone.
 *
 * This module is that boundary. It is mounted in index.ts before ANY module
 * registers a route, so an admin path is guarded by virtue of its path rather
 * than by where its handler happens to live.
 *
 * The per-route checks are deliberately left in place. They are now redundant,
 * and redundant is the correct state for an authorisation check: if this mount
 * is ever moved or dropped, they are what stands between an admin endpoint and
 * the internet.
 */
import type { Request, Response } from "express";
import type express from "express";

/**
 * Admin paths that must stay reachable without a session, expressed relative to
 * the `/api/admin` mount point.
 *
 * This list is the ONLY way to be public, and it is deliberately tiny:
 *
 *   /login   — mints the session; requiring one to get one is a deadlock.
 *   /logout  — must work when the session is already expired or invalid,
 *              otherwise a stale client can never clear its own cookie.
 *
 * `/session` and `/credentials-info` are NOT here: they answer 401 for an
 * invalid session today and continue to, now via this boundary.
 */
export const PUBLIC_ADMIN_SUBPATHS: readonly string[] = ["/login", "/logout"];

/**
 * Normalise a mount-relative path for comparison.
 *
 * Express routing is case-insensitive and ignores a trailing slash by default,
 * so `/Login`, `/login/` and `/login` all reach the same handler. Comparing the
 * raw string would let `/LOGIN/` skip the check on a path the router still
 * resolves — the same class of bypass H-69 closed on the rate limiter.
 */
export function normalizeAdminPath(path: string): string {
  const lower = String(path || "").toLowerCase();
  const trimmed = lower.length > 1 ? lower.replace(/\/+$/, "") : lower;
  return trimmed === "" ? "/" : trimmed;
}

export function isPublicAdminPath(path: string): boolean {
  return PUBLIC_ADMIN_SUBPATHS.includes(normalizeAdminPath(path));
}

/**
 * The boundary itself.
 *
 * `isValidSession` is injected rather than imported so this module has no
 * dependency on where session state lives, and so the boundary can be exercised
 * directly in tests without standing up the whole server.
 *
 * Fails closed: anything that is not an explicitly public subpath, and does not
 * present a valid admin session, is refused. A malformed or absent credential
 * takes the same path as a wrong one.
 */
export function createAdminBoundary(
  isValidSession: (req: Request) => boolean,
): (req: Request, res: Response, next: express.NextFunction) => void {
  return function adminBoundary(req, res, next) {
    if (isPublicAdminPath(req.path)) return next();
    if (!isValidSession(req)) {
      return res.status(401).json({ error: "غير مصرح" });
    }
    next();
  };
}
