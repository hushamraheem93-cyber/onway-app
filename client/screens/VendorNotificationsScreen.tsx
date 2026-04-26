import React, { useCallback, useState, ComponentProps } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useFocusEffect } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

type MCIcon = ComponentProps<typeof MaterialCommunityIcons>["name"];

import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";
import { useVendorNotifications } from "@/context/VendorNotificationsContext";
import { getApiUrl } from "@/lib/query-client";

const PURPLE = "#673AB7";

interface VendorNotification {
  id: string;
  vendorId: string;
  type: string;
  title: string;
  message: string;
  status: "unread" | "read";
  createdAt: string;
}

function notifTheme(type: string): {
  bg: string;
  border: string;
  icon: MCIcon;
  iconColor: string;
  readBg: string;
  readBorder: string;
  readIconColor: string;
} {
  if (type === "vendor_active" || type === "product_approved")
    return {
      bg: "#F0FDF4",
      border: "#86EFAC",
      icon: "check-circle",
      iconColor: "#16A34A",
      readBg: "#F9FEFB",
      readBorder: "#D1FAE5",
      readIconColor: "#6EE7A6",
    };
  if (type === "vendor_rejected" || type === "product_rejected")
    return {
      bg: "#FFF5F5",
      border: "#FECACA",
      icon: "close-circle",
      iconColor: "#DC2626",
      readBg: "#FFFAFA",
      readBorder: "#FEE2E2",
      readIconColor: "#FCA5A5",
    };
  if (type === "vendor_suspended")
    return {
      bg: "#FFFBEB",
      border: "#FDE68A",
      icon: "alert-circle",
      iconColor: "#D97706",
      readBg: "#FFFDF5",
      readBorder: "#FEF3C7",
      readIconColor: "#FCD34D",
    };
  return {
    bg: "#F0F9FF",
    border: "#BAE6FD",
    icon: "bell",
    iconColor: PURPLE,
    readBg: "#F8FBFF",
    readBorder: "#E0F2FE",
    readIconColor: "#93C5FD",
  };
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "الآن";
  if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
  if (diffHours < 24) return `منذ ${diffHours} ساعة`;
  if (diffDays === 1) return "أمس";
  if (diffDays < 7) return `منذ ${diffDays} أيام`;
  return d.toLocaleDateString("ar", { day: "numeric", month: "short", year: "numeric" });
}

export default function VendorNotificationsScreen() {
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { vendorToken } = useAuth();
  const { setUnreadCount } = useVendorNotifications();

  const [notifications, setNotifications] = useState<VendorNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadNotifications = useCallback(async () => {
    if (!vendorToken) return;
    try {
      const res = await fetch(new URL("/api/vendor/notifications", getApiUrl()).toString(), {
        headers: { Authorization: `Bearer ${vendorToken}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const all: VendorNotification[] = data.notifications || [];
      setNotifications(all);
      const unread = all.filter((n) => n.status === "unread").length;
      setUnreadCount(unread);
    } catch {}
  }, [vendorToken, setUnreadCount]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadNotifications().finally(() => setLoading(false));
    }, [loadNotifications])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadNotifications();
    setRefreshing(false);
  }, [loadNotifications]);

  const markRead = useCallback(
    async (ids: string[]) => {
      if (!vendorToken || ids.length === 0) return;
      try {
        await fetch(new URL("/api/vendor/notifications/mark-read", getApiUrl()).toString(), {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${vendorToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ids }),
        });
      } catch {}
    },
    [vendorToken]
  );

  const dismissNotification = useCallback(
    (notif: VendorNotification) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, status: "read" } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      markRead([notif.id]);
    },
    [markRead, setUnreadCount]
  );

  const renderItem = useCallback(
    ({ item }: { item: VendorNotification }) => {
      const isRead = item.status === "read";
      const theme = notifTheme(item.type);
      const bg = isRead ? theme.readBg : theme.bg;
      const border = isRead ? theme.readBorder : theme.border;
      const iconColor = isRead ? theme.readIconColor : theme.iconColor;

      return (
        <View
          style={[styles.notifCard, { backgroundColor: bg, borderColor: border }]}
          testID={`notification-${item.id}`}
        >
          <MaterialCommunityIcons
            name={theme.icon}
            size={24}
            color={iconColor}
            style={styles.notifIcon}
          />
          <View style={styles.notifBody}>
            <ThemedText
              style={[styles.notifTitle, isRead ? styles.readTitle : null, { color: isRead ? "#888" : theme.iconColor }]}
            >
              {item.title}
            </ThemedText>
            <ThemedText style={[styles.notifMessage, isRead && styles.readMessage]}>
              {item.message}
            </ThemedText>
            <ThemedText style={styles.notifDate}>{formatDate(item.createdAt)}</ThemedText>
          </View>
          {!isRead ? (
            <Pressable
              onPress={() => dismissNotification(item)}
              style={styles.dismissBtn}
              testID={`button-dismiss-notification-${item.id}`}
              hitSlop={8}
            >
              <Feather name="x" size={16} color="#999" />
            </Pressable>
          ) : (
            <View style={styles.readDot} />
          )}
        </View>
      );
    },
    [dismissNotification]
  );

  if (loading) {
    return (
      <View style={[styles.centered, { paddingTop: headerHeight }]}>
        <ActivityIndicator color={PURPLE} size="large" />
      </View>
    );
  }

  return (
    <FlatList
      data={notifications}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      contentContainerStyle={{
        paddingTop: headerHeight + 12,
        paddingBottom: tabBarHeight + 24,
        paddingHorizontal: 16,
        flexGrow: 1,
      }}
      scrollIndicatorInsets={{ bottom: tabBarHeight }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={PURPLE}
          progressViewOffset={headerHeight}
        />
      }
      ListEmptyComponent={
        <View style={styles.emptyContainer} testID="notifications-empty">
          <MaterialCommunityIcons name="bell-off-outline" size={56} color="#D1C4E9" />
          <ThemedText style={styles.emptyTitle}>لا توجد إشعارات</ThemedText>
          <ThemedText style={styles.emptySubtitle}>
            ستظهر هنا إشعارات الموافقة والرفض وتحديثات حسابك
          </ThemedText>
        </View>
      }
      testID="notifications-list"
    />
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F8F7FF",
  },
  notifCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  notifIcon: {
    marginTop: 2,
    marginLeft: 4,
  },
  notifBody: {
    flex: 1,
    marginHorizontal: 10,
  },
  notifTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    marginBottom: 2,
    textAlign: "right",
  },
  readTitle: {
    fontFamily: "Cairo_400Regular",
  },
  notifMessage: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: "#444",
    textAlign: "right",
    lineHeight: 20,
  },
  readMessage: {
    color: "#999",
  },
  notifDate: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    color: "#BBB",
    marginTop: 4,
    textAlign: "right",
  },
  dismissBtn: {
    marginTop: 2,
    padding: 2,
  },
  readDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#E5E7EB",
    marginTop: 8,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
  },
  emptyTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 18,
    color: "#9CA3AF",
    marginTop: 16,
  },
  emptySubtitle: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: "#C4B5FD",
    marginTop: 6,
    textAlign: "center",
    paddingHorizontal: 32,
    lineHeight: 20,
  },
});
