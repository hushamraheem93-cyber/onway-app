async function findNearestRoad(lat: number, lng: number): Promise<string | null> {
  try {
    const query = `[out:json][timeout:5];way["highway"]["name"](around:500,${lat},${lng});out tags 1;`;
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.elements && data.elements.length > 0) {
      return data.elements[0].tags?.name || null;
    }
    return null;
  } catch {
    return null;
  }
}

async function findNearestPOI(lat: number, lng: number): Promise<string | null> {
  try {
    const query = `[out:json][timeout:5];(node["name"]["amenity"](around:200,${lat},${lng});node["name"]["shop"](around:200,${lat},${lng});node["name"]["tourism"](around:200,${lat},${lng}););out tags 1;`;
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.elements && data.elements.length > 0) {
      return data.elements[0].tags?.name || null;
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchNominatim(lat: number, lng: number): Promise<{ town: string | null; district: string | null; road: string | null }> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=ar&zoom=18&addressdetails=1`;
    const res = await fetch(url, {
      headers: { "User-Agent": "OnwayApp/1.0" },
    });
    const data = await res.json();
    const addr = data?.address || {};
    return {
      town: addr.village || addr.town || addr.hamlet || addr.city || null,
      district: addr.district || addr.county || null,
      road: addr.road || addr.pedestrian || addr.neighbourhood || addr.quarter || null,
    };
  } catch {
    return { town: null, district: null, road: null };
  }
}

export async function reverseGeocodeArabic(lat: number, lng: number): Promise<string> {
  try {
    const [nominatim, overpassRoad, overpassPOI] = await Promise.all([
      fetchNominatim(lat, lng),
      findNearestRoad(lat, lng),
      findNearestPOI(lat, lng),
    ]);

    const parts: string[] = [];

    if (overpassPOI) {
      parts.push(overpassPOI);
    }

    const roadName = nominatim.road || overpassRoad;
    if (roadName) {
      parts.push(roadName);
    }

    if (nominatim.town) {
      parts.push(nominatim.town);
    }

    if (parts.length === 0 && nominatim.district) {
      parts.push(nominatim.district);
    }

    if (parts.length === 0) {
      return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    }

    const unique = [...new Set(parts)];
    return unique.slice(0, 3).join("، ");
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
