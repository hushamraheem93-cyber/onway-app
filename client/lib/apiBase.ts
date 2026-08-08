/**
 * API base-URL resolution — pure, dependency-free so it can be unit tested.
 *
 * query-client.ts wraps this with the actual Platform/window lookups. Keeping the
 * decision logic here means the "what happens when the build is misconfigured"
 * rules are verifiable without a React Native runtime.
 */

/** Normalise a configured host into a canonical origin. */
export function normaliseBase(raw: string): string {
  // Strip an explicit port number — production servers run behind a reverse
  // proxy (Nginx/Caddy) on 443 and must not receive a bare :5000 URL.
  const noPort = raw.replace(/:\d+$/, "");
  // Ensure a protocol prefix is present.
  const withProto = noPort.startsWith("http") ? noPort : `https://${noPort}`;
  // Remove trailing slash for consistent URL construction.
  return withProto.replace(/\/$/, "");
}

export type ApiBaseResolution =
  | { ok: true; url: string }
  | { ok: false; reason: "missing_config" };

/**
 * Decide the API base URL.
 *
 * Native builds MUST carry an explicit EXPO_PUBLIC_API_BASE_URL: there is no
 * sane default host for a phone, and guessing one would silently point the app
 * at the wrong server. A missing value is reported as `missing_config` — never
 * substituted — so the caller decides between failing loudly (network paths) and
 * degrading safely (render paths).
 *
 * Web may fall back to the page origin, which is genuinely correct there: the app
 * was served by that host.
 */
export function resolveApiBase(input: {
  configured?: string | null;
  isWeb: boolean;
  windowOrigin?: string | null;
}): ApiBaseResolution {
  // Treat "" / whitespace exactly like an unset variable — an empty string is a
  // misconfiguration, not a valid host.
  const configured = (input.configured ?? "").trim();

  if (input.isWeb && input.windowOrigin) {
    if (configured) return { ok: true, url: normaliseBase(configured) };
    // Dev fallback: Expo dev server (port 8081) → Express backend (port 5000).
    const origin = input.windowOrigin;
    if (origin.includes(":808")) {
      return { ok: true, url: origin.replace(/:808\d/, ":5000") };
    }
    return { ok: true, url: origin };
  }

  if (!configured) return { ok: false, reason: "missing_config" };
  return { ok: true, url: normaliseBase(configured) };
}

/** The single diagnostic message used for a missing/empty API base configuration. */
export const MISSING_API_CONFIG_MESSAGE =
  "EXPO_PUBLIC_API_BASE_URL is not set. " +
  "Set it to your server domain before building " +
  "(e.g. EXPO_PUBLIC_API_BASE_URL=https://api.yourdomain.com).";
