/**
 * Admin session token helpers (mobile). POST /api/admin/login returns a session
 * token that the server ALSO accepts as an `Authorization: Bearer` header —
 * `isValidSession` checks both the cookie and the Bearer header. Browser cookies
 * are unreliable in React Native, so the mobile app authenticates admin requests
 * with the Bearer token exclusively. A scoped fetch interceptor attaches it to
 * every /api/admin/* (and /admin/*) request automatically, so no individual call
 * site in the 3k-line AdminScreen has to be touched.
 */
// H-80: admin-token reads/writes go through the in-memory cache so the
// interceptor stops hitting the Keychain on every /api/admin/* request.
import { readToken, rememberToken, forgetToken } from "@/lib/authTokenCache";
import { getApiUrl } from "@/lib/query-client";

export const ADMIN_TOKEN_KEY = "@onway_admin_token";

const LOGIN_PATH = "/api/admin/login";

/** Exchange username/password for an admin session token and store it. Throws with
 *  the server's Arabic error message on failure so the login screen can show it. */
export async function loginAdmin(
  username: string,
  password: string,
): Promise<void> {
  const res = await fetch(new URL(LOGIN_PATH, getApiUrl()).toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || "اسم المستخدم أو كلمة المرور غير صحيحة");
  }
  const data = await res.json();
  if (!data?.token) throw new Error("لم يتم استلام رمز الجلسة من الخادم");
  await rememberToken(ADMIN_TOKEN_KEY, data.token as string);
}

export async function getAdminToken(): Promise<string | null> {
  try {
    return await readToken(ADMIN_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function clearAdminToken(): Promise<void> {
  try {
    await forgetToken(ADMIN_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Sign out (H-64 / A-1).
 *
 * Invalidates the session on the SERVER first, then drops the local token. The
 * order matters: clearing locally alone would leave a session the server still
 * accepts, so a leaked token would outlive the logout. The local token is removed
 * even when the network call fails — the admin asked to be signed out on this
 * device, and that part must not depend on connectivity.
 */
export async function logoutAdmin(): Promise<void> {
  try {
    await fetch(new URL("/api/admin/logout", getApiUrl()).toString(), {
      method: "POST",
      credentials: "include",
    });
  } catch {
    /* the local token is cleared regardless */
  }
  await clearAdminToken();
}

/**
 * Is the stored session still accepted by the server? (H-64 / A-2)
 *
 * The panel used to open on the mere PRESENCE of a token, so an expired or revoked
 * one rendered the entire dashboard and then failed every query with 401 — with no
 * route back to the login screen. `null` means "could not tell" (the request never
 * reached the server); the caller keeps the session rather than signing the admin
 * out because the phone was briefly offline.
 */
export async function isAdminSessionValid(): Promise<boolean | null> {
  const token = await getAdminToken();
  if (!token) return false;
  try {
    const res = await fetch(
      new URL("/api/admin/session", getApiUrl()).toString(),
      { credentials: "include" },
    );
    if (res.status === 401) return false;
    return res.ok ? true : null;
  } catch {
    return null;
  }
}

/**
 * Called whenever an admin API answers 401 (H-64 / #14).
 *
 * One central place: the interceptor below fires it for ANY admin request, so a
 * revoked session cannot leave the panel rendered and repeatedly alerting with no
 * way out. The listener (AdminScreen) clears the session and returns to login.
 */
type UnauthorizedListener = () => void;
let onUnauthorized: UnauthorizedListener | null = null;

export function setAdminUnauthorizedHandler(
  fn: UnauthorizedListener | null,
): void {
  onUnauthorized = fn;
}

let installed = false;

/**
 * True only for SAME-ORIGIN /api/admin/* requests (excluding the login issuer).
 * Scoping by origin prevents the admin Bearer token from being attached to — and
 * leaked to — any third-party URL that merely contains "/admin/" in its path.
 */
function isAdminApiUrl(url: string): boolean {
  try {
    const base = getApiUrl();
    const resolved = new URL(url, base);
    if (resolved.origin !== new URL(base).origin) return false;
    if (!resolved.pathname.startsWith("/api/admin/")) return false;
    if (resolved.pathname === LOGIN_PATH) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Monkey-patch global.fetch once so every /api/admin/* request (except the token
 * issuer) carries the stored admin Bearer token. Guarantees admin identity is sent
 * on all admin calls without threading the token through AdminScreen's many call
 * sites. Only touches admin URLs and never overrides a present Authorization header.
 */
export function installAdminAuthInterceptor(): void {
  if (installed) return;
  installed = true;
  const g = global as any;
  const orig: typeof fetch = g.fetch;
  if (typeof orig !== "function") return;

  g.fetch = async (input: any, init: any = {}) => {
    try {
      const url = typeof input === "string" ? input : (input?.url ?? "");
      if (typeof url === "string" && isAdminApiUrl(url)) {
        const token = await readToken(ADMIN_TOKEN_KEY);
        if (token) {
          const headers = new Headers(
            (init && init.headers) ||
              (typeof input !== "string" ? input?.headers : undefined) ||
              {},
          );
          if (!headers.has("Authorization")) {
            headers.set("Authorization", `Bearer ${token}`);
            init = { ...init, headers };
          }
        }
      }
    } catch {
      /* never let auth wiring break the request */
    }
    const res = await orig(input, init);
    // Central 401 handling: every admin request passes through here, so the
    // session can be torn down once instead of at ~90 call sites — none of which
    // did it, which is why an expired session produced an empty panel and a loop
    // of "انتهت صلاحية الجلسة" alerts with no way back to the login screen.
    try {
      const url = typeof input === "string" ? input : (input?.url ?? "");
      if (
        res?.status === 401 &&
        typeof url === "string" &&
        isAdminApiUrl(url)
      ) {
        await clearAdminToken();
        onUnauthorized?.();
      }
    } catch {
      /* never let auth wiring break the response */
    }
    return res;
  };
}
