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
import { AppColors, Spacing, BorderRadius, Shadows, FontWeight} from "@/constants/theme";
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
  monthEarnings: number;
  totalOrders: number;
  todayOrders: number;
  weekOrders: number;
  monthOrders: number;
  completedOrders: CompletedOrder[];
}

interface DriverTransaction {
  id: string;
  amount: number;
  type: "earning" | "commission" | "payment";
  description: string;
  orderId?: string;
  timestamp: string;
}

interface DriverFinancialAccount {
  phoneNumber: string;
  totalEarnings: number;
  totalOnwayCommission: number;
  totalPaid: number;
  amountOwed: number;
  lastPaymentAmount: number;
  lastPaymentDate: string | null;
  updatedAt: string;
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
        <ThemedText type="h4" style={{ color: theme.text, fontWeight: FontWeight.bold }}>آخر 7 أيام</ThemedText>
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
  const [account, setAccount] = useState<DriverFinancialAccount | null>(null);
  const [transactions, setTransactions] = useState<DriverTransaction[]>([]);
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
        setAccount(wd.account || null);
        setTransactions(wd.transactions || []);
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
      <ThemedText type="h3" style={{ color: theme.text, fontWeight: FontWeight.bold, marginTop: Spacing.xs }}>{value}</ThemedText>
      <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 2 }}>{title}</ThemedText>
    </View>
  );

  // ─── Completed order row ─────────────────────────────────────────────────
  const renderOrderItem = ({ item }: { item: CompletedOrder }) => (
    <View style={[styles.listItem, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
      <View style={[styles.listItemIcon, { backgroundColor: "#4CAF5015" }]}>
        <Feather name="check-circle" size={18} color={AppColors.success} />
      </View>
      <View style={{ flex: 1, alignItems: "flex-end", gap: 2 }}>
        <ThemedText type="body" style={{ color: theme.text, fontWeight: FontWeight.semiBold }}>
          {item.customerName || "زبون"}
        </ThemedText>
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          #{item.id?.slice(-6)} · {item.completedAt ? new Date(item.completedAt).toLocaleDateString("ar-IQ") : ""}
        </ThemedText>
      </View>
      <View style={{ alignItems: "flex-start", gap: 2 }}>
        <ThemedText type="body" style={{ color: AppColors.primary, fontWeight: FontWeight.bold }}>
          {formatPrice(item.driverEarning || 0)}
        </ThemedText>
        <ThemedText type="small" style={{ color: theme.textSecondary, fontSize: 10 }}>
          {item.isRestaurant ? "مطعم" : "توصيل"}
        </ThemedText>
      </View>
    </View>
  );

  // ─── Financial transaction row ───────────────────────────────────────────
  const renderTransaction = ({ item }: { item: DriverTransaction }) => {
    const isPayment = item.type === "payment";
    const isAdjustment = item.type === "adjustment";
    const isEarning = item.type === "earning";
    const color = isPayment ? AppColors.success : isAdjustment ? AppColors.warning : isEarning ? AppColors.info : AppColors.error;
    const icon: keyof typeof Feather.glyphMap = isPayment ? "check-circle" : isAdjustment ? "edit-2" : "dollar-sign";
    const label = isPayment ? "دفعة للإدارة" : isAdjustment ? "تعديل مالي" : "أرباح توصيل";
    return (
      <View style={[styles.listItem, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
        <View style={[styles.listItemIcon, { backgroundColor: color + "15" }]}>
          <Feather name={icon} size={18} color={color} />
        </View>
        <View style={{ flex: 1, alignItems: "flex-end", gap: 2 }}>
          <ThemedText type="body" style={{ color: theme.text, fontWeight: FontWeight.semiBold }}>{label}</ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            {item.description} · {item.timestamp ? new Date(item.timestamp).toLocaleDateString("ar-IQ") : ""}
          </ThemedText>
        </View>
        <ThemedText type="body" style={{ color, fontWeight: FontWeight.bold }}>
          {isEarning ? "+" : ""}{formatPrice(item.amount)}
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
        {renderStatCard("أرباح اليوم", formatPrice(earnings?.todayEarnings || 0), "sun", AppColors.warning)}
        {renderStatCard("أرباح الأسبوع", formatPrice(earnings?.weekEarnings || 0), "calendar", AppColors.info)}
      </View>
      <View style={styles.statsGrid}>
        {renderStatCard("أرباح الشهر", formatPrice(earnings?.monthEarnings || 0), "trending-up", AppColors.success)}
        {renderStatCard("طلبات الشهر", String(earnings?.monthOrders || 0), "package", AppColors.primary)}
      </View>
      <View style={styles.statsGrid}>
        {renderStatCard("طلبات اليوم", String(earnings?.todayOrders || 0), "clock", AppColors.warning)}
        {renderStatCard("إجمالي الطلبات", String(earnings?.totalOrders || 0), "truck", AppColors.info)}
      </View>

      {(earnings?.completedOrders?.length || 0) > 0 ? (
        <ThemedText type="h4" style={[styles.sectionLabel, { color: theme.text }]}>
          سجل الطلبات المكتملة
        </ThemedText>
      ) : null}
    </View>
  );

  // ─── Financial account tab header ────────────────────────────────────────
  const amountOwed = account?.amountOwed || 0;
  const isBlocked = amountOwed >= 50000;
  const accountStatus = isBlocked ? "موقوف" : amountOwed > 0 ? "مستحقات" : "جيد";
  const accountStatusColor = isBlocked ? AppColors.error : amountOwed > 0 ? AppColors.warning : AppColors.success;
  const WalletHeader = (
    <View style={styles.sectionPadding}>
      {/* Status badge + owed amount */}
      <View style={[styles.totalCard, { backgroundColor: theme.backgroundDefault }, Shadows.md]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm, marginBottom: Spacing.sm }}>
          <View style={{ paddingHorizontal: Spacing.md, paddingVertical: 4, borderRadius: 20, backgroundColor: accountStatusColor + "20" }}>
            <ThemedText type="small" style={{ color: accountStatusColor, fontWeight: FontWeight.bold }}>{accountStatus}</ThemedText>
          </View>
        </View>
        <ThemedText type="small" style={{ color: theme.textSecondary }}>المبلغ المستحق لأونوي</ThemedText>
        <ThemedText type="h1" style={{ color: accountStatusColor, marginTop: 4 }}>
          {formatPrice(amountOwed)}
        </ThemedText>
        {isBlocked ? (
          <ThemedText type="small" style={{ color: AppColors.error, marginTop: 4, textAlign: "center" }}>
            تجاوزت الحد — تواصل مع الإدارة لتسوية الحساب
          </ThemedText>
        ) : amountOwed > 0 ? (
          <ThemedText type="small" style={{ color: AppColors.warning, marginTop: 4, textAlign: "center" }}>
            يُطلب التسوية قبل تجاوز {formatPrice(50000)}
          </ThemedText>
        ) : (
          <ThemedText type="small" style={{ color: AppColors.success, marginTop: 4 }}>حسابك مسوّى</ThemedText>
        )}
        {account?.lastPaymentDate ? (
          <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: Spacing.sm }}>
            آخر دفعة: {formatPrice(account.lastPaymentAmount)} · {new Date(account.lastPaymentDate).toLocaleDateString("ar-IQ")}
          </ThemedText>
        ) : null}
      </View>

      {/* Financial summary cards */}
      {account ? (
        <View style={styles.statsGrid}>
          {renderStatCard("أرباح التوصيل", formatPrice(account.totalEarnings), "dollar-sign", AppColors.success)}
          {renderStatCard("عمولات أونوي", formatPrice(account.totalOnwayCommission), "percent", AppColors.error)}
        </View>
      ) : null}
      {account ? (
        <View style={styles.statsGrid}>
          {renderStatCard("إجمالي المسدّد", formatPrice(account.totalPaid), "check-circle", AppColors.primary)}
          {renderStatCard("حد الحجب", formatPrice(50000), "alert-triangle", AppColors.warning)}
        </View>
      ) : null}

      {/* Commission info */}
      <View style={[styles.commissionCard, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
        <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: Spacing.sm, marginBottom: Spacing.lg }}>
          <Feather name="percent" size={16} color={AppColors.primary} />
          <ThemedText type="h4" style={{ color: theme.text }}>نظام العمولة</ThemedText>
        </View>
        <View style={{ marginBottom: Spacing.md }}>
          <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: Spacing.xs }}>
            <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: Spacing.xs }}>
              <Feather name="shopping-bag" size={13} color={AppColors.warning} />
              <ThemedText type="body" style={{ color: theme.text, fontWeight: FontWeight.semiBold }}>توصيل مطعم</ThemedText>
            </View>
            <View style={{ flexDirection: "row", gap: Spacing.sm }}>
              <ThemedText type="small" style={{ color: AppColors.error, fontWeight: FontWeight.semiBold }}>-{formatPrice(250)} أونوي</ThemedText>
              <ThemedText type="small" style={{ color: AppColors.success, fontWeight: FontWeight.bold }}>+{formatPrice(750)} سائق</ThemedText>
            </View>
          </View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: AppColors.border, overflow: "hidden" }}>
            <View style={{ width: "75%", height: "100%", backgroundColor: AppColors.success, borderRadius: 4 }} />
          </View>
        </View>
        <View>
          <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: Spacing.xs }}>
            <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: Spacing.xs }}>
              <Feather name="truck" size={13} color={AppColors.info} />
              <ThemedText type="body" style={{ color: theme.text, fontWeight: FontWeight.semiBold }}>توصيل تسويق</ThemedText>
            </View>
            <View style={{ flexDirection: "row", gap: Spacing.sm }}>
              <ThemedText type="small" style={{ color: AppColors.error, fontWeight: FontWeight.semiBold }}>-{formatPrice(1000)} أونوي</ThemedText>
              <ThemedText type="small" style={{ color: AppColors.success, fontWeight: FontWeight.bold }}>+{formatPrice(2000)} سائق</ThemedText>
            </View>
          </View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: AppColors.border, overflow: "hidden" }}>
            <View style={{ width: "67%", height: "100%", backgroundColor: AppColors.success, borderRadius: 4 }} />
          </View>
        </View>
      </View>

      {transactions.length > 0 ? (
        <ThemedText type="h4" style={[styles.sectionLabel, { color: theme.text }]}>سجل المعاملات</ThemedText>
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
            <ThemedText type="body" style={{ color: activeTab === "earnings" ? AppColors.primary : theme.textSecondary, fontWeight: FontWeight.semiBold }}>
              الأرباح
            </ThemedText>
          </Pressable>
          <Pressable
            style={[styles.tabItem, activeTab === "wallet" ? [styles.tabItemActive, { borderBottomColor: AppColors.primary }] : null]}
            onPress={() => setActiveTab("wallet")}
          >
            <Feather name="credit-card" size={16} color={activeTab === "wallet" ? AppColors.primary : theme.textSecondary} />
            <ThemedText type="body" style={{ color: activeTab === "wallet" ? AppColors.primary : theme.textSecondary, fontWeight: FontWeight.semiBold }}>
              الحساب المالي
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
          data={transactions}
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
