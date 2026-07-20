/**
 * Driver session token helpers. The signed driver token proves identity to all
 * /api/driver/* routes; it is issued by /api/driver/mobile-auth after OTP and
 * stored securely. A scoped fetch interceptor attaches it automatically to every
 * /api/driver/* request so no individual call site can forget it.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getToken, setToken, removeToken } from "@/lib/secureTokenStorage";
import { getApiUrl } from "@/lib/query-client";

export const DRIVER_TOKEN_KEY = "@onway_driver_token";

const MOBILE_AUTH_PATH = "/api/driver/mobile-auth";
const AUTH_STORAGE_KEY = "@onway_auth";
const CUSTOMER_TOKEN_KEY = "@onway_customer_token";

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

// Self-healing: re-exchange the stored customer JWT (30-day) for a fresh driver
// token. Used when a guarded /api/driver/* call returns 401 — which happens for
// drivers registered before the token system existed (no token ever stored), or
// after the 7-day driver token expires. Without this, /api/driver/status fails
// silently forever and the app stays stuck on the cached "قيد المراجعة" state
// even after the admin approves the driver.
let reissueInFlight: Promise<string | null> | null = null;
function reissueDriverToken(): Promise<string | null> {
  if (!reissueInFlight) {
    reissueInFlight = (async () => {
      try {
        const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
        const phone = raw ? (JSON.parse(raw)?.phoneNumber as string | undefined) : undefined;
        if (!phone) return null;
        const customerToken = await getToken(CUSTOMER_TOKEN_KEY);
        return await issueDriverToken(String(phone), customerToken);
      } catch {
        return null;
      }
    })().finally(() => {
      reissueInFlight = null;
    });
  }
  return reissueInFlight;
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
    let isDriverCall = false;
    try {
      const url =
        typeof input === "string" ? input : input?.url ?? "";
      isDriverCall =
        typeof url === "string" &&
        url.includes("/api/driver/") &&
        !url.includes(MOBILE_AUTH_PATH);
      if (isDriverCall) {
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

    const res = await orig(input, init);

    // 401 on a driver call → the stored token is missing/expired/invalid.
    // Re-issue from the customer JWT and retry ONCE with the fresh token.
    if (isDriverCall && res.status === 401) {
      try {
        const fresh = await reissueDriverToken();
        if (fresh) {
          const headers = new Headers((init && init.headers) || {});
          headers.set("Authorization", `Bearer ${fresh}`);
          return await orig(input, { ...init, headers });
        }
      } catch {
        /* fall through to the original 401 */
      }
    }
    return res;
  };
}
