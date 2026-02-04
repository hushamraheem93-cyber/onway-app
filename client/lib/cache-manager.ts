import AsyncStorage from "@react-native-async-storage/async-storage";

const CACHE_PREFIX = "app_cache_";
const CACHE_EXPIRY = 30 * 60 * 1000; // 30 minutes

interface CacheItem<T> {
  data: T;
  timestamp: number;
  expiry: number;
}

export const CacheManager = {
  async set<T>(key: string, data: T, expiryMs: number = CACHE_EXPIRY): Promise<void> {
    try {
      const cacheItem: CacheItem<T> = {
        data,
        timestamp: Date.now(),
        expiry: expiryMs,
      };
      await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(cacheItem));
    } catch (error) {
      console.warn("Cache set error:", error);
    }
  },

  async get<T>(key: string): Promise<T | null> {
    try {
      const cached = await AsyncStorage.getItem(CACHE_PREFIX + key);
      if (!cached) return null;

      const cacheItem: CacheItem<T> = JSON.parse(cached);
      const isExpired = Date.now() - cacheItem.timestamp > cacheItem.expiry;

      if (isExpired) {
        await AsyncStorage.removeItem(CACHE_PREFIX + key);
        return null;
      }

      return cacheItem.data;
    } catch (error) {
      console.warn("Cache get error:", error);
      return null;
    }
  },

  async remove(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(CACHE_PREFIX + key);
    } catch (error) {
      console.warn("Cache remove error:", error);
    }
  },

  async clear(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter((k) => k.startsWith(CACHE_PREFIX));
      await AsyncStorage.multiRemove(cacheKeys);
    } catch (error) {
      console.warn("Cache clear error:", error);
    }
  },

  async clearExpired(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter((k) => k.startsWith(CACHE_PREFIX));
      
      for (const key of cacheKeys) {
        const cached = await AsyncStorage.getItem(key);
        if (cached) {
          const cacheItem = JSON.parse(cached);
          const isExpired = Date.now() - cacheItem.timestamp > cacheItem.expiry;
          if (isExpired) {
            await AsyncStorage.removeItem(key);
          }
        }
      }
    } catch (error) {
      console.warn("Cache clear expired error:", error);
    }
  },
};

export const useCachedFetch = async <T>(
  key: string,
  fetchFn: () => Promise<T>,
  expiryMs?: number
): Promise<T> => {
  const cached = await CacheManager.get<T>(key);
  if (cached) return cached;

  const data = await fetchFn();
  await CacheManager.set(key, data, expiryMs);
  return data;
};
