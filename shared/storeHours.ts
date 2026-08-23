/**
 * When is a store open — the one definition (H-64 / D-6).
 *
 * Two fields described the same fact and nothing reconciled them:
 *
 *   • `vendors.workingHours` — `{ openTime, closeTime, openDays }`, written by the
 *     store owner from the vendor app. This is what the customer app reads to
 *     decide "مفتوح" or "مغلق".
 *   • `vendors.openTime` / `vendors.closeTime` — two loose strings, written by the
 *     admin dashboard. **Nothing read them.**
 *
 * So an admin who changed a store's opening hours changed nothing a customer could
 * see, and had no way to find out. This module makes `workingHours` the single
 * stored shape, folds the legacy admin strings into it on read, and exports the
 * open/closed predicate that the two client screens previously each implemented.
 *
 * `openDays` uses `Date.getDay()` numbering: 0 = Sunday … 6 = Saturday.
 */

export interface WorkingHours {
  openTime: string;
  closeTime: string;
  openDays: number[];
}

/**
 * Every day of the week.
 *
 * This is the project's existing default, taken from the vendor app's own settings
 * screen (`VendorProfileScreen`/`VendorHomeScreen` both seed `[0..6]`), not a new
 * policy. It matters: `isStoreOpenNow` treats a MISSING `openDays` as "open on no
 * day", so a `workingHours` object built without one would close the store outright.
 */
export const DEFAULT_OPEN_DAYS = [0, 1, 2, 3, 4, 5, 6];

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A usable `HH:MM`, or null. */
function timeOrNull(value: unknown): string | null {
  const s = String(value ?? "").trim();
  return HHMM.test(s) ? s : null;
}

/**
 * Build the canonical `workingHours` from whatever a store document holds.
 *
 * `legacy` is the pair of top-level admin strings. They are consulted ONLY when no
 * `workingHours` object exists, so a store whose owner has set real hours is never
 * overwritten by an older admin edit.
 *
 * Returns `null` when nothing usable is stored — which the predicate below reads as
 * "always open", exactly as the client screens already did for a missing object.
 */
export function normalizeWorkingHours(
  raw: unknown,
  legacy?: { openTime?: unknown; closeTime?: unknown },
): WorkingHours | null {
  const source = (raw ?? {}) as Partial<WorkingHours>;
  const openTime = timeOrNull(source.openTime) ?? timeOrNull(legacy?.openTime);
  const closeTime =
    timeOrNull(source.closeTime) ?? timeOrNull(legacy?.closeTime);
  if (!openTime || !closeTime) return null;

  const days = Array.isArray(source.openDays)
    ? source.openDays
        .map((d) => Number(d))
        .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    : [];
  const openDays =
    days.length > 0 ? [...new Set(days)].sort() : [...DEFAULT_OPEN_DAYS];
  return { openTime, closeTime, openDays };
}

/**
 * Is the store open at `now`?
 *
 * Lifted verbatim from the two identical copies in `StoresListScreen` and
 * `HomeScreen` so the list and the home page can never disagree — including the
 * "no hours stored means always open" rule, which is existing behaviour and is
 * deliberately preserved.
 *
 * M-70…M-75: the window may cross midnight, and the original single comparison
 * could not express that. For a restaurant working 18:00–02:00 it asked
 * `cur >= 1080 && cur < 120`, which no minute of the day satisfies — the badge read
 * "مغلق" at all twenty-four hours. The vendor app takes the closing time in a free
 * text field, and those are ordinary hours for a restaurant here.
 *
 * The day is the half that is easy to get wrong. After midnight the shift that is
 * running started YESTERDAY, so a Mon–Sat store is open at 01:00 on Sunday (the
 * Saturday shift finishing) and shut at 01:00 on Monday (that would be Sunday's
 * shift, and Sunday is not an open day). Checking today's `openDays` for both
 * halves gets both of those backwards.
 */
export function isStoreOpenNow(
  wh: WorkingHours | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!wh) return true;

  const cur = now.getHours() * 60 + now.getMinutes();
  const [oh, om] = (wh.openTime || "00:00").split(":").map(Number);
  const [ch, cm] = (wh.closeTime || "23:59").split(":").map(Number);
  const open = oh * 60 + om;
  const close = ch * 60 + cm;

  const today = now.getDay();
  const openOn = (day: number) => !!wh.openDays?.includes(day);

  // An ordinary same-day window: unchanged, including the half-open boundaries.
  if (close > open) return openOn(today) && cur >= open && cur < close;

  // The window wraps past midnight. `close === open` lands here too and reads as
  // twenty-four hours: a vendor entering the same time twice means "we never shut",
  // and this module already resolves unusable hours to "always open" rather than
  // "always shut".
  if (cur >= open) return openOn(today); // this evening's shift
  if (cur < close) return openOn((today + 6) % 7); // yesterday's, still running
  return false;
}
