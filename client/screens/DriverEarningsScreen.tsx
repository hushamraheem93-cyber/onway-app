import React, { useState, useEffect, useCallback } from "react";
import {
  StyleSheet,
  View,
  FlatList,
  RefreshControl,
  ActivityIndicator,
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

interface EarningsData {
  totalEarnings: number;
  todayEarnings: number;
  weekEarnings: number;
  totalOrders: number;
  todayOrders: number;
  completedOrders: { id: string; total: number; deliveryFee: number; driverEarning: number; isRestaurant: boolean; completedAt: string; customerName: string }[];
}

export default function DriverEarningsScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const { phoneNumber } = useAuth();

  const [earnings, setEarnings] = useState<EarningsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchEarnings = useCallback(async () => {
    if (!phoneNumber) return;
    try {
      const res = await fetch(
        new URL(`/api/driver/earnings?phoneNumber=${encodeURIComponent(phoneNumber)}`, getApiUrl()).toString()
      );
      if (res.ok) {
        const data = await res.json();
        setEarnings(data);
      }
    } catch (e) {
      console.error("Error fetching earnings:", e);
    } finally {
      setLoading(false);
    }
  }, [phoneNumber]);

  useEffect(() => {
    fetchEarnings();
  }, [fetchEarnings]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchEarnings();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot, justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={AppColors.primary} />
      </View>
    );
  }

  const renderStatCard = (title: string, value: string, icon: keyof typeof Feather.glyphMap, color: string) => (
    <View style={[styles.statCard, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
      <View style={[styles.statIcon, { backgroundColor: color + "15" }]}>
        <Feather name={icon} size={22} color={color} />
      </View>
      <ThemedText type="h3" style={[styles.statValue, { color: theme.text }]}>{value}</ThemedText>
      <ThemedText type="small" style={[styles.statLabel, { color: theme.textSecondary }]}>{title}</ThemedText>
    </View>
  );

  const renderOrderItem = ({ item }: { item: EarningsData["completedOrders"][0] }) => (
    <View style={[styles.orderItem, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
      <View style={styles.orderItemRow}>
        <View style={{ alignItems: "flex-start" }}>
          <ThemedText type="body" style={{ color: AppColors.primary, fontWeight: "700" }}>
            {formatPrice(item.driverEarning || 0)}
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary, fontSize: 10 }}>
            {item.isRestaurant ? "مطعم" : "توصيل"}
          </ThemedText>
        </View>
        <View style={{ alignItems: "flex-end", flex: 1 }}>
          <ThemedText type="body" style={{ color: theme.text, fontWeight: "600" }}>
            {item.customerName || "زبون"}
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            #{item.id?.slice(-6)} - {item.completedAt ? new Date(item.completedAt).toLocaleDateString("ar-IQ") : ""}
          </ThemedText>
        </View>
        <View style={[styles.orderItemIcon, { backgroundColor: "#4CAF5015" }]}>
          <Feather name="check-circle" size={18} color="#4CAF50" />
        </View>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md, backgroundColor: AppColors.primary }]}>
        <ThemedText type="h2" style={styles.headerTitle}>الأرباح</ThemedText>
      </View>

      <FlatList
        data={earnings?.completedOrders || []}
        keyExtractor={(item) => item.id}
        renderItem={renderOrderItem}
        ListHeaderComponent={
          <View style={styles.headerContent}>
            <View style={[styles.totalCard, { backgroundColor: theme.backgroundDefault }, Shadows.md]}>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>إجمالي الأرباح</ThemedText>
              <ThemedText type="h1" style={{ color: AppColors.primary, marginTop: Spacing.xs }}>
                {formatPrice(earnings?.totalEarnings || 0)}
              </ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: Spacing.xs }}>
                {earnings?.totalOrders || 0} طلب مكتمل
              </ThemedText>
            </View>

            <View style={styles.statsRow}>
              {renderStatCard("أرباح اليوم", formatPrice(earnings?.todayEarnings || 0), "sun", "#FF9800")}
              {renderStatCard("أرباح الأسبوع", formatPrice(earnings?.weekEarnings || 0), "calendar", "#2196F3")}
            </View>

            <View style={styles.statsRow}>
              {renderStatCard("طلبات اليوم", String(earnings?.todayOrders || 0), "package", "#4CAF50")}
              {renderStatCard("إجمالي الطلبات", String(earnings?.totalOrders || 0), "truck", AppColors.primary)}
            </View>

            {(earnings?.completedOrders?.length || 0) > 0 ? (
              <ThemedText type="h4" style={[styles.sectionTitle, { color: theme.text }]}>
                سجل الطلبات المكتملة
              </ThemedText>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Feather name="inbox" size={40} color={theme.textSecondary} />
            <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: Spacing.md }}>
              لا توجد طلبات مكتملة بعد
            </ThemedText>
          </View>
        }
        contentContainerStyle={{ paddingBottom: tabBarHeight + Spacing.xl }}
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
  headerContent: {
    padding: Spacing.lg,
  },
  totalCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  statsRow: {
    flexDirection: "row-reverse",
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  statCard: {
    flex: 1,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    alignItems: "center",
  },
  statIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  statValue: {
    fontWeight: "700",
    fontSize: 16,
  },
  statLabel: {
    fontSize: 12,
    marginTop: 2,
  },
  sectionTitle: {
    textAlign: "right",
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
  },
  orderItem: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
  },
  orderItemRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Spacing.md,
  },
  orderItemIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing["3xl"],
  },
});
