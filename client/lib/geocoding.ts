import { getApiUrl } from "@/lib/query-client";

export async function reverseGeocodeArabic(lat: number, lng: number): Promise<string> {
  try {
    const apiUrl = getApiUrl();
    const url = new URL(`/api/reverse-geocode?lat=${lat}&lng=${lng}`, apiUrl).toString();
    const res = await fetch(url);
    const data = await res.json();
    if (data.address) {
      return data.address;
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
  if (/^(الضلوعية|قضاء الضلوعية)(،\s*(قضاء الضلوعية|محافظة صلاح الدين))*$/.test(trimmed)) return true;
  return false;
}

export const DHULUIYAH_CENTER = { lat: 34.018, lng: 44.219 };
export const DEFAULT_DISTRICT = "قضاء الضلوعية";
