/**
 * Notification-preference transport (H-57).
 *
 * Kept free of React Native imports so the rules below are executable on their own:
 * the screen supplies fetch, the base URL and the customer token, and everything
 * here is a plain function over them.
 *
 * The important property is that NOTHING in this file resolves to a success value
 * when the server did not confirm one. Every failure throws. The screen had been
 * writing to AsyncStorage and displaying "يتم حفظ الإعدادات تلقائياً" regardless of
 * whether anything reached the server, which is precisely the false confirmation
 * H-57 is about, so a silent fallback here would reintroduce it one layer down.
 */
import {
  DEFAULT_NOTIFICATION_PREFS,
  NotificationPrefs,
  normalizeNotificationPrefs,
} from "@shared/notificationPrefs";

/**
 * Cache key for the last server-confirmed preferences.
 *
 * Deliberately NOT "@onway_notifications": NotificationContext stores the received-
 * notification history array under that key, and the two clobbered each other. A
 * push arriving replaced the preference object with an array (so the screen showed
 * every switch off), and touching a switch replaced the array with an object (so the
 * whole notification list was wiped). Separate concerns, separate keys.
 */
export const NOTIFICATION_PREFS_KEY = "@onway_notification_prefs";

/** What the badge under the switches is allowed to claim. */
export type PrefsSyncState =
  | "loading" // asking the server
  | "synced" // showing what the server holds
  | "saving" // a change is in flight
  | "saved" // the server confirmed this change
  | "error" // the change did NOT reach the server
  | "anonymous"; // no account, so nothing can be saved

export interface PrefsTransport {
  fetchImpl: typeof fetch;
  baseUrl: string;
  /** Customer JWT. Without it the endpoints answer 401 and nothing can be stored. */
  token: string | null;
}

export class PrefsTransportError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "PrefsTransportError";
    this.status = status;
  }
}

const ENDPOINT = "/api/users/notification-preferences";

function requireToken(t: PrefsTransport): string {
  if (!t.token) throw new PrefsTransportError(401, "no customer token");
  return t.token;
}

/**
 * Read the customer's stored preferences.
 *
 * `stored` distinguishes "has never chosen" from "chose exactly the defaults" — the
 * screen needs that to avoid implying the server is holding a decision it is not.
 */
export async function fetchNotificationPrefs(
  t: PrefsTransport,
): Promise<{ preferences: NotificationPrefs; stored: boolean }> {
  const token = requireToken(t);
  const res = await t.fetchImpl(new URL(ENDPOINT, t.baseUrl).toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok)
    throw new PrefsTransportError(res.status, "failed to read preferences");
  const json = (await res.json()) as {
    preferences?: unknown;
    stored?: unknown;
  };
  return {
    preferences: normalizeNotificationPrefs(json?.preferences),
    stored: json?.stored === true,
  };
}

/**
 * Persist the customer's preferences, returning what the SERVER says it stored.
 *
 * The caller must render the returned value rather than the value it sent, so the
 * switches can never show a state the server disagreed with.
 */
export async function saveNotificationPrefs(
  t: PrefsTransport,
  preferences: NotificationPrefs,
): Promise<NotificationPrefs> {
  const token = requireToken(t);
  const res = await t.fetchImpl(new URL(ENDPOINT, t.baseUrl).toString(), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ preferences }),
  });
  if (!res.ok)
    throw new PrefsTransportError(res.status, "failed to save preferences");
  const json = (await res.json()) as { preferences?: unknown };
  return normalizeNotificationPrefs(json?.preferences);
}

/** Arabic text for each state. Only "saved"/"synced" may claim anything was stored. */
export const PREFS_STATE_TEXT: Record<PrefsSyncState, string> = {
  loading: "جاري تحميل الإعدادات…",
  synced: "الإعدادات محفوظة في حسابك",
  saving: "جاري الحفظ…",
  saved: "تم حفظ الإعدادات",
  error: "تعذّر حفظ الإعدادات — تحقق من الاتصال وأعد المحاولة",
  anonymous: "سجّل الدخول لحفظ تفضيلات الإشعارات",
};

export { DEFAULT_NOTIFICATION_PREFS, normalizeNotificationPrefs };
export type { NotificationPrefs };
