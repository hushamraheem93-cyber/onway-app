import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const VENDOR_FAV_KEY = "@onway_vendor_favorites";

export interface FavoriteVendor {
  id: string;
  storeName: string;
  businessType: string;
  profileImageUrl?: string;
  coverImageUrl?: string;
  rating?: number;
  deliveryTime?: string;
  deliveryPrice?: number;
  address?: string;
  workingHours?: { openTime: string; closeTime: string; openDays: number[] } | null;
}

interface VendorFavoritesContextType {
  vendorFavorites: FavoriteVendor[];
  toggleVendorFavorite: (vendor: FavoriteVendor) => void;
  isVendorFavorite: (id: string) => boolean;
}

const VendorFavoritesContext = createContext<VendorFavoritesContextType | undefined>(undefined);

export function VendorFavoritesProvider({ children }: { children: ReactNode }) {
  const [vendorFavorites, setVendorFavorites] = useState<FavoriteVendor[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(VENDOR_FAV_KEY)
      .then((raw) => { if (raw) setVendorFavorites(JSON.parse(raw)); })
      .catch(() => {});
  }, []);

  const save = (next: FavoriteVendor[]) => {
    AsyncStorage.setItem(VENDOR_FAV_KEY, JSON.stringify(next)).catch(() => {});
  };

  const toggleVendorFavorite = useCallback((vendor: FavoriteVendor) => {
    setVendorFavorites((prev) => {
      const exists = prev.some((v) => v.id === vendor.id);
      const next = exists ? prev.filter((v) => v.id !== vendor.id) : [...prev, vendor];
      save(next);
      return next;
    });
  }, []);

  const isVendorFavorite = useCallback(
    (id: string) => vendorFavorites.some((v) => v.id === id),
    [vendorFavorites]
  );

  return (
    <VendorFavoritesContext.Provider value={{ vendorFavorites, toggleVendorFavorite, isVendorFavorite }}>
      {children}
    </VendorFavoritesContext.Provider>
  );
}

export function useVendorFavorites() {
  const ctx = useContext(VendorFavoritesContext);
  if (!ctx) throw new Error("useVendorFavorites must be used within VendorFavoritesProvider");
  return ctx;
}
