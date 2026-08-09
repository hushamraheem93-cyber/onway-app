import type { Request, Response, NextFunction } from "express";

// ── Origin allow-listing + CSRF origin validation ────────────────────────────
//
// Pure, dependency-free decision logic shared by the CORS middleware (index.ts)
// and the admin CSRF guard (routes.ts). Kept separate from Express so the rules
// are unit-testable without booting a server.
//
// WHY THIS EXISTS (audit finding C-12)
// ────────────────────────────────────
// The old CORS check was:
//
//     const allowed = !isProd || isReplitOwnDomain || (allowedDomains.length > 0 && …)
//
// so whenever NODE_ENV was not the exact string "production" — unset, "Production",
// "prod", or simply lost when PM2 replayed a saved env — EVERY origin was reflected
// back with `Access-Control-Allow-Credentials: true`. A reflected origin is worse
// than `*` here: browsers refuse to send credentials to `*`, but they happily send
// the admin's session cookie to a reflected attacker origin. One wrong environment
// variable therefore exposed all of /api/admin/* to any website the admin visited.
//
// The rules below never consult NODE_ENV. An origin is allowed because it is the
// server's own origin, because an operator listed it, or because it is a loopback /
// private-LAN address that cannot be an attacker's public site — never because of
// what environment we think we are in.

/**
 * The origin THIS request was addressed to, e.g. "https://onwayiq.com".
 *
 * Built from the Host header plus the forwarded protocol — nginx passes both
 * (`proxy_set_header Host $host` / `X-Forwarded-Proto $scheme`), so this is the
 * PUBLIC origin rather than the internal one. A browser sets Host to the host it
 * actually contacted and sets Origin itself, so comparing the two is a sound
 * same-origin test: a page on evil.com cannot make the browser claim either.
 */
export function selfOriginFromHeaders(
  host: string | undefined,
  forwardedProto: string | undefined,
  fallbackProtocol?: string,
): string | null {
  if (!host) return null;
  // A proxy may send a list ("https,http"); the client-facing value is first.
  const proto = (forwardedProto || fallbackProtocol || "http").split(",")[0].trim();
  return `${proto === "https" ? "https" : "http"}://${host.toLowerCase()}`;
}

/** Split and clean an ALLOWED_ORIGINS-style env var. */
export function parseOriginList(raw: string | undefined): string[] {
  return (raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Hostname of an origin string, or null when it is not a parsable absolute URL. */
function hostnameOf(origin: string): string | null {
  try {
    const u = new URL(origin);
    if (!u.protocol.startsWith("http")) return null;
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Loopback and RFC1918 private addresses.
 *
 * These are allowed in every environment on purpose: a developer's machine is not
 * a site an attacker can publish, and gating them on NODE_ENV is exactly the
 * pattern this fix removes. They are still NOT trusted for cookie-authenticated
 * state changes — see isAdminCsrfAllowed, which requires same-origin or an
 * explicitly configured origin.
 *
 * Set CORS_ALLOW_LOCAL=false to switch this off entirely.
 */
export function isLocalOrigin(origin: string): boolean {
  const host = hostnameOf(origin);
  if (!host) return false;
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "127.0.0.1" || host === "::1" || host === "[::1]") return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  return false;
}

/**
 * Does `origin` match one configured allow-list entry?
 *
 * An entry WITH a scheme ("https://onwayiq.com") matches that exact origin only.
 * A bare domain ("onwayiq.com") matches either scheme and any subdomain.
 *
 * Matching is done on the parsed hostname, never with a substring test: the old
 * `origin.endsWith("." + d)` form compared raw strings including the scheme, so a
 * scheme-qualified entry silently matched nothing at all.
 */
export function originMatchesEntry(origin: string, entry: string): boolean {
  const host = hostnameOf(origin);
  if (!host) return false;

  if (entry.includes("://")) {
    try {
      const e = new URL(entry);
      return (
        e.protocol === new URL(origin).protocol &&
        e.host.toLowerCase() === new URL(origin).host.toLowerCase()
      );
    } catch {
      return false;
    }
  }

  const domain = entry.replace(/^\.+/, "").toLowerCase();
  if (!domain) return false;
  // Exact host, or a true subdomain. "evil-onwayiq.com" must NOT match "onwayiq.com".
  return host === domain || host.endsWith(`.${domain}`);
}

/**
 * Build the allow-list policy from the environment.
 *
 * BOTH the REST CORS middleware and the Socket.IO handshake go through this, so
 * the two can never drift into different notions of "trusted origin" — which is
 * exactly how Socket.IO ended up with its own `NODE_ENV`-gated `"*"` fallback
 * while the REST layer was being hardened.
 *
 * `selfOrigin` is deliberately NOT part of this: it is per-request and must be
 * derived from that request's Host header via selfOriginFromHeaders().
 */
export function buildOriginPolicyFromEnv(
  env: Record<string, string | undefined> = process.env,
): Omit<OriginPolicy, "selfOrigin"> {
  return {
    allowedOrigins: parseOriginList(env.ALLOWED_ORIGINS),
    // Replit-assigned domains (only present inside Replit; empty on a VPS).
    replitDomains: [env.REPLIT_DEV_DOMAIN, ...parseOriginList(env.REPLIT_DOMAINS)].filter(
      Boolean,
    ) as string[],
    allowLocal: env.CORS_ALLOW_LOCAL !== "false",
  };
}

export interface OriginPolicy {
  /** Origins from ALLOWED_ORIGINS (scheme-qualified or bare domains). */
  allowedOrigins: string[];
  /** Replit-assigned hostnames (bare host, no scheme); empty off-Replit. */
  replitDomains: string[];
  /** The server's own origin for this request, e.g. "https://onwayiq.com". */
  selfOrigin: string | null;
  /** Allow loopback / private-LAN origins. Defaults to true. */
  allowLocal?: boolean;
}

/**
 * May this origin read cross-origin responses (i.e. do we echo CORS headers)?
 * There is no wildcard branch and no environment-based bypass.
 */
export function isOriginAllowed(origin: string, policy: OriginPolicy): boolean {
  if (!origin || !hostnameOf(origin)) return false;

  // 1. The server's own origin. This is what the web admin panel uses — it calls
  //    API_BASE = "/api", and browsers attach an Origin header to same-origin
  //    POST/PUT/DELETE. Without this branch a fail-closed policy would 403 the
  //    dashboard's own writes whenever ALLOWED_ORIGINS was not configured.
  if (policy.selfOrigin && origin.toLowerCase() === policy.selfOrigin.toLowerCase()) {
    return true;
  }

  // 2. Explicitly configured by the operator.
  if (policy.allowedOrigins.some((entry) => originMatchesEntry(origin, entry))) return true;

  // 3. The platform's own domains (Replit only; empty on a VPS).
  if (policy.replitDomains.some((d) => originMatchesEntry(origin, d))) return true;

  // 4. Developer machines — never a publishable attacker origin.
  if (policy.allowLocal !== false && isLocalOrigin(origin)) return true;

  return false;
}

/** Methods that must not change state, and so need no CSRF check. */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export interface AdminCsrfInput {
  method: string;
  /** Origin header, if the client sent one. */
  origin?: string | null;
  /** Referer header, used only when Origin is absent. */
  referer?: string | null;
  /** True when the admin SESSION COOKIE is present on the request. */
  hasSessionCookie: boolean;
  selfOrigin: string | null;
  allowedOrigins: string[];
}

/**
 * Is this admin request safe from cross-site request forgery?
 *
 * CSRF only exists for credentials a browser attaches AUTOMATICALLY. This API
 * accepts two admin credentials and they are not equal in that respect:
 *
 *   • Session cookie — HttpOnly, and `/api/admin/login` issues it with
 *     SameSite=None on HTTPS so cross-domain panels keep working. A browser will
 *     therefore attach it to a request triggered by ANY site. This is the
 *     forgeable credential and it is what this guard protects.
 *
 *   • Authorization: Bearer — script must read the token from storage and set the
 *     header explicitly. An attacker's page can do neither (same-origin policy
 *     denies it the storage, and the header is not ambient), so a Bearer-only
 *     request cannot be forged. No token plumbing is added for it.
 *
 * Decision:
 *   safe method                     → allowed (no state change)
 *   no session cookie               → allowed (Bearer or unauthenticated; not forgeable)
 *   Origin present                  → must be same-origin or explicitly allow-listed
 *   Origin absent, Referer present  → same rule, applied to the referer's origin
 *   neither header                  → allowed: browsers ALWAYS send Origin on a
 *                                     cross-site state-changing request, so its
 *                                     absence means a non-browser client (curl, the
 *                                     React Native admin app), which CSRF cannot reach
 */
export function isAdminCsrfAllowed(input: AdminCsrfInput): boolean {
  if (SAFE_METHODS.has(input.method.toUpperCase())) return true;
  if (!input.hasSessionCookie) return true;

  const trusted = (candidate: string): boolean => {
    if (input.selfOrigin && candidate.toLowerCase() === input.selfOrigin.toLowerCase()) {
      return true;
    }
    return input.allowedOrigins.some((entry) => originMatchesEntry(candidate, entry));
  };

  if (input.origin) return trusted(input.origin);

  if (input.referer) {
    try {
      return trusted(new URL(input.referer).origin);
    } catch {
      return false; // a malformed Referer on a cookie-authenticated write is not trusted
    }
  }

  return true;
}

// ── Express middleware ────────────────────────────────────────────────────────

/**
 * Name of the admin session cookie. Duplicated from adminAuth.ts ON PURPOSE:
 * importing that module here would drag jsonwebtoken and the Firestore client into
 * this file, and the unit tests load originGuard.ts directly. A guardrail test
 * asserts the two constants stay identical.
 */
export const ADMIN_SESSION_COOKIE = "onway_admin_session";

/** Minimal cookie-header parse — avoids depending on cookie middleware here. */
function readCookie(req: Request, name: string): string | undefined {
  const preParsed = (req as any).cookies?.[name];
  if (typeof preParsed === "string" && preParsed) return preParsed;
  const header = req.headers?.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) {
      const value = decodeURIComponent(v.join("=").trim());
      return value || undefined;
    }
  }
  return undefined;
}

/**
 * Paths under /api/admin that must stay reachable WITHOUT a prior session, so the
 * guard can never lock an admin out of signing in. Compared against the full URL
 * because the middleware is mounted with a path prefix (req.path is then relative).
 */
const CSRF_EXEMPT_ADMIN_PATHS = ["/api/admin/login"];

function isCsrfExempt(req: Request): boolean {
  const full = (req.originalUrl || req.url || "").split("?")[0];
  return CSRF_EXEMPT_ADMIN_PATHS.some((p) => full === p || full.endsWith(p));
}

/**
 * CSRF guard for state-changing admin requests authenticated by the SESSION COOKIE.
 *
 * The admin session cookie is HttpOnly and /api/admin/login issues it with
 * SameSite=None on HTTPS (so cross-domain panels keep working), which means a
 * browser attaches it to a request started by ANY site. The CORS allow-list alone
 * does not stop that: a simple POST is sent without a preflight, so the write
 * lands even though the attacker cannot read the response.
 *
 * MOUNTING (H-79): this must be mounted on /api/admin BEFORE the admin routes in
 * index.ts and vendor.ts are registered. Express matches in registration order, so
 * mounting it inside registerRoutes() left nine write routes — eight in vendor.ts
 * and change-credentials in index.ts — reachable without ever running this check.
 *
 * Requests that authenticate with `Authorization: Bearer` are NOT checked and get
 * no CSRF token: that header is never attached ambiently, so it cannot be forged
 * from another origin. See isAdminCsrfAllowed for the full reasoning.
 */
export function requireAdminCsrf(req: Request, res: Response, next: NextFunction): void {
  if (isCsrfExempt(req)) return next();

  const ok = isAdminCsrfAllowed({
    method: req.method,
    origin: req.header("origin"),
    referer: req.header("referer"),
    hasSessionCookie: !!readCookie(req, ADMIN_SESSION_COOKIE),
    selfOrigin: selfOriginFromHeaders(
      req.headers.host,
      req.header("x-forwarded-proto"),
      (req as any).protocol,
    ),
    allowedOrigins: parseOriginList(process.env.ALLOWED_ORIGINS),
  });

  if (!ok) {
    console.warn(
      `[CSRF] blocked ${req.method} ${req.originalUrl || req.path} origin=${req.header("origin") || "-"} referer=${req.header("referer") || "-"}`,
    );
    res.status(403).json({ error: "طلب غير موثوق المصدر" });
    return;
  }
  next();
}
