/**
 * Shared date formatting utilities — single source of truth for all date/time
 * display across the app. All functions target Iraqi users reading Gregorian
 * dates (ar-IQ locale with calendar:"gregory").
 */

/**
 * Relative time string (e.g. "منذ 5 دقائق") — used in notification lists.
 */
export function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "الآن";
  if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
  if (diffHours < 24) return `منذ ${diffHours} ساعة`;
  if (diffDays < 7) return `منذ ${diffDays} يوم`;
  return date.toLocaleDateString("ar-IQ", {
    calendar: "gregory",
    month: "short",
    day: "numeric",
  });
}

/**
 * Full date + time string (e.g. "٣ يناير ٢٠٢٤، ١٤:٣٠") — used in order cards.
 */
export function formatDateTime(date: string | Date): string {
  return new Date(date).toLocaleDateString("ar-IQ", {
    calendar: "gregory",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Compact date as DD/MM (e.g. "03/01") — used in order tracking header.
 */
export function formatShortDate(date: string | Date): string {
  const d = new Date(date);
  return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1)
    .toString()
    .padStart(2, "0")}`;
}

/**
 * Time-only string as HH:MM (e.g. "14:30") — used alongside formatShortDate.
 */
export function formatShortTime(date: string | Date): string {
  const d = new Date(date);
  return `${d.getHours().toString().padStart(2, "0")}:${d
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
}

/**
 * Date-only string (e.g. "٣ يناير ٢٠٢٤") — supports Firestore Timestamp
 * objects (with `_seconds`) as well as ISO strings and Date objects.
 */
export function formatDateOnly(ts: unknown): string {
  if (!ts) return "";
  try {
    const date =
      ts && typeof ts === "object" && "_seconds" in ts
        ? new Date((ts as { _seconds: number })._seconds * 1000)
        : new Date(ts as string | number | Date);
    return date.toLocaleDateString("ar-IQ", {
      calendar: "gregory",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}
