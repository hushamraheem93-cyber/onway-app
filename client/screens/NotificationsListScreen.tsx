import React, { useEffect } from "react";
import { StyleSheet, View, FlatList, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";

import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Shadows, AppColors } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { useNotifications, AppNotification } from "@/context/NotificationContext";
import { GradientBackground } from "@/components/GradientBackground";

function NotificationItem({ notification, onPress }: { notification: AppNotification; onPress: () => void }) {
  const { theme } = useTheme();

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "الآن";
    if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
    if (diffHours < 24) return `منذ ${diffHours} ساعة`;
    if (diffDays < 7) return `منذ ${diffDays} يوم`;
    return date.toLocaleDateString("ar-SA", { month: "short", day: "numeric" });
  };

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.notificationItem,
        { backgroundColor: notification.read ? theme.backgroundDefault : AppColors.primary + "10" },
        Shadows.sm,
      ]}
    >
      <View style={styles.notificationContent}>
        <View style={styles.notificationHeader}>
          <ThemedText type="body" style={[styles.notificationTitle, !notification.read && { fontWeight: "700" }]}>
            {notification.title}
          </ThemedText>
          {!notification.read ? (
            <View style={styles.unreadDot} />
          ) : null}
        </View>
        <ThemedText type="small" style={[styles.notificationBody, { color: theme.textSecondary }]}>
          {notification.body}
        </ThemedText>
        <ThemedText type="small" style={[styles.notificationTime, { color: theme.textSecondary }]}>
          {formatDate(notification.createdAt)}
        </ThemedText>
      </View>
      <View style={[styles.iconContainer, { backgroundColor: AppColors.primary + "15" }]}>
        <Feather name="bell" size={20} color={AppColors.primary} />
      </View>
    </Pressable>
  );
}

export default function NotificationsListScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearNotifications } = useNotifications();

  useEffect(() => {
    if (unreadCount > 0) {
      const timer = setTimeout(() => {
        markAllAsRead();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [unreadCount]);

  const handleNotificationPress = (notification: AppNotification) => {
    markAsRead(notification.id);
    if (notification.data?.orderId) {
      navigation.navigate("Orders");
    }
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <View style={[styles.emptyIcon, { backgroundColor: theme.backgroundDefault }]}>
        <Feather name="bell-off" size={48} color={theme.textSecondary} />
      </View>
      <ThemedText type="h3" style={styles.emptyTitle}>
        لا توجد إشعارات
      </ThemedText>
      <ThemedText type="body" style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
        ستظهر هنا الإشعارات عند تحديث حالة طلباتك
      </ThemedText>
    </View>
  );

  return (
    <View style={[styles.container]}>
      <GradientBackground />
      {notifications.length > 0 ? (
        <View style={[styles.headerActions, { paddingTop: headerHeight + Spacing.sm }]}>
          <Pressable onPress={clearNotifications} style={styles.actionButton}>
            <Feather name="trash-2" size={16} color={theme.textSecondary} />
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              مسح الكل
            </ThemedText>
          </Pressable>
          {unreadCount > 0 ? (
            <Pressable onPress={markAllAsRead} style={styles.actionButton}>
              <Feather name="check-circle" size={16} color={AppColors.primary} />
              <ThemedText type="small" style={{ color: AppColors.primary }}>
                قراءة الكل
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <NotificationItem notification={item} onPress={() => handleNotificationPress(item)} />
        )}
        contentContainerStyle={{
          paddingTop: notifications.length > 0 ? Spacing.sm : headerHeight + Spacing.xl,
          paddingBottom: insets.bottom + Spacing.xl,
          paddingHorizontal: Spacing.lg,
          flexGrow: 1,
        }}
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerActions: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  actionButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Spacing.xs,
  },
  notificationItem: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: Spacing.md,
  },
  notificationContent: {
    flex: 1,
  },
  notificationHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Spacing.sm,
  },
  notificationTitle: {
    textAlign: "right",
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: AppColors.primary,
  },
  notificationBody: {
    textAlign: "right",
    marginTop: Spacing.xs,
    lineHeight: 20,
  },
  notificationTime: {
    textAlign: "right",
    marginTop: Spacing.sm,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  emptySubtitle: {
    textAlign: "center",
    lineHeight: 22,
  },
});
