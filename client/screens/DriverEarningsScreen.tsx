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

interface EarningsData {
  totalEarnings: number;
  todayEarnings: number;
  weekEarnings: number;
  totalOrders: number;
  todayOrders: number;
  completedOrders: { id: string; total: number; deliveryFee: number; driverEarning: number; isRestaurant: boolean; completedAt: string; customerName: string }[];
}

interface WalletTransaction {
  id: string;
  amount: number;
  type: "deduction" | "recharge";
  service: string;
  orderId?: string;
  timestamp: string;
}

export default function DriverEarningsScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const { phoneNumber } = useAuth();

  const [earnings, setEarnings] = useState<EarningsData | null>(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [walletHistory, setWalletHistory] = useState<WalletTransaction[]>([]);
  const [activeTab, setActiveTab] = useState<"earnings" | "wallet">("earnings");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchEarnings = useCallback(async () => {
    if (!phoneNumber) return;
    try {
      const [earningsRes, walletRes] = await Promise.all([
        fetch(new URL(`/api/driver/earnings?phoneNumber=${encodeURIComponent(phoneNumber)}`, getApiUrl()).toString()),
        fetch(new URL(`/api/driver/wallet?phoneNumber=${encodeURIComponent(phoneNumber)}`, getApiUrl()).toString()),
      ]);
      if (earningsRes.ok) {
        const data = await earningsRes.json();
        setEarnings(data);
      }
      if (walletRes.ok) {
        const walletData = await walletRes.json();
        setWalletBalance(walletData.balance || 0);
        setWalletHistory(walletData.history || []);
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
    <View style={[styles.orderItem, { backgroundColor: theme.backgroundDefault }]}>
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

  const renderWalletTransaction = ({ item }: { item: WalletTransaction }) => (
    <View style={[styles.orderItem, { backgroundColor: theme.backgroundDefault }]}>
      <View style={styles.orderItemRow}>
        <View style={{ alignItems: "flex-start" }}>
          <ThemedText type="body" style={{ color: item.type === "deduction" ? "#F44336" : "#4CAF50", fontWeight: "700" }}>
            {item.type === "deduction" ? "-" : "+"}{formatPrice(item.amount)}
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary, fontSize: 10 }}>
            {item.service}
          </ThemedText>
        </View>
        <View style={{ alignItems: "flex-end", flex: 1 }}>
          <ThemedText type="body" style={{ color: theme.text, fontWeight: "600" }}>
            {item.type === "deduction" ? "خصم عمولة" : "شحن رصيد"}
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            {item.timestamp ? new Date(item.timestamp).toLocaleDateString("ar-IQ") : ""}
          </ThemedText>
        </View>
        <View style={[styles.orderItemIcon, { backgroundColor: item.type === "deduction" ? "#F4433615" : "#4CAF5015" }]}>
          <Feather name={item.type === "deduction" ? "minus-circle" : "plus-circle"} size={18} color={item.type === "deduction" ? "#F44336" : "#4CAF50"} />
        </View>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md, backgroundColor: AppColors.primary }]}>
        <ThemedText type="h2" style={styles.headerTitle}>الأرباح والمحفظة</ThemedText>
      </View>

      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tabItem, activeTab === "earnings" ? styles.tabItemActive : null]}
          onPress={() => setActiveTab("earnings")}
        >
          <ThemedText type="body" style={{ color: activeTab === "earnings" ? AppColors.primary : theme.textSecondary, fontWeight: "600" }}>
            الأرباح
          </ThemedText>
        </Pressable>
        <Pressable
          style={[styles.tabItem, activeTab === "wallet" ? styles.tabItemActive : null]}
          onPress={() => setActiveTab("wallet")}
        >
          <ThemedText type="body" style={{ color: activeTab === "wallet" ? AppColors.primary : theme.textSecondary, fontWeight: "600" }}>
            المحفظة
          </ThemedText>
        </Pressable>
      </View>

      {activeTab === "earnings" ? (
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
      ) : (
        <FlatList
          data={walletHistory}
          keyExtractor={(item) => item.id}
          renderItem={renderWalletTransaction}
          ListHeaderComponent={
            <View style={styles.headerContent}>
              <View style={[styles.totalCard, { backgroundColor: theme.backgroundDefault }, Shadows.md]}>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>رصيد المحفظة</ThemedText>
                <ThemedText type="h1" style={{ color: walletBalance < 250 ? "#F44336" : AppColors.primary, marginTop: Spacing.xs }}>
                  {formatPrice(walletBalance)}
                </ThemedText>
                {walletBalance < 250 ? (
                  <ThemedText type="small" style={{ color: "#F44336", marginTop: Spacing.xs }}>
                    رصيد غير كافٍ - تواصل مع الإدارة لشحن الرصيد
                  </ThemedText>
                ) : (
                  <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: Spacing.xs }}>
                    الحد الأدنى للعمل: {formatPrice(250)}
                  </ThemedText>
                )}
              </View>

              <View style={[styles.commissionInfo, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
                <ThemedText type="h4" style={{ color: theme.text, textAlign: "right", marginBottom: Spacing.sm }}>
                  نظام العمولة
                </ThemedText>
                <View style={styles.commissionRow}>
                  <ThemedText type="small" style={{ color: "#4CAF50", fontWeight: "700" }}>{formatPrice(750)}</ThemedText>
                  <ThemedText type="small" style={{ color: "#FF9800", fontWeight: "700" }}>عمولة {formatPrice(250)}</ThemedText>
                  <ThemedText type="body" style={{ color: theme.text, flex: 1, textAlign: "right" }}>توصيل مطعم</ThemedText>
                  <Feather name="shopping-bag" size={16} color="#FF9800" />
                </View>
                <View style={styles.commissionRow}>
                  <ThemedText type="small" style={{ color: "#4CAF50", fontWeight: "700" }}>{formatPrice(2000)}</ThemedText>
                  <ThemedText type="small" style={{ color: "#2196F3", fontWeight: "700" }}>عمولة {formatPrice(1000)}</ThemedText>
                  <ThemedText type="body" style={{ color: theme.text, flex: 1, textAlign: "right" }}>توصيل تسويق/خدمات</ThemedText>
                  <Feather name="truck" size={16} color="#2196F3" />
                </View>
              </View>

              {walletHistory.length > 0 ? (
                <ThemedText type="h4" style={[styles.sectionTitle, { color: theme.text }]}>
                  سجل المحفظة
                </ThemedText>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="credit-card" size={40} color={theme.textSecondary} />
              <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: Spacing.md }}>
                لا توجد عمليات بعد
              </ThemedText>
            </View>
          }
          contentContainerStyle={{ paddingBottom: tabBarHeight + Spacing.xl }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={AppColors.primary} />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
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
    borderRadius: 15,
    padding: Spacing.xl,
    alignItems: "center",
    marginBottom: Spacing.lg,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  statsRow: {
    flexDirection: "row-reverse",
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  statCard: {
    flex: 1,
    borderRadius: 15,
    padding: Spacing.md,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
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
    fontSize: 13,
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
    borderRadius: 15,
    padding: Spacing.md,
    borderWidth: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
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
  tabBar: {
    flexDirection: "row-reverse",
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  tabItem: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  tabItemActive: {
    borderBottomWidth: 2,
    borderBottomColor: AppColors.primary,
  },
  commissionInfo: {
    borderRadius: 15,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  commissionRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
});
