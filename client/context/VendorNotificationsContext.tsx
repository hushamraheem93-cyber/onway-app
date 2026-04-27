import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  Dispatch,
  SetStateAction,
  ReactNode,
} from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

interface VendorNotificationsContextType {
  unreadCount: number;
  setUnreadCount: Dispatch<SetStateAction<number>>;
}

const VendorNotificationsContext = createContext<VendorNotificationsContextType>({
  unreadCount: 0,
  setUnreadCount: () => {},
});

export function VendorNotificationsProvider({ children }: { children: ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (Platform.OS === "web") return;
    Notifications.setBadgeCountAsync(unreadCount).catch(() => {});
  }, [unreadCount]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const subscription = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data as Record<string, unknown> | undefined;
      if (!data) return;
      const type = data.type as string | undefined;
      if (type === "vendor_product" || type === "vendor_status") {
        const serverCount = data.unreadCount;
        if (typeof serverCount === "number") {
          setUnreadCount(serverCount);
        }
      }
    });
    return () => subscription.remove();
  }, []);

  return (
    <VendorNotificationsContext.Provider value={{ unreadCount, setUnreadCount }}>
      {children}
    </VendorNotificationsContext.Provider>
  );
}

export function useVendorNotifications() {
  return useContext(VendorNotificationsContext);
}
