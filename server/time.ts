/**
 * Convert the timestamp shapes found in legacy Firestore records to milliseconds.
 * New writes use Firestore Timestamp; this helper keeps old ISO/Date/number data
 * readable while migrations are not required.
 */
export function timestampMillis(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  try {
    if (typeof (value as any)?.toMillis === "function") {
      const n = Number((value as any).toMillis());
      return Number.isFinite(n) ? n : null;
    }
    if (value instanceof Date) {
      const n = value.getTime();
      return Number.isFinite(n) ? n : null;
    }
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }
    if (typeof value === "string") {
      const n = Date.parse(value);
      return Number.isFinite(n) ? n : null;
    }
  } catch {
    return null;
  }

  return null;
}
