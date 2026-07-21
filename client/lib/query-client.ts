import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { Platform } from "react-native";

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
function normaliseBase(raw: string): string {
  // Strip an explicit port number — production servers run behind a reverse
  // proxy (Nginx/Caddy) on 443 and must not receive a bare :5000 URL.
  const noPort = raw.replace(/:\d+$/, "");
  // Ensure a protocol prefix is present.
  const withProto = noPort.startsWith("http") ? noPort : `https://${noPort}`;
  // Remove trailing slash for consistent URL construction.
  return withProto.replace(/\/$/, "");
}

export function getApiUrl(): string {
  // EXPO_PUBLIC_* vars are baked in at Expo build time (native) or read from
  // the process env at runtime (web/SSR). Both paths use the same priority.
  const configured =
    process.env.EXPO_PUBLIC_API_BASE_URL || process.env.EXPO_PUBLIC_DOMAIN;

  // ── Web ──────────────────────────────────────────────────────────────────
  if (Platform.OS === "web" && typeof window !== "undefined") {
    if (configured) return normaliseBase(configured);
    // Dev fallback: Expo dev server (port 8081) → Express backend (port 5000).
    const origin = window.location.origin;
    if (origin.includes(":808")) return origin.replace(/:808\d/, ":5000");
    return origin;
  }

  // ── Native (iOS / Android) ───────────────────────────────────────────────
  if (!configured) {
    throw new Error(
      "EXPO_PUBLIC_API_BASE_URL is not set. " +
      "Set it to your server domain before building " +
      "(e.g. EXPO_PUBLIC_API_BASE_URL=https://api.yourdomain.com).",
    );
  }

  return normaliseBase(configured);
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
