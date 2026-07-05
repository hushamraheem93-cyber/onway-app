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

export async function getToken(key: string): Promise<string | null> {
  try {
    return useSecureStore ? await SecureStore.getItemAsync(key) : await AsyncStorage.getItem(key);
  } catch (err) {
    console.warn(`[secureTokenStorage] getToken(${key}) failed:`, err);
    return null;
  }
}

export async function setToken(key: string, value: string): Promise<void> {
  try {
    if (useSecureStore) {
      await SecureStore.setItemAsync(key, value);
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
      await SecureStore.deleteItemAsync(key);
    } else {
      await AsyncStorage.removeItem(key);
    }
  } catch (err) {
    console.warn(`[secureTokenStorage] removeToken(${key}) failed:`, err);
  }
}
