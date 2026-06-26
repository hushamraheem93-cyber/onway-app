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
import { GradientBackground } from "@/components/GradientBackground";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { AppColors, Spacing, BorderRadius, Shadows } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";
import { formatPrice } from "@/constants/currency";

interface CompletedOrder {
  id: string;
  total: number;
  deliveryFee: number;
  driverEarning: number;
  isRestaurant: boolean;
  completedAt: string;
  customerName: string;
}

interface EarningsData {
  totalEarnings: number;
  todayEarnings: number;
  weekEarnings: number;
  totalOrders: number;
  todayOrders: number;
  completedOrders: CompletedOrder[];
}

interface WalletTransaction {
  id: string;
  amount: number;
  type: "deduction" | "recharge";
  service: string;
  orderId?: string;
  timestamp: string;
}

// ─── Day names (Arabic) ─────────────────────────────────────────────────────
const DAY_NAMES = ["أحد", "إثن", "ثلا", "أرب", "خمي", "جمع", "سبت"];

// ─── Compute last-7-days earnings from completedOrders ───────────────────────
function buildWeekData(orders: CompletedOrder[]): { day: string; amount: number; isToday: boolean }[] {
  const result: { day: string; amount: number; isToday: boolean }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dayStr = d.toISOString().slice(0, 10);
    const amount = orders
      .filter(o => o.completedAt && o.completedAt.startsWith(dayStr))
      .reduce((s, o) => s + (o.driverEarning || 0), 0);
    result.push({ day: DAY_NAMES[d.getDay()], amount, isToday: i === 0 });
  }
  return result;
}

// ─── Simple bar chart ─────────────────────────────────────────────────────────
function EarningsBarChart({ orders }: { orders: CompletedOrder[] }) {
  const { theme } = useTheme();
  const data = buildWeekData(orders);
  const maxVal = Math.max(...data.map(d => d.amount), 1);

  return (
    <View style={[chartStyles.card, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
      <View style={chartStyles.titleRow}>
        <ThemedText type="small" style={{ color: theme.textSecondary }}>أرباح الأسبوع</ThemedText>
        <ThemedText type="h4" style={{ color: theme.text, fontWeight: "700" }}>آخر 7 أيام</ThemedText>
      </View>
      <View style={chartStyles.barsRow}>
        {data.map((d, i) => {
          const barH = maxVal > 0 ? Math.max((d.amount / maxVal) * 90, d.amount > 0 ? 8 : 0) : 0;
          return (
            <View key={i} style={chartStyles.barCol}>
              <ThemedText type="small" style={[chartStyles.barValue, { color: d.isToday ? AppColors.primary : theme.textSecondary }]}>
                {d.amount > 0 ? (d.amount >= 1000 ? `${(d.amount / 1000).toFixed(1)}ك` : String(d.amount)) : ""}
              </ThemedText>
              <View style={chartStyles.barTrack}>
                <View
                  style={[
                    chartStyles.barFill,
                    {
                      height: barH,
                      backgroundColor: d.isToday ? AppColors.primary : AppColors.primary + "50",
                      borderRadius: 4,
                    },
                  ]}
                />
              </View>
              <ThemedText type="small" style={[chartStyles.barLabel, { color: d.isToday ? AppColors.primary : theme.textSecondary, fontWeight: d.isToday ? "700" : "400" }]}>
                {d.day}
              </ThemedText>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const chartStyles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  titleRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  barsRow: {
    flexDirection: "row-reverse",
    alignItems: "flex-end",
    justifyContent: "space-between",
    height: 120,
  },
  barCol: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
  },
  barValue: { fontSize: 9, height: 14 },
  barTrack: {
    width: "60%",
    height: 90,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  barFill: { width: "100%" },
  barLabel: { fontSize: 10 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
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

  const fetchData = useCallback(async () => {
    if (!phoneNumber) return;
    try {
      const [earningsRes, walletRes] = await Promise.all([
        fetch(new URL(`/api/driver/earnings?phoneNumber=${encodeURIComponent(phoneNumber)}`, getApiUrl()).toString()),
        fetch(new URL(`/api/driver/wallet?phoneNumber=${encodeURIComponent(phoneNumber)}`, getApiUrl()).toString()),
      ]);
      if (earningsRes.ok) setEarnings(await earningsRes.json());
      if (walletRes.ok) {
        const wd = await walletRes.json();
        setWalletBalance(wd.balance || 0);
        setWalletHistory(wd.history || []);
      }
    } catch (e) {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [phoneNumber]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot, justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={AppColors.primary} />
      </View>
    );
  }

  // ─── Stat card ──────────────────────────────────────────────────────────
  const renderStatCard = (title: string, value: string, icon: keyof typeof Feather.glyphMap, color: string) => (
    <View style={[styles.statCard, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
      <View style={[styles.statIcon, { backgroundColor: color + "18" }]}>
        <Feather name={icon} size={20} color={color} />
      </View>
      <ThemedText type="h3" style={{ color: theme.text, fontWeight: "700", marginTop: Spacing.xs }}>{value}</ThemedText>
      <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 2 }}>{title}</ThemedText>
    </View>
  );

  // ─── Completed order row ─────────────────────────────────────────────────
  const renderOrderItem = ({ item }: { item: CompletedOrder }) => (
    <View style={[styles.listItem, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
      <View style={[styles.listItemIcon, { backgroundColor: "#4CAF5015" }]}>
        <Feather name="check-circle" size={18} color="#4CAF50" />
      </View>
      <View style={{ flex: 1, alignItems: "flex-end", gap: 2 }}>
        <ThemedText type="body" style={{ color: theme.text, fontWeight: "600" }}>
          {item.customerName || "زبون"}
        </ThemedText>
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          #{item.id?.slice(-6)} · {item.completedAt ? new Date(item.completedAt).toLocaleDateString("ar-IQ") : ""}
        </ThemedText>
      </View>
      <View style={{ alignItems: "flex-start", gap: 2 }}>
        <ThemedText type="body" style={{ color: AppColors.primary, fontWeight: "700" }}>
          {formatPrice(item.driverEarning || 0)}
        </ThemedText>
        <ThemedText type="small" style={{ color: theme.textSecondary, fontSize: 10 }}>
          {item.isRestaurant ? "مطعم" : "توصيل"}
        </ThemedText>
      </View>
    </View>
  );

  // ─── Wallet transaction row ──────────────────────────────────────────────
  const renderTransaction = ({ item }: { item: WalletTransaction }) => {
    const isDeduction = item.type === "deduction";
    const color = isDeduction ? "#F44336" : "#4CAF50";
    return (
      <View style={[styles.listItem, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
        <View style={[styles.listItemIcon, { backgroundColor: color + "15" }]}>
          <Feather name={isDeduction ? "minus-circle" : "plus-circle"} size={18} color={color} />
        </View>
        <View style={{ flex: 1, alignItems: "flex-end", gap: 2 }}>
          <ThemedText type="body" style={{ color: theme.text, fontWeight: "600" }}>
            {isDeduction ? "خصم عمولة" : "شحن رصيد"}
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            {item.service} · {item.timestamp ? new Date(item.timestamp).toLocaleDateString("ar-IQ") : ""}
          </ThemedText>
        </View>
        <ThemedText type="body" style={{ color, fontWeight: "700" }}>
          {isDeduction ? "-" : "+"}{formatPrice(item.amount)}
        </ThemedText>
      </View>
    );
  };

  // ─── Earnings tab header content ─────────────────────────────────────────
  const EarningsHeader = (
    <View style={styles.sectionPadding}>
      {/* Big total */}
      <View style={[styles.totalCard, { backgroundColor: theme.backgroundDefault }, Shadows.md]}>
        <ThemedText type="small" style={{ color: theme.textSecondary }}>إجمالي الأرباح</ThemedText>
        <ThemedText type="h1" style={{ color: AppColors.primary, marginTop: 4 }}>
          {formatPrice(earnings?.totalEarnings || 0)}
        </ThemedText>
        <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 4 }}>
          {earnings?.totalOrders || 0} طلب مكتمل
        </ThemedText>
      </View>

      {/* Weekly bar chart */}
      <EarningsBarChart orders={earnings?.completedOrders || []} />

      {/* Stat cards grid */}
      <View style={styles.statsGrid}>
        {renderStatCard("أرباح اليوم", formatPrice(earnings?.todayEarnings || 0), "sun", "#FF9800")}
        {renderStatCard("أرباح الأسبوع", formatPrice(earnings?.weekEarnings || 0), "calendar", "#2196F3")}
      </View>
      <View style={styles.statsGrid}>
        {renderStatCard("طلبات اليوم", String(earnings?.todayOrders || 0), "package", "#4CAF50")}
        {renderStatCard("إجمالي الطلبات", String(earnings?.totalOrders || 0), "truck", AppColors.primary)}
      </View>

      {(earnings?.completedOrders?.length || 0) > 0 ? (
        <ThemedText type="h4" style={[styles.sectionLabel, { color: theme.text }]}>
          سجل الطلبات المكتملة
        </ThemedText>
      ) : null}
    </View>
  );

  // ─── Wallet tab header content ───────────────────────────────────────────
  const WalletHeader = (
    <View style={styles.sectionPadding}>
      {/* Wallet balance */}
      <View style={[styles.totalCard, { backgroundColor: theme.backgroundDefault }, Shadows.md]}>
        <Feather name="credit-card" size={24} color={walletBalance < 250 ? "#F44336" : AppColors.primary} style={{ marginBottom: Spacing.sm }} />
        <ThemedText type="small" style={{ color: theme.textSecondary }}>رصيد المحفظة</ThemedText>
        <ThemedText type="h1" style={{ color: walletBalance < 250 ? "#F44336" : AppColors.primary, marginTop: 4 }}>
          {formatPrice(walletBalance)}
        </ThemedText>
        {walletBalance < 250 ? (
          <ThemedText type="small" style={{ color: "#F44336", marginTop: 4 }}>
            رصيد غير كافٍ — تواصل مع الإدارة لشحن الرصيد
          </ThemedText>
        ) : (
          <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 4 }}>
            الحد الأدنى للعمل: {formatPrice(250)}
          </ThemedText>
        )}
      </View>

      {/* Commission info */}
      <View style={[styles.commissionCard, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
        <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: Spacing.sm, marginBottom: Spacing.lg }}>
          <Feather name="percent" size={16} color={AppColors.primary} />
          <ThemedText type="h4" style={{ color: theme.text }}>نظام العمولة</ThemedText>
        </View>

        {/* Legend */}
        <View style={{ flexDirection: "row-reverse", gap: Spacing.lg, marginBottom: Spacing.md }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#4CAF50" }} />
            <ThemedText type="small" style={{ color: theme.textSecondary }}>نصيب السائق</ThemedText>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#E0E0E0" }} />
            <ThemedText type="small" style={{ color: theme.textSecondary }}>عمولة التطبيق</ThemedText>
          </View>
        </View>

        {/* Restaurant row */}
        <View style={{ marginBottom: Spacing.md }}>
          <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: Spacing.xs }}>
            <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: Spacing.xs }}>
              <Feather name="shopping-bag" size={13} color="#FF9800" />
              <ThemedText type="body" style={{ color: theme.text, fontWeight: "600" }}>توصيل مطعم</ThemedText>
            </View>
            <View style={{ flexDirection: "row", gap: Spacing.sm, alignItems: "center" }}>
              <ThemedText type="small" style={{ color: "#F44336", fontWeight: "600" }}>-{formatPrice(250)}</ThemedText>
              <ThemedText type="small" style={{ color: "#4CAF50", fontWeight: "700" }}>+{formatPrice(750)}</ThemedText>
            </View>
          </View>
          <View style={{ height: 10, borderRadius: 5, backgroundColor: "#E0E0E0", overflow: "hidden" }}>
            <View style={{ width: "75%", height: "100%", backgroundColor: "#4CAF50", borderRadius: 5 }} />
          </View>
          <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", marginTop: 3 }}>
            <ThemedText style={{ fontSize: 10, color: "#4CAF50", fontWeight: "700" }}>75% للسائق</ThemedText>
            <ThemedText style={{ fontSize: 10, color: theme.textSecondary }}>25% للتطبيق</ThemedText>
          </View>
        </View>

        {/* Marketing row */}
        <View>
          <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: Spacing.xs }}>
            <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: Spacing.xs }}>
              <Feather name="truck" size={13} color="#2196F3" />
              <ThemedText type="body" style={{ color: theme.text, fontWeight: "600" }}>توصيل تسويق</ThemedText>
            </View>
            <View style={{ flexDirection: "row", gap: Spacing.sm, alignItems: "center" }}>
              <ThemedText type="small" style={{ color: "#F44336", fontWeight: "600" }}>-{formatPrice(1000)}</ThemedText>
              <ThemedText type="small" style={{ color: "#4CAF50", fontWeight: "700" }}>+{formatPrice(2000)}</ThemedText>
            </View>
          </View>
          <View style={{ height: 10, borderRadius: 5, backgroundColor: "#E0E0E0", overflow: "hidden" }}>
            <View style={{ width: "67%", height: "100%", backgroundColor: "#4CAF50", borderRadius: 5 }} />
          </View>
          <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", marginTop: 3 }}>
            <ThemedText style={{ fontSize: 10, color: "#4CAF50", fontWeight: "700" }}>67% للسائق</ThemedText>
            <ThemedText style={{ fontSize: 10, color: theme.textSecondary }}>33% للتطبيق</ThemedText>
          </View>
        </View>

        <View style={[styles.minWalletNote, { backgroundColor: theme.backgroundRoot }]}>
          <Feather name="info" size={13} color={theme.textSecondary} />
          <ThemedText type="small" style={{ color: theme.textSecondary, flex: 1, textAlign: "right" }}>
            الحد الأدنى لرصيد المحفظة للعمل: {formatPrice(250)}
          </ThemedText>
        </View>
      </View>

      {walletHistory.length > 0 ? (
        <ThemedText type="h4" style={[styles.sectionLabel, { color: theme.text }]}>
          سجل المحفظة
        </ThemedText>
      ) : null}
    </View>
  );

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <GradientBackground />

      {/* Flat themed header — no gradient */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md, backgroundColor: theme.backgroundDefault }]}>
        <View style={styles.tabBar}>
          <Pressable
            style={[styles.tabItem, activeTab === "earnings" ? [styles.tabItemActive, { borderBottomColor: AppColors.primary }] : null]}
            onPress={() => setActiveTab("earnings")}
          >
            <Feather name="trending-up" size={16} color={activeTab === "earnings" ? AppColors.primary : theme.textSecondary} />
            <ThemedText type="body" style={{ color: activeTab === "earnings" ? AppColors.primary : theme.textSecondary, fontWeight: "600" }}>
              الأرباح
            </ThemedText>
          </Pressable>
          <Pressable
            style={[styles.tabItem, activeTab === "wallet" ? [styles.tabItemActive, { borderBottomColor: AppColors.primary }] : null]}
            onPress={() => setActiveTab("wallet")}
          >
            <Feather name="credit-card" size={16} color={activeTab === "wallet" ? AppColors.primary : theme.textSecondary} />
            <ThemedText type="body" style={{ color: activeTab === "wallet" ? AppColors.primary : theme.textSecondary, fontWeight: "600" }}>
              المحفظة
            </ThemedText>
          </Pressable>
        </View>
      </View>

      {activeTab === "earnings" ? (
        <FlatList
          data={earnings?.completedOrders || []}
          keyExtractor={(item) => item.id}
          renderItem={renderOrderItem}
          ListHeaderComponent={EarningsHeader}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="inbox" size={40} color={theme.textSecondary} />
              <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: Spacing.md }}>
                لا توجد طلبات مكتملة بعد
              </ThemedText>
            </View>
          }
          contentContainerStyle={{ paddingBottom: tabBarHeight + Spacing.xl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={AppColors.primary} />}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          data={walletHistory}
          keyExtractor={(item) => item.id}
          renderItem={renderTransaction}
          ListHeaderComponent={WalletHeader}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="credit-card" size={40} color={theme.textSecondary} />
              <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: Spacing.md }}>
                لا توجد عمليات بعد
              </ThemedText>
            </View>
          }
          contentContainerStyle={{ paddingBottom: tabBarHeight + Spacing.xl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={AppColors.primary} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E020",
  },
  tabBar: {
    flexDirection: "row-reverse",
  },
  tabItem: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabItemActive: {
    borderBottomWidth: 2,
  },
  sectionPadding: { padding: Spacing.lg },
  totalCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  statsGrid: {
    flexDirection: "row-reverse",
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  statCard: {
    flex: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    alignItems: "center",
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  sectionLabel: {
    textAlign: "right",
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  listItem: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  listItemIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  commissionCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  commissionRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Spacing.sm,
  },
  minWalletNote: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    marginTop: Spacing.md,
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
  },
});
