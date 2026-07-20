import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { getApiUrl } from "@/lib/query-client";

export interface DriverPayoutRule {
  type: "flat" | "percent";
  flatRestaurant: number;
  flatDefault: number;
  percent: number;
}

interface SystemSettings {
  onlinePaymentEnabled: boolean;
  driverPayoutRule: DriverPayoutRule;
  autoSuspendThreshold: number;
}

const DEFAULT_SETTINGS: SystemSettings = {
  onlinePaymentEnabled: false,
  driverPayoutRule: { type: "flat", flatRestaurant: 750, flatDefault: 2000, percent: 15 },
  autoSuspendThreshold: 100000,
};

interface SystemSettingsContextType {
  settings: SystemSettings;
  isLoaded: boolean;
  refresh: () => Promise<void>;
}

const SystemSettingsContext = createContext<SystemSettingsContextType>({
  settings: DEFAULT_SETTINGS,
  isLoaded: false,
  refresh: async () => {},
});

export function SystemSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  const refresh = async () => {
    try {
      const res = await fetch(new URL("/api/settings/public", getApiUrl()).toString());
      if (res.ok) {
        const data = await res.json();
        setSettings({
          onlinePaymentEnabled: data.onlinePaymentEnabled ?? DEFAULT_SETTINGS.onlinePaymentEnabled,
          driverPayoutRule: data.driverPayoutRule ?? DEFAULT_SETTINGS.driverPayoutRule,
          autoSuspendThreshold: data.autoSuspendThreshold ?? DEFAULT_SETTINGS.autoSuspendThreshold,
        });
      }
    } catch {
      // Keep defaults on network error
    } finally {
      setIsLoaded(true);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <SystemSettingsContext.Provider value={{ settings, isLoaded, refresh }}>
      {children}
    </SystemSettingsContext.Provider>
  );
}

export function useSystemSettings(): SystemSettingsContextType {
  return useContext(SystemSettingsContext);
}
