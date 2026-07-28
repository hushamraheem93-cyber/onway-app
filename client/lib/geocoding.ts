import { getApiUrl } from "@/lib/query-client";

export interface GeocodeResult {
  address: string;
  placeName: string | null;
}

// A readable placeholder shown to normal users when no address can be resolved.
// We never surface raw "lat, lng" to end users — that is the regression this closes.
const FRIENDLY_PLACEHOLDER = "موقع محدَّد على الخريطة";

// Debug gate: only a development build ever displays raw coordinates, and only for
// debugging. In production the placeholder above is shown instead. Read via globalThis
// so no ambient __DEV__ declaration is needed and it can never be undefined at runtime.
const SHOW_RAW_COORDS = (globalThis as { __DEV__?: boolean }).__DEV__ === true;

// "34.12345, 43.98765" — a coordinate string, not a real address. Used so the client
// still behaves correctly against an OLD server build that returns coordinates without
// the `resolved` flag (e.g. before this fix is deployed to the VPS).
const COORD_RE = /^-?\d{1,3}\.\d+\s*,\s*-?\d{1,3}\.\d+$/;
function looksLikeCoords(s?: string): boolean {
  return !!s && COORD_RE.test(s.trim());
}

export async function reverseGeocodeArabic(lat: number, lng: number): Promise<string> {
  const result = await reverseGeocodeDetailed(lat, lng);
  return result.address;
}

export async function reverseGeocodeDetailed(lat: number, lng: number): Promise<GeocodeResult> {
  const raw = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  const fallback = SHOW_RAW_COORDS ? raw : FRIENDLY_PLACEHOLDER;
  try {
    const apiUrl = getApiUrl();
    const url = new URL(`/api/reverse-geocode?lat=${lat}&lng=${lng}`, apiUrl).toString();
    // No auth required — the endpoint is a read-only Google Maps proxy that does
    // not expose user data. It is open to any caller so LocationBar and
    // MapPickerScreen can geocode before login without a 401.
    const res = await fetch(url);
    const data = await res.json();
    // The server sets resolved:false when it returns coordinates (missing key, Google
    // error, quota). Treat a missing flag (old server) as resolved only when the
    // address is not itself a coordinate string.
    const resolved =
      data.resolved === true ||
      (data.resolved === undefined && !!data.address && !looksLikeCoords(data.address));
    if (resolved && data.address) {
      return { address: data.address, placeName: data.placeName || null };
    }
    return { address: fallback, placeName: null };
  } catch {
    return { address: fallback, placeName: null };
  }
}

export function isGenericAddress(address: string): boolean {
  if (!address) return true;
  const trimmed = address.trim();
  if (trimmed === "قضاء الضلوعية") return true;
  if (/^(الضلوعية|قضاء الضلوعية)(،\s*(قضاء الضلوعية|محافظة صلاح الدين))*$/.test(trimmed)) return true;
  return false;
}

export const DHULUIYAH_CENTER = { lat: 34.018, lng: 44.219 };
export const DEFAULT_DISTRICT = "قضاء الضلوعية";
