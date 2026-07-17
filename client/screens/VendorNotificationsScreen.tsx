import React, { useCallback, useState, useEffect, ComponentProps } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Platform,
} from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";

type MCIcon = ComponentProps<typeof MaterialCommunityIcons>["name"];

import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";
import { useVendorNotifications } from "@/context/VendorNotificationsContext";
import { getApiUrl } from "@/lib/query-client";
import { AppColors } from "@/constants/theme";

const PURPLE = AppColors.vendorPurple;

const ACCOUNT_TYPES = ["vendor_active", "vendor_rejected", "vendor_suspended"];
const PRODUCT_TYPES = ["product_approved", "product_rejected"];

type FilterType = "all" | "account" | "products";

interface FilterChip {
  key: FilterType;
  label: string;
}

const FILTER_CHIPS: FilterChip[] = [
  { key: "all", label: "الكل" },
  { key: "account", label: "الحساب" },
  { key: "products", label: "المنتجات" },
];

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
      bg: AppColors.successLight,
      border: AppColors.success,
      icon: "check-circle",
      iconColor: AppColors.success,
      readBg: AppColors.successLight,
      readBorder: AppColors.successLight,
      readIconColor: AppColors.success,
    };
  if (type === "vendor_rejected" || type === "product_rejected")
    return {
      bg: AppColors.errorLight,
      border: AppColors.error,
      icon: "close-circle",
      iconColor: AppColors.error,
      readBg: AppColors.secondary,
      readBorder: AppColors.errorLight,
      readIconColor: AppColors.error,
    };
  if (type === "vendor_suspended")
    return {
      bg: AppColors.warningLight,
      border: AppColors.warning,
      icon: "alert-circle",
      iconColor: AppColors.warning,
      readBg: AppColors.secondary,
      readBorder: AppColors.warningLight,
      readIconColor: AppColors.warning,
    };
  return {
    bg: AppColors.infoLight,
    border: AppColors.infoLight,
    icon: "bell",
    iconColor: PURPLE,
    readBg: AppColors.infoLight,
    readBorder: AppColors.infoLight,
    readIconColor: AppColors.info,
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

function filterNotifications(
  notifications: VendorNotification[],
  filter: FilterType
): VendorNotification[] {
  if (filter === "account") return notifications.filter((n) => ACCOUNT_TYPES.includes(n.type));
  if (filter === "products") return notifications.filter((n) => PRODUCT_TYPES.includes(n.type));
  return notifications;
}

function FilterChips({
  activeFilter,
  onSelect,
}: {
  activeFilter: FilterType;
  onSelect: (f: FilterType) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipsRow}
      testID="filter-chips-row"
    >
      {FILTER_CHIPS.map((chip) => {
        const isActive = chip.key === activeFilter;
        return (
          <Pressable
            key={chip.key}
            onPress={() => {
              Haptics.selectionAsync();
              onSelect(chip.key);
            }}
            style={[styles.chip, isActive ? styles.chipActive : styles.chipInactive]}
            testID={`filter-chip-${chip.key}`}
          >
            <ThemedText style={[styles.chipLabel, isActive ? styles.chipLabelActive : styles.chipLabelInactive]}>
              {chip.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export default function VendorNotificationsScreen() {
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { vendorToken } = useAuth();
  const { setUnreadCount } = useVendorNotifications();
  const navigation = useNavigation();

  const [notifications, setNotifications] = useState<VendorNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");

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
      if (Platform.OS !== "web") {
        Notifications.setBadgeCountAsync(unread).catch(() => {});
      }
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

  const markAllRead = useCallback(async () => {
    const unreadIds = notifications.filter((n) => n.status === "unread").map((n) => n.id);
    if (unreadIds.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setNotifications((prev) => prev.map((n) => ({ ...n, status: "read" as const })));
    setUnreadCount(0);
    if (Platform.OS !== "web") {
      Notifications.setBadgeCountAsync(0).catch(() => {});
    }
    await markRead(unreadIds);
  }, [notifications, markRead, setUnreadCount]);

  const hasUnread = notifications.some((n) => n.status === "unread");

  useEffect(() => {
    navigation.setOptions({
      headerRight: hasUnread
        ? () => (
            <Pressable
              onPress={markAllRead}
              style={styles.markAllBtn}
              testID="button-mark-all-read"
              hitSlop={8}
            >
              <ThemedText style={styles.markAllText}>تحديد الكل كمقروء</ThemedText>
            </Pressable>
          )
        : undefined,
    });
  }, [navigation, hasUnread, markAllRead]);

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
              style={[styles.notifTitle, isRead ? styles.readTitle : null, { color: isRead ? AppColors.gray500 : theme.iconColor }]}
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
              <Feather name="x" size={16} color={AppColors.gray400} />
            </Pressable>
          ) : (
            <View style={styles.readDot} />
          )}
        </View>
      );
    },
    [dismissNotification]
  );

  const filteredNotifications = filterNotifications(notifications, activeFilter);

  const listHeader = (
    <FilterChips activeFilter={activeFilter} onSelect={setActiveFilter} />
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
      data={filteredNotifications}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      ListHeaderComponent={listHeader}
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
          <MaterialCommunityIcons name="bell-off-outline" size={56} color={AppColors.vendorPurpleLight} />
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
    backgroundColor: AppColors.vendorPurpleLight,
  },
  chipsRow: {
    flexDirection: "row",
    paddingBottom: 14,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 18,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  chipActive: {
    backgroundColor: PURPLE,
    borderColor: PURPLE,
  },
  chipInactive: {
    backgroundColor: AppColors.vendorPurpleLight,
    borderColor: AppColors.vendorPurpleLight,
  },
  chipLabel: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 13,
  },
  chipLabelActive: {
    color: AppColors.white,
  },
  chipLabelInactive: {
    color: AppColors.statusPurple,
  },
  notifCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderWidth: 1,
    borderRadius: 18,
    padding: 15,
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
    color: AppColors.gray700,
    textAlign: "right",
    lineHeight: 20,
  },
  readMessage: {
    color: AppColors.gray400,
  },
  notifDate: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    color: AppColors.gray300,
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
    backgroundColor: AppColors.divider,
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
    color: AppColors.gray400,
    marginTop: 16,
  },
  emptySubtitle: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: AppColors.vendorPurpleLight,
    marginTop: 6,
    textAlign: "center",
    paddingHorizontal: 32,
    lineHeight: 20,
  },
  markAllBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  markAllText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 13,
    color: PURPLE,
  },
});
