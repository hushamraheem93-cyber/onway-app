import React, { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback, useMemo } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotifications: () => void;
  addNotification: (title: string, body: string, data?: Record<string, unknown>) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const NOTIFICATIONS_STORAGE_KEY = "@onway_notifications";

// This in-app history is the CUSTOMER notification list (the vendor has its own
// VendorNotificationsContext, the driver/admin have their own screens). A single
// device can receive admin/vendor/driver pushes too — e.g. a tester logged into
// several roles on one phone, or a device whose Expo token is the global admin
// token — and without this filter those leaked into the customer bell as
// "طلب جديد" / "طلب جديد وصلك". Drop any push whose data.type belongs to another
// audience; customer pushes are order-status updates (data { orderId, status } —
// no type) and admin broadcasts, so anything not in this set is kept.
const NON_CUSTOMER_NOTIFICATION_TYPES = new Set([
  "new_order", // admin: new order placed
  "new_batch", // driver: batch assignment
  "vendor_status", // vendor: store approval/suspension
  "vendor_product", // vendor: product event
  "vendor_new_order", // vendor: new order arrived
  "vendor_order_reminder", // vendor: stale order reminder
  "settlement_request", // admin: settlement request
  "order_ready_for_driver", // driver: order ready for pickup
  "order_cancelled", // vendor/driver cancellation notice (customer cancel uses status, not type)
]);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);

  // Add a notification delivered by Expo to the in-app history, de-duplicated by id
  // so the same push is not recorded twice (e.g. received in foreground, then tapped).
  const recordExpoNotification = useCallback((req: Notifications.NotificationRequest) => {
    const type = (req.content.data as Record<string, unknown> | undefined)?.type;
    if (typeof type === "string" && NON_CUSTOMER_NOTIFICATION_TYPES.has(type)) {
      return; // belongs to the vendor/driver/admin audience, not the customer bell
    }
    const item: AppNotification = {
      id: req.identifier,
      title: req.content.title || "",
      body: req.content.body || "",
      data: req.content.data as Record<string, unknown>,
      read: false,
      createdAt: new Date().toISOString(),
    };
    setNotifications((prev) => {
      if (prev.some((n) => n.id === item.id)) return prev;
      const updated = [item, ...prev].slice(0, 50);
      saveNotifications(updated);
      return updated;
    });
  }, []);

  useEffect(() => {
    loadNotifications();

    if (Platform.OS !== "web") {
      // Received while the app is foregrounded.
      notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
        recordExpoNotification(notification.request);
      });

      // Tapped while the app was backgrounded/closed — previously these never entered
      // the in-app history, so the notifications list was incomplete for real users.
      responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
        recordExpoNotification(response.notification.request);
      });

      // Cold start: app opened by tapping a notification while it was killed.
      Notifications.getLastNotificationResponseAsync()
        .then((response) => {
          if (response) recordExpoNotification(response.notification.request);
        })
        .catch(() => {});
    }

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [recordExpoNotification]);

  const loadNotifications = async () => {
    try {
      const stored = await AsyncStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          // Purge any non-customer notifications persisted before the audience
          // filter existed, so old leaked "طلب جديد"/"طلب جديد وصلك" entries clear
          // themselves on next launch instead of needing a manual "مسح الكل".
          const cleaned = parsed.filter((n) => {
            const type = (n?.data as Record<string, unknown> | undefined)?.type;
            return !(typeof type === "string" && NON_CUSTOMER_NOTIFICATION_TYPES.has(type));
          });
          setNotifications(cleaned);
          if (cleaned.length !== parsed.length) saveNotifications(cleaned);
        } else {
          setNotifications([]);
        }
      }
    } catch (error) {
      setNotifications([]);
    }
  };

  const saveNotifications = async (notifs: AppNotification[]) => {
    try {
      await AsyncStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(notifs));
    } catch (error) {
    }
  };

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) => {
      const updated = prev.map((n) => (n.id === id ? { ...n, read: true } : n));
      saveNotifications(updated);
      return updated;
    });
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => {
      const updated = prev.map((n) => ({ ...n, read: true }));
      saveNotifications(updated);
      return updated;
    });
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
    saveNotifications([]);
  }, []);

  const addNotification = useCallback((title: string, body: string, data?: Record<string, unknown>) => {
    const newNotification: AppNotification = {
      id: `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title,
      body,
      data,
      read: false,
      createdAt: new Date().toISOString(),
    };
    
    setNotifications((prev) => {
      const updated = [newNotification, ...prev].slice(0, 50);
      saveNotifications(updated);
      return updated;
    });
  }, []);

  const unreadCount = Array.isArray(notifications) ? notifications.filter((n) => !n.read).length : 0;

  const value = useMemo(
    () => ({
      notifications,
      unreadCount,
      markAsRead,
      markAllAsRead,
      clearNotifications,
      addNotification,
    }),
    [notifications, unreadCount, markAsRead, markAllAsRead, clearNotifications, addNotification],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return context;
}
