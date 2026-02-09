const DISTRICT_NAME = "قضاء الضلوعية";

export async function reverseGeocodeArabic(lat: number, lng: number): Promise<string> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=ar&zoom=18&addressdetails=1`;
    const res = await fetch(url, {
      headers: { "User-Agent": "OnwayApp/1.0" },
    });
    const data = await res.json();

    if (data && data.address) {
      const addr = data.address;
      const localParts = [
        addr.road,
        addr.neighbourhood,
        addr.suburb,
        addr.hamlet,
        addr.village,
        addr.town,
      ].filter(Boolean);
      const unique = [...new Set(localParts)];

      if (unique.length > 0) {
        return unique.slice(0, 2).join("، ") + "، " + DISTRICT_NAME;
      }

      return DISTRICT_NAME;
    }

    if (data && data.display_name) {
      const parts = data.display_name.split(",").map((s: string) => s.trim()).filter(Boolean);
      const localParts = parts.slice(0, 2);
      return localParts.join("، ") + "، " + DISTRICT_NAME;
    }

    return DISTRICT_NAME;
  } catch {
    return DISTRICT_NAME;
  }
}

export const DHULUIYAH_CENTER = { lat: 34.018, lng: 44.219 };
export const DEFAULT_DISTRICT = DISTRICT_NAME;
