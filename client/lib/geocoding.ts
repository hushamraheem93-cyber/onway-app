export async function reverseGeocodeArabic(lat: number, lng: number): Promise<string> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=ar&zoom=18&addressdetails=1`;
    const res = await fetch(url, {
      headers: { "User-Agent": "OnwayApp/1.0" },
    });
    const data = await res.json();

    if (data && data.address) {
      const addr = data.address;

      const placeName = (data.addresstype !== "country" && data.addresstype !== "state") ? data.name : undefined;

      const detailParts = [
        placeName,
        addr.building,
        addr.road,
        addr.pedestrian,
        addr.neighbourhood,
        addr.quarter,
        addr.suburb,
        addr.residential,
      ].filter(Boolean);

      const areaParts = [
        addr.hamlet,
        addr.village,
        addr.town,
        addr.city_district,
        addr.subdistrict,
        addr.district,
        addr.city,
        addr.county,
        addr.state,
      ].filter(Boolean);

      const detailUnique = [...new Set(detailParts)];
      const areaUnique = [...new Set(areaParts)];

      const allParts = [...detailUnique, ...areaUnique];
      const finalUnique = [...new Set(allParts)];

      if (finalUnique.length > 0) {
        return finalUnique.slice(0, 3).join("، ");
      }
    }

    if (data && data.display_name) {
      const parts = data.display_name.split(",").map((s: string) => s.trim()).filter(Boolean);
      return parts.slice(0, 3).join("، ");
    }

    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } catch {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
}

export const DHULUIYAH_CENTER = { lat: 34.018, lng: 44.219 };
export const DEFAULT_DISTRICT = "قضاء الضلوعية";
