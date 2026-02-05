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

  useEffect(() => {
    loadNotifications();

    if (Platform.OS !== "web") {
      notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
        const newNotification: AppNotification = {
          id: notification.request.identifier,
          title: notification.request.content.title || "",
          body: notification.request.content.body || "",
          data: notification.request.content.data as Record<string, unknown>,
          read: false,
          createdAt: new Date().toISOString(),
        };
        
        setNotifications((prev) => {
          const updated = [newNotification, ...prev].slice(0, 50);
          saveNotifications(updated);
          return updated;
        });
      });
    }

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
    };
  }, []);

  const loadNotifications = async () => {
    try {
      const stored = await AsyncStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
      if (stored) {
        setNotifications(JSON.parse(stored));
      }
    } catch (error) {
      console.error("Error loading notifications:", error);
    }
  };

  const saveNotifications = async (notifs: AppNotification[]) => {
    try {
      await AsyncStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(notifs));
    } catch (error) {
      console.error("Error saving notifications:", error);
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

  const unreadCount = notifications.filter((n) => !n.read).length;

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
