/**
 * Customer session token helpers for non-component call sites.
 *
 * Screens read the token from `useAuth().customerToken`. Plain modules (libs,
 * services) cannot use the hook, so they read it from secure storage here.
 *
 * Every `/api/*` route that serves customer data is guarded by
 * `requireCustomerAuth` on the server. A call site that omits the header does
 * not fail loudly — it gets a 401 that the surrounding `catch` swallows, and the
 * feature is silently dead. `tests/unit/client-auth-headers.test.mjs` guards the
 * known call sites against exactly that.
 */
import { getToken } from "@/lib/secureTokenStorage";

export const CUSTOMER_TOKEN_KEY = "@onway_customer_token";

/** `{ Authorization: "Bearer …" }`, or `{}` when no customer is signed in. */
export async function customerAuthHeaders(): Promise<Record<string, string>> {
  const token = await getToken(CUSTOMER_TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}
