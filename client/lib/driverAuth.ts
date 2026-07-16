/**
 * Driver session token helpers. The signed driver token proves identity to all
 * /api/driver/* routes; it is issued by /api/driver/mobile-auth after OTP and
 * stored securely. A scoped fetch interceptor attaches it automatically to every
 * /api/driver/* request so no individual call site can forget it.
 */
import { getToken, setToken, removeToken } from "@/lib/secureTokenStorage";
import { getApiUrl } from "@/lib/query-client";

export const DRIVER_TOKEN_KEY = "@onway_driver_token";

const MOBILE_AUTH_PATH = "/api/driver/mobile-auth";

/**
 * Exchange OTP proof (the customer JWT) for a signed driver token and store it.
 * Returns the token, or null if the phone is not a registered driver / not verified.
 */
export async function issueDriverToken(
  phone: string,
  customerToken: string | null
): Promise<string | null> {
  try {
    const res = await fetch(new URL(MOBILE_AUTH_PATH, getApiUrl()).toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(customerToken ? { Authorization: `Bearer ${customerToken}` } : {}),
      },
      body: JSON.stringify({ phoneNumber: phone }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.token) {
      await setToken(DRIVER_TOKEN_KEY, data.token);
      return data.token as string;
    }
  } catch {
    /* network/parse error — caller falls back to unauth state */
  }
  return null;
}

export async function clearDriverToken(): Promise<void> {
  try { await removeToken(DRIVER_TOKEN_KEY); } catch { /* ignore */ }
}

let installed = false;

/**
 * Monkey-patch global.fetch once so every /api/driver/* request (except the token
 * issuer) carries the stored driver Bearer token. This guarantees identity is sent
 * on all driver calls without threading the token through ~30 call sites. It only
 * touches driver URLs and never overrides an Authorization header already present.
 */
export function installDriverAuthInterceptor(): void {
  if (installed) return;
  installed = true;
  const g = global as any;
  const orig: typeof fetch = g.fetch;
  if (typeof orig !== "function") return;

  g.fetch = async (input: any, init: any = {}) => {
    try {
      const url =
        typeof input === "string" ? input : input?.url ?? "";
      if (
        typeof url === "string" &&
        url.includes("/api/driver/") &&
        !url.includes(MOBILE_AUTH_PATH)
      ) {
        const token = await getToken(DRIVER_TOKEN_KEY);
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
