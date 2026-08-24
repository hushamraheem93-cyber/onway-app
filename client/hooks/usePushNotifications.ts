import { useState, useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});


export function usePushNotifications(onNotificationTap?: () => void) {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] =
    useState<Notifications.Notification | null>(null);
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);
  const tokenRefreshListener = useRef<Notifications.Subscription | null>(null);
  const onNotificationTapRef = useRef(onNotificationTap);

  useEffect(() => {
    onNotificationTapRef.current = onNotificationTap;
  }, [onNotificationTap]);

  useEffect(() => {
    registerForPushNotificationsAsync().then((token) => {
      if (token) {
        setExpoPushToken(token);
      }
    });

    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        Notifications.clearLastNotificationResponseAsync();
        onNotificationTapRef.current?.();
      }
    });

    notificationListener.current =
      Notifications.addNotificationReceivedListener(
        (notif: Notifications.Notification) => {
          setNotification(notif);
        },
      );

    responseListener.current =
      Notifications.addNotificationResponseReceivedListener(() => {
        onNotificationTapRef.current?.();
      });

    tokenRefreshListener.current = Notifications.addPushTokenListener(
      (tokenData) => {
        if (tokenData.data) {
          setExpoPushToken(tokenData.data);
        }
      },
    );

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
      tokenRefreshListener.current?.remove();
    };
  }, []);

  return { expoPushToken, notification };
}

export async function registerForPushNotificationsAsync(): Promise<
  string | null
> {
  let token: string | null = null;

  if (Platform.OS === "web") {
    return null;
  }

  if (!Device.isDevice) {
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
    return null;
  }

  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;
    if (projectId) {
      token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    } else {
      token = (await Notifications.getExpoPushTokenAsync()).data;
    }
  } catch {
    // silent
  }

  return token;
}


