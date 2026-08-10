import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { Platform } from "react-native";
import {
  resolveApiBase,
  MISSING_API_CONFIG_MESSAGE,
} from "@/lib/apiBase";

/**
 * Gets the base URL for the Express API server.
 *
 * Variable priority (baked in at Expo build time for native; env at runtime for web):
 *   1. EXPO_PUBLIC_API_BASE_URL  — canonical name for VPS / production builds
 *   2. EXPO_PUBLIC_DOMAIN        — legacy alias, kept for backward compatibility
 *
 * On web, falls back to the current window origin when neither variable is set
 * (useful for development when the app and API are on the same host).
 */
function currentResolution() {
  // React Native DEFINES a global `window` — it is an alias for the global object
  // — but gives it no `location`. A bare `typeof window !== "undefined"` check
  // therefore passed on a phone and the property read threw
  // "Cannot read property 'origin' of undefined" while this argument object was
  // still being built, before resolveApiBase ran. Every network call goes through
  // getApiUrl(), so a standalone build could not reach the server at all — a
  // correctly configured EXPO_PUBLIC_API_BASE_URL never got a chance to be read.
  // Expo Go and the Metro dev client polyfill window.location, which is why this
  // only ever appeared in an EAS build.
  const hasLocation =
    typeof window !== "undefined" && typeof window.location !== "undefined";
  // EXPO_PUBLIC_* vars are baked in at Expo build time (native) or read from
  // the process env at runtime (web/SSR). Both paths use the same priority.
  return resolveApiBase({
    configured:
      process.env.EXPO_PUBLIC_API_BASE_URL || process.env.EXPO_PUBLIC_DOMAIN,
    isWeb: Platform.OS === "web" && hasLocation,
    windowOrigin: hasLocation ? window.location.origin : null,
  });
}

// Log the misconfiguration once rather than on every resolved image, so the
// problem is obvious in a device log without drowning it.
let missingConfigReported = false;
function reportMissingApiConfig(): void {
  if (missingConfigReported) return;
  missingConfigReported = true;
  console.error(`[config] ${MISSING_API_CONFIG_MESSAGE}`);
}

/**
 * The API base URL. THROWS when the build carries no API host.
 *
 * Keep using this on network paths: there is no correct URL to fall back to, and
 * failing loudly beats silently talking to the wrong server. Do NOT call it
 * during render — see getApiUrlSafe.
 */
export function getApiUrl(): string {
  const resolved = currentResolution();
  if (!resolved.ok) {
    reportMissingApiConfig();
    throw new Error(MISSING_API_CONFIG_MESSAGE);
  }
  return resolved.url;
}

/**
 * Non-throwing variant for code that runs DURING RENDER (image URL resolution
 * being the one that matters — it runs for every product card, banner and cart
 * row). Returns null when unconfigured, so the caller can degrade instead of
 * taking the whole app down through the ErrorBoundary. The misconfiguration is
 * still reported to the console — it is never swallowed silently, and no guessed
 * host is ever substituted.
 */
export function getApiUrlSafe(): string | null {
  const resolved = currentResolution();
  if (!resolved.ok) {
    reportMissingApiConfig();
    return null;
  }
  return resolved.url;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  route: string,
  data?: unknown | undefined,
): Promise<Response> {
  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);

  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const baseUrl = getApiUrl();
    const url = new URL(queryKey.join("/") as string, baseUrl);

    const res = await fetch(url, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 30 * 60 * 1000, // 30 minutes (garbage collection time)
      retry: 1,
      retryDelay: 1000,
    },
    mutations: {
      retry: false,
    },
  },
});
