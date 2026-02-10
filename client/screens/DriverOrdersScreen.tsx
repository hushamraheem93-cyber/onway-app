import React, { useState, useEffect, useCallback } from "react";
import {
  StyleSheet,
  View,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { AppColors, Spacing, BorderRadius, Shadows } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";
import { formatPrice } from "@/constants/currency";

interface DriverOrder {
  id: string;
  customerName: string;
  customerPhone: string;
  address: string;
  region: string;
  items: any[];
  total: number;
  deliveryFee: number;
  status: string;
  createdAt: string;
  completedAt?: string;
}

const STATUS_MAP: Record<string, { label: string; color: string; icon: keyof typeof Feather.glyphMap }> = {
  delivering: { label: "جاري التوصيل", color: "#2196F3", icon: "truck" },
  delivered: { label: "تم التوصيل", color: "#4CAF50", icon: "check-circle" },
  cancelled: { label: "ملغي", color: "#F44336", icon: "x-circle" },
};

export default function DriverOrdersScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const { phoneNumber } = useAuth();

  const [orders, setOrders] = useState<DriverOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string>("all");

  const fetchOrders = useCallback(async () => {
    if (!phoneNumber) return;
    try {
      const res = await fetch(
        new URL(`/api/driver/orders?phoneNumber=${encodeURIComponent(phoneNumber)}`, getApiUrl()).toString()
      );
      if (res.ok) {
        const data = await res.json();
        setOrders(data);
      }
    } catch (e) {
      console.error("Error fetching orders:", e);
    } finally {
      setLoading(false);
    }
  }, [phoneNumber]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchOrders();
    setRefreshing(false);
  };

  const filteredOrders = filter === "all" ? orders : orders.filter((o) => o.status === filter);

  const renderOrder = ({ item }: { item: DriverOrder }) => {
    const statusInfo = STATUS_MAP[item.status] || { label: item.status, color: "#9E9E9E", icon: "info" as const };

    return (
      <View style={[styles.orderCard, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
        <View style={styles.orderHeader}>
          <View style={[styles.statusBadge, { backgroundColor: statusInfo.color + "15" }]}>
            <Feather name={statusInfo.icon} size={14} color={statusInfo.color} />
            <ThemedText type="small" style={{ color: statusInfo.color, fontWeight: "600" }}>
              {statusInfo.label}
            </ThemedText>
          </View>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            #{item.id?.slice(-6)}
          </ThemedText>
        </View>

        <View style={styles.orderBody}>
          <View style={styles.orderRow}>
            <ThemedText type="body" style={{ color: theme.text }}>{item.customerName || "زبون"}</ThemedText>
            <Feather name="user" size={16} color={theme.textSecondary} />
          </View>
          <View style={styles.orderRow}>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>{item.region || item.address}</ThemedText>
            <Feather name="map-pin" size={16} color={theme.textSecondary} />
          </View>
          <View style={styles.orderRow}>
            <ThemedText type="body" style={{ color: AppColors.primary, fontWeight: "700" }}>
              {formatPrice(item.deliveryFee || 0)}
            </ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>أجرة التوصيل</ThemedText>
          </View>
        </View>

        <View style={[styles.orderFooter, { borderTopColor: theme.border }]}>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            {item.createdAt ? new Date(item.createdAt).toLocaleDateString("ar-IQ") : ""}
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            {item.items?.length || 0} منتج - {formatPrice(item.total)}
          </ThemedText>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot, justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={AppColors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md, backgroundColor: AppColors.primary }]}>
        <ThemedText type="h2" style={styles.headerTitle}>طلباتي</ThemedText>
      </View>

      <View style={styles.filterRow}>
        {[
          { key: "all", label: "الكل" },
          { key: "delivering", label: "جاري التوصيل" },
          { key: "delivered", label: "مكتمل" },
        ].map((f) => (
          <Pressable
            key={f.key}
            style={[
              styles.filterChip,
              {
                backgroundColor: filter === f.key ? AppColors.primary : theme.backgroundDefault,
                borderColor: filter === f.key ? AppColors.primary : theme.border,
              },
            ]}
            onPress={() => setFilter(f.key)}
          >
            <ThemedText
              type="small"
              style={{ color: filter === f.key ? "#FFFFFF" : theme.text, fontWeight: "600" }}
            >
              {f.label}
            </ThemedText>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={filteredOrders}
        keyExtractor={(item) => item.id}
        renderItem={renderOrder}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Feather name="inbox" size={40} color={theme.textSecondary} />
            <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: Spacing.md }}>
              لا توجد طلبات
            </ThemedText>
          </View>
        }
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: tabBarHeight + Spacing.xl }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={AppColors.primary} />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    alignItems: "center",
  },
  headerTitle: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  filterRow: {
    flexDirection: "row-reverse",
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  orderCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  orderHeader: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  statusBadge: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  orderBody: {
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  orderRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Spacing.sm,
  },
  orderFooter: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    borderTopWidth: 1,
    paddingTop: Spacing.md,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing["3xl"],
  },
});
