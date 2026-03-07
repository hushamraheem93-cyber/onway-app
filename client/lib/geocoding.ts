export async function reverseGeocodeArabic(lat: number, lng: number): Promise<string> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=ar&zoom=18&addressdetails=1`;
    const res = await fetch(url, {
      headers: { "User-Agent": "OnwayApp/1.0" },
    });
    const data = await res.json();

    if (data && data.display_name) {
      const rawParts = data.display_name
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);

      const filtered = rawParts.filter(
        (p: string) => p !== "العراق" && !/^\d+$/.test(p)
      );

      if (filtered.length > 0) {
        return filtered.slice(0, 3).join("، ");
      }
    }

    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } catch {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
}

export function isGenericAddress(address: string): boolean {
  if (!address) return true;
  const trimmed = address.trim();
  if (trimmed === "قضاء الضلوعية") return true;
  if (trimmed === "قضاء الضلوعية، محافظة صلاح الدين") return true;
  if (/^قضاء\s/.test(trimmed) && trimmed.split("،").length <= 2) return true;
  return false;
}

export const DHULUIYAH_CENTER = { lat: 34.018, lng: 44.219 };
export const DEFAULT_DISTRICT = "قضاء الضلوعية";
