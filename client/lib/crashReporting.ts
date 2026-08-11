/**
 * Remote crash reporting (H-32, second half).
 *
 * OnWay is a delivery app for a small Iraqi town. Its API puts customer and driver
 * PHONE NUMBERS in query strings — /api/orders?phone=…, /api/notifications?phone=…,
 * /api/settlement?phoneNumber=…, /api/driver/earnings?phoneNumber=… — and Sentry's
 * default configuration records every HTTP request as a breadcrumb, full URL
 * included. Enabling the SDK with its defaults would ship those phone numbers to a
 * third party outside Iraq. So this module is written the other way round: it starts
 * from "send nothing" and adds back only what is needed to debug a crash.
 *
 * What leaves the device:  error type, message, stack trace, app version,
 *                          device model, OS version, build number.
 * What never leaves it:    phone numbers, tokens, passwords, addresses, emails,
 *                          order contents, request URLs, console output, user IP.
 *
 * The scrubbers below are plain exported functions precisely so they can be proven
 * in unit tests without a network, a device, or a Sentry account.
 *
 * With no EXPO_PUBLIC_SENTRY_DSN configured this module does nothing at all: no
 * init, no network, no behaviour change. That is the state the app ships in until
 * a DSN is deliberately provided.
 */
import * as Sentry from "@sentry/react-native";

/** Anything that looks like an Iraqi mobile number, in any of the forms in use. */
const PHONE = /(?:\+?964[\s-]?|00964[\s-]?|0)?7[\d\s-]{8,12}\b/g;
/** Bearer/JWT-shaped credentials. */
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const JWT = /\beyJ[A-Za-z0-9._-]{10,}/g;
/** Any query parameter whose NAME suggests it carries identity or credentials. */
const SENSITIVE_PARAM =
  /\b(phone|phoneNumber|token|access_token|id_token|refresh_token|password|passwordHash|email|address|apiKey|api_key|secret|authorization|otp|code)\s*=\s*[^&\s"'}\]]+/gi;

const REDACTED = "[redacted]";

/**
 * Remove identifying data from any string that is about to leave the device.
 * Order matters: named parameters are handled before bare phone shapes, so a
 * `phone=07…` is redacted as a parameter rather than half-redacted as a number.
 */
export function scrubText(input: string): string {
  return input
    .replace(SENSITIVE_PARAM, (m) => `${m.split("=")[0]}=${REDACTED}`)
    .replace(BEARER, `Bearer ${REDACTED}`)
    .replace(JWT, REDACTED)
    .replace(PHONE, REDACTED);
}

/** Walk a Sentry event and scrub every string in it, however deeply nested. */
export function scrubDeep<T>(value: T, seen = new WeakSet<object>()): T {
  if (typeof value === "string") return scrubText(value) as unknown as T;
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value as object)) return value; // cyclic graph: stop, do not recurse
  seen.add(value as object);
  if (Array.isArray(value)) {
    return value.map((v) => scrubDeep(v, seen)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = scrubDeep(v, seen);
  }
  return out as unknown as T;
}

/**
 * The last gate before an event is sent. Drops the identity block outright and
 * scrubs everything else — belt and braces, because a future SDK version could
 * start attaching something new that the earlier filters do not know about.
 */
export function sanitizeEvent<T extends Record<string, any>>(event: T | null): T | null {
  if (!event) return null;
  const scrubbed = scrubDeep(event);
  // Identity is never useful for fixing a render crash, and it is exactly what
  // must not be collected about a customer or a driver.
  delete (scrubbed as Record<string, unknown>).user;
  delete (scrubbed as Record<string, unknown>).server_name;
  if (scrubbed.request) {
    delete (scrubbed.request as Record<string, unknown>).cookies;
    delete (scrubbed.request as Record<string, unknown>).headers;
    delete (scrubbed.request as Record<string, unknown>).query_string;
    delete (scrubbed.request as Record<string, unknown>).data;
  }
  // Breadcrumbs are dropped at the source too; this is the second lock.
  delete (scrubbed as Record<string, unknown>).breadcrumbs;
  return scrubbed;
}

/**
 * No breadcrumb is worth a leaked phone number. HTTP breadcrumbs carry request
 * URLs, console breadcrumbs carry whatever was logged — including the "[crash]"
 * line the ErrorBoundary writes, which contains the error being reported anyway.
 */
export function filterBreadcrumb(): null {
  return null;
}

/** True only when a DSN was deliberately supplied for this build. */
export function isCrashReportingConfigured(): boolean {
  return !!process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();
}

let started = false;

/**
 * Start crash reporting. Safe to call unconditionally: without a DSN it returns
 * false and touches nothing. Never throws — a reporting tool must not be able to
 * stop the app it is meant to watch.
 */
export function initCrashReporting(): boolean {
  if (started || !isCrashReportingConfigured()) return false;
  try {
    Sentry.init({
      dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
      // Local development is watched by a console, not by a dashboard.
      enabled: !__DEV__,
      // No IP address, no device identifiers, no automatic user context.
      sendDefaultPii: false,
      // Performance tracing would sample request URLs; those carry phone numbers.
      tracesSampleRate: 0,
      // Session tracking pings on every foreground and adds nothing to a crash.
      enableAutoSessionTracking: false,
      // Screenshots and view hierarchies of a delivery app show customer names,
      // addresses and order contents.
      attachScreenshot: false,
      attachViewHierarchy: false,
      maxBreadcrumbs: 0,
      beforeBreadcrumb: filterBreadcrumb,
      beforeSend: sanitizeEvent,
      integrations: (defaults) =>
        defaults.filter(
          (i) =>
            i.name !== "Breadcrumbs" &&
            i.name !== "Http" &&
            i.name !== "HttpClient" &&
            i.name !== "Console" &&
            i.name !== "CaptureConsole" &&
            i.name !== "DeviceContext" &&
            i.name !== "UserInteraction",
        ),
    });
    started = true;
    return true;
  } catch (err) {
    console.error("[crash] Sentry init failed:", err);
    return false;
  }
}

/**
 * Hand a caught render error to the reporter. Used as ErrorBoundary's onError, so
 * the boundary keeps its own local console record and this only adds the remote
 * copy. Never throws, for the same reason as above.
 */
export function reportCrash(error: Error, componentStack?: string): void {
  if (!started) return;
  try {
    Sentry.captureException(error, {
      contexts: componentStack
        ? { react: { componentStack: scrubText(componentStack) } }
        : undefined,
    });
  } catch (err) {
    console.error("[crash] Sentry capture failed:", err);
  }
}
