import { useState, useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { getApiUrl } from "@/lib/query-client";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export interface PushNotificationState {
  expoPushToken: string | null;
  notification: Notifications.Notification | null;
}

export function usePushNotifications() {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);
  const tokenRefreshListener = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    registerForPushNotificationsAsync().then((token) => {
      if (token) {
        setExpoPushToken(token);
      }
    });

    notificationListener.current = Notifications.addNotificationReceivedListener((notif: Notifications.Notification) => {
      setNotification(notif);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener((resp: Notifications.NotificationResponse) => {
      console.log("Notification response:", resp);
    });

    tokenRefreshListener.current = Notifications.addPushTokenListener((tokenData) => {
      if (tokenData.data) {
        setExpoPushToken(tokenData.data);
        console.log("[PUSH] Token refreshed:", tokenData.data.slice(-10));
      }
    });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
      tokenRefreshListener.current?.remove();
    };
  }, []);

  return { expoPushToken, notification };
}

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  let token: string | null = null;

  if (Platform.OS === "web") {
    return null;
  }

  if (!Device.isDevice) {
    console.log("Must use physical device for Push Notifications");
    return null;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Onway",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#D94523",
      sound: "default",
      enableVibrate: true,
      showBadge: true,
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.log("Failed to get push token for push notification!");
    return null;
  }

  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (projectId) {
      token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    } else {
      token = (await Notifications.getExpoPushTokenAsync()).data;
    }
  } catch (error) {
    console.log("Error getting push token:", error);
  }

  return token;
}

export async function refreshDriverPushToken(phoneNumber: string): Promise<void> {
  try {
    const token = await registerForPushNotificationsAsync();
    if (!token || !phoneNumber) return;
    await fetch(new URL("/api/driver/refresh-push-token", getApiUrl()).toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phoneNumber, pushToken: token }),
    });
    console.log("[PUSH] Driver token refreshed and saved");
  } catch (error) {
    console.log("[PUSH] Error refreshing driver token:", error);
  }
}

export async function sendLocalNotification(title: string, body: string) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: "default",
    },
    trigger: null,
  });
}
