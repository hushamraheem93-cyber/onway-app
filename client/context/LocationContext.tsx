import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface SavedLocation {
  latitude: number;
  longitude: number;
  address: string;
}

interface LocationContextType {
  savedLocation: SavedLocation | null;
  setSavedLocation: (location: SavedLocation) => void;
  clearLocation: () => void;
}

const LocationContext = createContext<LocationContextType>({
  savedLocation: null,
  setSavedLocation: () => {},
  clearLocation: () => {},
});

const STORAGE_KEY = "onway_saved_location";

export function LocationProvider({ children }: { children: ReactNode }) {
  const [savedLocation, setSavedLocationState] = useState<SavedLocation | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((data) => {
      if (data) {
        try {
          setSavedLocationState(JSON.parse(data));
        } catch {}
      }
    });
  }, []);

  const setSavedLocation = useCallback((location: SavedLocation) => {
    setSavedLocationState(location);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(location));
  }, []);

  const clearLocation = useCallback(() => {
    setSavedLocationState(null);
    AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  const value = useMemo(
    () => ({ savedLocation, setSavedLocation, clearLocation }),
    [savedLocation, setSavedLocation, clearLocation],
  );

  return (
    <LocationContext.Provider value={value}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation() {
  return useContext(LocationContext);
}
