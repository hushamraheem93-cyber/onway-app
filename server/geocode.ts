/**
 * Reverse-geocoding helpers — the address-selection logic, extracted from the
 * /api/reverse-geocode route so it can be unit-tested without a network call or the
 * Google key. The route does the HTTP fetch and hands the parsed JSON in here; these
 * functions decide the most user-friendly Arabic address and never see the API key.
 */

export interface GeocodeResult {
  address: string;
  placeName: string | null;
}

/** Google geocode/places status classification, for logging only (no key material). */
export interface GeocodeDiagnostics {
  geocodeStatus: string;
  placesStatus: string;
  googleError: string | null;
  /** True for statuses that mean the KEY itself is the problem (invalid/blocked/quota). */
  keyProblem: boolean;
}

/** Strip country suffix, plus-codes and leading separators from a formatted address. */
export function cleanAddr(raw: string): string {
  return (raw || "")
    .replace(/،\s*العراق\s*$/g, "")
    .replace(/,\s*العراق\s*$/g, "")
    .replace(/\b\w{2,6}\+\w+[،,]?\s*/g, "")
    .replace(/^\s*[،,]\s*/, "")
    .trim();
}

/** An address is useful when it is non-empty and not a placeholder "unnamed road". */
export function isUsefulAddress(addr: string): boolean {
  if (!addr) return false;
  const a = addr.trim();
  if (!a) return false;
  if (a.includes("طريق بدون اسم") || a.includes("Unnamed Road")) return false;
  return true;
}

const ARABIC = /[؀-ۿ]/;

/** The best nearby named place (a real POI/landmark, never an administrative name). */
function pickPlaceName(placesRes: any): string | null {
  if (placesRes?.status !== "OK" || !Array.isArray(placesRes.results)) return null;
  for (const place of placesRes.results) {
    const types: string[] = place.types || [];
    // Administrative names ("الضلوعية", a governorate) are not user-friendly places.
    if (types.includes("locality") || types.includes("political") || types.includes("administrative_area_level_2")) {
      continue;
    }
    const name: string = place.name || "";
    if (name.length > 1 && ARABIC.test(name) && isUsefulAddress(name)) return name;
  }
  return null;
}

/** First useful address-component `long_name` whose type is in `types`, across results. */
function pickComponent(results: any[], types: string[]): string | null {
  for (const result of results) {
    for (const comp of result?.address_components || []) {
      const ctypes: string[] = comp.types || [];
      if (types.some((t) => ctypes.includes(t))) {
        const name = comp.long_name || "";
        if (isUsefulAddress(name)) return name;
      }
    }
  }
  return null;
}

/**
 * Choose the SHORTEST user-friendly Arabic address. Priority (highest first):
 *   1. a nearby named place / landmark   (e.g. "أسواق دزني")
 *   2. neighbourhood / حي                 (e.g. "حي العسكري")
 *   3. street / route
 *   4. city / قضاء (locality or admin_2)  (e.g. "قضاء الضلوعية")
 *   5. governorate / محافظة (admin_1)     — last resort
 * Long/technical strings ("Unnamed Road, Salah Al-Din Governorate, Iraq") and plus
 * codes are never returned unless nothing else is available. Returns null when nothing
 * usable was found, so the caller can fall back deliberately.
 */
export function pickBestAddress(geocodeRes: any, placesRes: any): GeocodeResult | null {
  const placeName = pickPlaceName(placesRes);
  const results =
    geocodeRes?.status === "OK" && Array.isArray(geocodeRes.results) ? geocodeRes.results : [];

  const neighborhood = pickComponent(results, ["neighborhood", "sublocality", "sublocality_level_1"]);
  const route = pickComponent(results, ["route", "premise", "street_address"]);
  const city = pickComponent(results, ["locality", "administrative_area_level_2"]);
  const governorate = pickComponent(results, ["administrative_area_level_1"]);

  const best = placeName || neighborhood || route || city || governorate || null;
  if (best && isUsefulAddress(best)) {
    return { address: best, placeName: placeName || null };
  }

  // Last resort only: a cleaned formatted_address, if it is itself useful (this is where
  // an "Unnamed Road…" string would otherwise have come from — it is rejected above).
  for (const result of results) {
    const cleaned = cleanAddr(result?.formatted_address || "");
    if (isUsefulAddress(cleaned)) return { address: cleaned, placeName: placeName || null };
  }
  return null;
}

/** Summarise Google's status for diagnostic logging without ever touching the key. */
export function geocodeDiagnostics(geocodeRes: any, placesRes: any): GeocodeDiagnostics {
  const geocodeStatus = geocodeRes?.status || "NO_RESPONSE";
  const placesStatus = placesRes?.status || "NO_RESPONSE";
  const googleError = geocodeRes?.error_message || placesRes?.error_message || null;
  // REQUEST_DENIED = bad/blocked key or API not enabled; OVER_QUERY_LIMIT = quota.
  const keyProblem = [geocodeStatus, placesStatus].some(
    (s) => s === "REQUEST_DENIED" || s === "OVER_QUERY_LIMIT",
  );
  return { geocodeStatus, placesStatus, googleError, keyProblem };
}
