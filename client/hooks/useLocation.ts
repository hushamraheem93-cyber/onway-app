/**
 * useLocation — Re-export from LocationContext + GPS helper.
 */

import * as ExpoLocation from "expo-location";

export { useLocation } from "@/context/LocationContext";

/** Request foreground permission and return current GPS coordinates once. */
export async function requestCurrentPosition(): Promise<{ latitude: number; longitude: number } | null> {
  const { status } = await ExpoLocation.requestForegroundPermissionsAsync();
  if (status !== "granted") return null;
  const loc = await ExpoLocation.getCurrentPositionAsync({
    accuracy: ExpoLocation.Accuracy.Balanced,
  });
  return { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
}
