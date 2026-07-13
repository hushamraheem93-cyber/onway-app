import React, { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback } from "react";
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

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);

  // Add a notification delivered by Expo to the in-app history, de-duplicated by id
  // so the same push is not recorded twice (e.g. received in foreground, then tapped).
  const recordExpoNotification = useCallback((req: Notifications.NotificationRequest) => {
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
          setNotifications(parsed);
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

  const markAsRead = (id: string) => {
    setNotifications((prev) => {
      const updated = prev.map((n) => (n.id === id ? { ...n, read: true } : n));
      saveNotifications(updated);
      return updated;
    });
  };

  const markAllAsRead = () => {
    setNotifications((prev) => {
      const updated = prev.map((n) => ({ ...n, read: true }));
      saveNotifications(updated);
      return updated;
    });
  };

  const clearNotifications = () => {
    setNotifications([]);
    saveNotifications([]);
  };

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

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        markAsRead,
        markAllAsRead,
        clearNotifications,
        addNotification,
      }}
    >
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
