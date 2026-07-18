/**
 * Admin session token helpers (mobile). POST /api/admin/login returns a session
 * token that the server ALSO accepts as an `Authorization: Bearer` header —
 * `isValidSession` checks both the cookie and the Bearer header. Browser cookies
 * are unreliable in React Native, so the mobile app authenticates admin requests
 * with the Bearer token exclusively. A scoped fetch interceptor attaches it to
 * every /api/admin/* (and /admin/*) request automatically, so no individual call
 * site in the 3k-line AdminScreen has to be touched.
 */
import { getToken, setToken, removeToken } from "@/lib/secureTokenStorage";
import { getApiUrl } from "@/lib/query-client";

export const ADMIN_TOKEN_KEY = "@onway_admin_token";

const LOGIN_PATH = "/api/admin/login";

/** Exchange username/password for an admin session token and store it. Throws with
 *  the server's Arabic error message on failure so the login screen can show it. */
export async function loginAdmin(username: string, password: string): Promise<void> {
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
  await setToken(ADMIN_TOKEN_KEY, data.token as string);
}

export async function getAdminToken(): Promise<string | null> {
  try { return await getToken(ADMIN_TOKEN_KEY); } catch { return null; }
}

export async function clearAdminToken(): Promise<void> {
  try { await removeToken(ADMIN_TOKEN_KEY); } catch { /* ignore */ }
}

let installed = false;

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
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (
        typeof url === "string" &&
        (url.includes("/api/admin/") || url.includes("/admin/")) &&
        !url.includes(LOGIN_PATH)
      ) {
        const token = await getToken(ADMIN_TOKEN_KEY);
        if (token) {
          const headers = new Headers(
            (init && init.headers) ||
              (typeof input !== "string" ? input?.headers : undefined) ||
              {}
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
    return orig(input, init);
  };
}
