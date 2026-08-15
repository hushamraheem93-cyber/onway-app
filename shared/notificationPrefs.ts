/**
 * Notification preferences — the one contract the app and the server share (H-57).
 *
 * NotificationsScreen used to keep these four switches in AsyncStorage and nowhere
 * else. There was no endpoint, no field, no network call: turning "العروض والخصومات"
 * off changed a local object while the server kept every registered token in the
 * broadcast list, so the marketing push arrived anyway. The screen meanwhile showed
 * "يتم حفظ الإعدادات تلقائياً" unconditionally, which made a consent decision look
 * recorded when nothing had recorded it.
 *
 * Defaults matter more than they look. Every existing customer today receives
 * broadcasts, and the screen's own initial state had offers: true — so an absent
 * preference must mean opted IN, or the fix would silently unsubscribe the entire
 * installed base. Only an explicit `offers: false` suppresses marketing.
 *
 * `normalizeNotificationPrefs` is deliberately paranoid about its input. The old
 * AsyncStorage key `@onway_notifications` was shared with NotificationContext, which
 * stores an ARRAY of received notifications under it; whichever wrote last won. So a
 * device can genuinely hold an array, a partial object, or values of the wrong type
 * where preferences are expected, and reading any of those must produce a valid set
 * rather than propagate the corruption.
 */

export interface NotificationPrefs {
  /** Order status changes (confirmed → delivered). Operational, not marketing. */
  orderUpdates: boolean;
  /** Promotions and discounts — the admin broadcast. This is the consent gate. */
  offers: boolean;
  /** New product announcements. */
  newProducts: boolean;
  /** Delivery-time alerts. */
  deliveryAlerts: boolean;
}

export const NOTIFICATION_PREF_KEYS = [
  "orderUpdates",
  "offers",
  "newProducts",
  "deliveryAlerts",
] as const;

/**
 * What a customer gets when they have never touched the screen.
 *
 * These mirror the values NotificationsScreen already initialised its state with,
 * so the fix changes nobody's current experience until they choose otherwise.
 */
export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  orderUpdates: true,
  offers: true,
  newProducts: false,
  deliveryAlerts: true,
};

/**
 * Coerce anything at all into a complete, valid preference set.
 *
 * Missing or non-boolean entries fall back to the default for that key — never to
 * `false`, which would read as an opt-out nobody expressed.
 */
export function normalizeNotificationPrefs(raw: unknown): NotificationPrefs {
  const out = { ...DEFAULT_NOTIFICATION_PREFS };
  // Arrays are objects too, and the legacy key really can hold one.
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return out;
  const source = raw as Record<string, unknown>;
  for (const key of NOTIFICATION_PREF_KEYS) {
    if (typeof source[key] === "boolean") out[key] = source[key] as boolean;
  }
  return out;
}

/**
 * May a marketing push go to this device?
 *
 * Takes the raw stored value rather than a parsed set so every caller applies the
 * same defaulting rule. An absent preference is consent (see above); only an
 * explicit false withholds it.
 */
export function allowsMarketingPush(raw: unknown): boolean {
  return normalizeNotificationPrefs(raw).offers;
}
