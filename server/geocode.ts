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
  if (addr.includes("طريق بدون اسم") || addr.includes("Unnamed Road")) return false;
  return true;
}

/**
 * Choose the most user-friendly Arabic address from Google geocode + nearby-places
 * JSON. Prefers a named nearby place (e.g. "أسواق دزني"), then the narrowest useful
 * geocode level (neighborhood → route → locality), and combines them. Returns null
 * when nothing usable was found, so the caller can fall back deliberately.
 *
 * Behaviour is intentionally identical to the previous inline route logic.
 */
export function pickBestAddress(geocodeRes: any, placesRes: any): GeocodeResult | null {
  let placeName = "";
  if (placesRes?.status === "OK" && placesRes.results) {
    const arabicRegex = /[؀-ۿ]/;
    for (const place of placesRes.results) {
      const types: string[] = place.types || [];
      if (
        types.includes("locality") ||
        types.includes("political") ||
        types.includes("administrative_area_level_2")
      )
        continue;
      if (place.name && place.name.length > 1 && arabicRegex.test(place.name)) {
        placeName = place.name;
        break;
      }
    }
  }

  let bestAddress = "";
  if (geocodeRes?.status === "OK" && geocodeRes.results && geocodeRes.results.length > 0) {
    const priorityTypes = [
      ["neighborhood", "sublocality", "sublocality_level_1"],
      ["route", "street_address", "premise"],
      ["locality"],
    ];

    for (const typeGroup of priorityTypes) {
      for (const result of geocodeRes.results) {
        const types: string[] = result.types || [];
        if (typeGroup.some((t) => types.includes(t))) {
          const cleaned = cleanAddr(result.formatted_address || "");
          if (isUsefulAddress(cleaned)) {
            bestAddress = cleaned;
            break;
          }
        }
      }
      if (bestAddress) break;
    }

    if (!bestAddress) {
      for (const result of geocodeRes.results) {
        const types: string[] = result.types || [];
        if (
          !types.includes("plus_code") &&
          !types.includes("country") &&
          !types.includes("administrative_area_level_1")
        ) {
          const cleaned = cleanAddr(result.formatted_address || "");
          if (isUsefulAddress(cleaned)) {
            bestAddress = cleaned;
            break;
          }
        }
      }
    }

    if (!bestAddress && geocodeRes.results.length > 0) {
      bestAddress = cleanAddr(geocodeRes.results[0].formatted_address);
    }
  }

  if (placeName || bestAddress) {
    const finalAddress = placeName ? (bestAddress ? `${placeName}، ${bestAddress}` : placeName) : bestAddress;
    return { address: finalAddress, placeName: placeName || null };
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
