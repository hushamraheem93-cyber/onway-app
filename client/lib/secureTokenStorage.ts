// Secure storage wrapper for auth tokens only.
//
// WHY THIS EXISTS: customer/vendor JWTs were previously stored in plain
// AsyncStorage, which is NOT encrypted on-device — readable by anything with
// filesystem access (rooted/jailbroken devices, device backups, other apps in
// some misconfigurations). expo-secure-store uses the OS Keychain (iOS) /
// Keystore (Android), which IS encrypted at rest.
//
// SecureStore has no web implementation, so on Platform.OS === "web" this
// transparently falls back to AsyncStorage (matches previous behavior there —
// web already has weaker storage guarantees than native, so this doesn't
// regress anything on that platform).
//
// Only use this for actual secrets (JWTs). Non-sensitive data (profile,
// preferences, phone number) should keep using AsyncStorage directly — moving
// everything to SecureStore adds no security benefit and SecureStore has a
// much smaller storage quota than AsyncStorage.
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

const useSecureStore = Platform.OS !== "web";

// SecureStore keys may contain ONLY [A-Za-z0-9._-]. Our token keys start with "@"
// (e.g. "@onway_driver_token"). On iOS, SecureStore THROWS on an invalid key, so
// setItemAsync silently failed (the catch only warned) and NO token was ever
// persisted — every /api/driver|vendor/* call then 401'd ("يرجى تسجيل الدخول
// أولاً") and the app stayed stuck on "قيد المراجعة" even after admin approval,
// because the self-heal had no stored customer token to re-exchange. Sanitize the
// key ONLY for SecureStore (AsyncStorage/web accepts "@" fine, so web tokens keep
// their key). No native migration is needed: nothing was ever stored there.
function secureKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, "_");
}

export async function getToken(key: string): Promise<string | null> {
  try {
    return useSecureStore
      ? await SecureStore.getItemAsync(secureKey(key))
      : await AsyncStorage.getItem(key);
  } catch (err) {
    console.warn(`[secureTokenStorage] getToken(${key}) failed:`, err);
    return null;
  }
}

export async function setToken(key: string, value: string): Promise<void> {
  try {
    if (useSecureStore) {
      await SecureStore.setItemAsync(secureKey(key), value);
    } else {
      await AsyncStorage.setItem(key, value);
    }
  } catch (err) {
    console.warn(`[secureTokenStorage] setToken(${key}) failed:`, err);
  }
}

export async function removeToken(key: string): Promise<void> {
  try {
    if (useSecureStore) {
      await SecureStore.deleteItemAsync(secureKey(key));
    } else {
      await AsyncStorage.removeItem(key);
    }
  } catch (err) {
    console.warn(`[secureTokenStorage] removeToken(${key}) failed:`, err);
  }
}
