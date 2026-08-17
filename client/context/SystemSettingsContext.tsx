import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { getApiUrl } from "@/lib/query-client";
import {
  DEFAULT_DELIVERY_PRICING,
  normalizeDeliveryPricing,
  type DeliveryPricing,
} from "@shared/deliveryPricing";

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
  /**
   * D-3: the platform's cut of the delivery fee, per order kind.
   *
   * No fee lives here. Delivery fees come from `/api/delivery-areas`, which is what
   * both the checkout screen and the server price from, so the customer can never
   * be shown one number and charged another.
   */
  deliveryPricing: DeliveryPricing;
  maxBatchSize: number;
}

const DEFAULT_SETTINGS: SystemSettings = {
  onlinePaymentEnabled: false,
  driverPayoutRule: {
    type: "flat",
    flatRestaurant: 750,
    flatDefault: 2000,
    percent: 15,
  },
  autoSuspendThreshold: 100000,
  deliveryPricing: DEFAULT_DELIVERY_PRICING,
  maxBatchSize: 3,
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
      const res = await fetch(
        new URL("/api/settings/public", getApiUrl()).toString(),
      );
      if (res.ok) {
        const data = await res.json();
        setSettings({
          onlinePaymentEnabled:
            data.onlinePaymentEnabled ?? DEFAULT_SETTINGS.onlinePaymentEnabled,
          driverPayoutRule:
            data.driverPayoutRule ?? DEFAULT_SETTINGS.driverPayoutRule,
          autoSuspendThreshold:
            data.autoSuspendThreshold ?? DEFAULT_SETTINGS.autoSuspendThreshold,
          // Normalised with the same function the server uses, so a server that has
          // not shipped deliveryPricing yet degrades to the same neutral split
          // rather than to a different guess.
          deliveryPricing: normalizeDeliveryPricing(data.deliveryPricing),
          maxBatchSize: data.maxBatchSize ?? DEFAULT_SETTINGS.maxBatchSize,
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
