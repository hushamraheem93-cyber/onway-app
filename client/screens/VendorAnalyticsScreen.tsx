/**
 * VendorAnalyticsScreen — merges VendorWalletScreen + VendorRatingsScreen
 * into a single tabbed Analytics dashboard.
 *
 * All business logic, API calls, Firebase listeners, and hooks are
 * preserved from the original screens. Only UI/layout changes.
 */
import React, { useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { MaterialCommunityIcons, Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useTheme } from "@/hooks/useTheme";
import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";
import { getApiUrl } from "@/lib/query-client";
import { formatPrice } from "@/constants/currency";
import {
  AppColors,
  FontFamily,
  Shadows,
  BorderRadius,
} from "@/constants/theme";
import { SettlementStatusBar } from "@/components/SettlementStatusBar";
import { SettlementHistoryList } from "@/components/SettlementHistoryList";
import { useSettlement } from "@/hooks/useSettlement";

const ORANGE = AppColors.primary;
const SCREEN_W = Dimensions.get("window").width;

// ─── Types ─────────────────────────────────────────────────────────────────────

type Period = "today" | "week" | "month" | "all";
type FilterType = "all" | "unanswered" | "high" | "low";

interface DaySale {
  date: string;
  revenue: number;
}
interface RecentSale {
  id: string;
  date: string;
  subtotal: number;
  status: string;
  customerPhone: string;
  itemCount: number;
  netEarning?: number;
  commissionRate?: number;
}
interface WalletData {
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  dailySales: DaySale[];
  recentSales: RecentSale[];
  period: string;
}
interface RatingItem {
  id: string;
  stars: number;
  comment?: string;
  image?: string;
  customerPhone?: string;
  createdAt: string;
  vendorReply?: string;
  vendorRepliedAt?: string;
  hidden?: boolean;
}
interface RatingsSummary {
  average: number;
  total: number;
  breakdown: { stars: number; count: number }[];
  items: RatingItem[];
  hasMore: boolean;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const PERIOD_LABELS: Record<Period, string> = {
  today: "اليوم",
  week: "الأسبوع",
  month: "الشهر",
  all: "الكل",
};
const STATUS_LABELS: Record<string, string> = {
  delivered: "تم التوصيل",
  picked_up: "استُلم",
  delivering: "في الطريق",
};
const FILTER_TABS: { key: FilterType; label: string }[] = [
  { key: "all", label: "الكل" },
  { key: "unanswered", label: "بدون رد" },
  { key: "high", label: "الأعلى" },
  { key: "low", label: "الأقل" },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function shortDate(iso: string) {
  try {
    const d = new Date(iso);
    return `${d.getDate()}/${d.getMonth() + 1}`;
  } catch {
    return iso;
  }
}
function fullDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("ar-IQ", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}
function decodeVendorId(token: string | null): string | null {
  if (!token) return null;
  try {
    const p = JSON.parse(atob(token.split(".")[1]));
    return p.vendorId || p.sub || p.id || null;
  } catch {
    return null;
  }
}

// ─── Star row ─────────────────────────────────────────────────────────────────

function StarRow({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <MaterialCommunityIcons
          key={i}
          name={i <= Math.round(value) ? "star" : "star-outline"}
          size={size}
          color={AppColors.warning}
        />
      ))}
    </View>
  );
}

// ─── Bar chart ────────────────────────────────────────────────────────────────

function BarChart({ data }: { data: DaySale[] }) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.revenue), 1);
  const barW = Math.max(24, Math.min(36, (SCREEN_W - 80) / data.length - 6));
  return (
    <View style={{ marginTop: 8, paddingBottom: 4 }}>
      <View
        style={{
          flexDirection: "row-reverse",
          alignItems: "flex-end",
          gap: 4,
          paddingHorizontal: 4,
        }}
      >
        {data.map((d, i) => {
          const h = Math.max(4, (d.revenue / max) * 110);
          return (
            <View key={i} style={{ alignItems: "center", gap: 4 }}>
              <View
                style={{
                  height: h,
                  width: barW,
                  borderRadius: 6,
                  backgroundColor: ORANGE,
                  opacity: 0.85,
                }}
              />
              <ThemedText
                style={{
                  fontFamily: FontFamily.tajawal,
                  fontSize: 9,
                  color: AppColors.gray500,
                  textAlign: "center",
                }}
              >
                {shortDate(d.date)}
              </ThemedText>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ─── Reply Modal ──────────────────────────────────────────────────────────────

function ReplyModal({
  visible,
  existingReply,
  onClose,
  onSave,
}: {
  visible: boolean;
  existingReply: string;
  onClose: () => void;
  onSave: (text: string) => Promise<void>;
}) {
  const { theme } = useTheme();
  const [text, setText] = useState(existingReply);
  const [saving, setSaving] = useState(false);
  const handleSave = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await onSave(text.trim());
      onClose();
    } catch {
      Alert.alert("خطأ", "تعذّر حفظ الرد");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView
        style={rm.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[rm.sheet, { backgroundColor: theme.backgroundDefault }]}>
          <View style={rm.handle} />
          <View style={rm.header}>
            <ThemedText style={rm.title}>الرد على التقييم</ThemedText>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="إغلاق الرد على التقييم"
            >
              <Feather name="x" size={20} color={theme.textSecondary} />
            </Pressable>
          </View>
          <TextInput
            style={[
              rm.input,
              {
                backgroundColor: theme.backgroundRoot,
                color: theme.text,
                borderColor: theme.border ?? AppColors.divider,
              },
            ]}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            placeholder="اكتب ردك هنا..."
            placeholderTextColor={theme.textSecondary}
            value={text}
            onChangeText={setText}
            textAlign="right"
          />
          <View style={rm.btns}>
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={[rm.btn, { backgroundColor: theme.backgroundRoot }]}
            >
              <ThemedText
                style={{
                  color: theme.textSecondary,
                  fontFamily: FontFamily.cairoBold,
                }}
              >
                إلغاء
              </ThemedText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={handleSave}
              disabled={saving || !text.trim()}
              style={[
                rm.btn,
                {
                  backgroundColor: ORANGE,
                  opacity: saving || !text.trim() ? 0.6 : 1,
                },
              ]}
            >
              {saving ? (
                <ActivityIndicator size="small" color={AppColors.white} />
              ) : (
                <ThemedText
                  style={{
                    color: AppColors.white,
                    fontFamily: FontFamily.cairoBold,
                  }}
                >
                  {existingReply ? "تعديل الرد" : "إرسال الرد"}
                </ThemedText>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const rm = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: AppColors.overlay,
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    gap: 16,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: AppColors.gray200,
    alignSelf: "center",
  },
  header: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: { fontFamily: FontFamily.cairoBold, fontSize: 16 },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    minHeight: 100,
    fontFamily: FontFamily.tajawal,
    fontSize: 16,
  },
  btns: { flexDirection: "row-reverse", gap: 10 },
  btn: { flex: 1, padding: 14, borderRadius: 14, alignItems: "center" },
});

// ─── Wallet tab ────────────────────────────────────────────────────────────────

function WalletTab() {
  const { vendorToken } = useAuth();
  const { theme } = useTheme();
  // H-50: see VendorWalletScreen — the settlementLedger onSnapshot listener that
  // used to live here could only ever receive permission-denied, because the rules
  // close that collection to the client SDK. useSettlement is the working source.
  const settlement = useSettlement("vendor");
  const [period, setPeriod] = useState<Period>("month");

  const handleRequestSettlement = useCallback(() => {
    Alert.alert(
      "طلب تسوية",
      `سيتم إرسال طلب تسوية بالمبلغ ${formatPrice(settlement.view?.outstanding ?? 0)} إلى الإدارة.`,
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "إرسال",
          onPress: async () => {
            const r = await settlement.requestSettlement();
            if (!r.ok) Alert.alert("تعذّر الطلب", r.error || "حاول مرة أخرى");
          },
        },
      ],
    );
  }, [settlement]);

  const { data, isLoading, refetch, isRefetching } = useQuery<WalletData>({
    queryKey: ["/api/vendor/wallet", period],
    queryFn: async () => {
      const url = new URL("/api/vendor/wallet", getApiUrl());
      url.searchParams.set("period", period);
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${vendorToken}` },
      });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
    enabled: !!vendorToken,
  });

  const totalRevenue = data?.totalRevenue ?? 0;
  const totalOrders = data?.totalOrders ?? 0;
  const avgOrder = data?.avgOrderValue ?? 0;
  const dailySales = data?.dailySales ?? [];
  const recentSales = data?.recentSales ?? [];

  const liveSettlementView = settlement.view;

  return (
    <ScrollView
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 16,
        gap: 14,
      }}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refetch}
          tintColor={ORANGE}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* Settlement status bar */}
      <SettlementStatusBar
        view={liveSettlementView}
        requesting={settlement.requesting}
        onRequest={handleRequestSettlement}
        containerStyle={{ marginHorizontal: 0, marginTop: 0 }}
      />
      <SettlementHistoryList history={settlement.history} />

      {/* Period selector */}
      <View style={wt.periodRow}>
        {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
          <Pressable
            accessibilityRole="button"
            key={p}
            style={[wt.periodBtn, period === p && { backgroundColor: ORANGE }]}
            onPress={() => setPeriod(p)}
            testID={`btn-period-${p}`}
          >
            <ThemedText
              style={[
                wt.periodText,
                period === p && { color: AppColors.white },
              ]}
            >
              {PERIOD_LABELS[p]}
            </ThemedText>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <View style={{ alignItems: "center", paddingVertical: 40 }}>
          <ActivityIndicator size="large" color={ORANGE} />
        </View>
      ) : (
        <>
          {/* Revenue card */}
          <View style={[wt.revenueCard, { backgroundColor: ORANGE }]}>
            <MaterialCommunityIcons
              name="wallet-outline"
              size={32}
              color="rgba(255,255,255,0.7)"
            />
            <ThemedText style={wt.revenueLabel}>إجمالي المبيعات</ThemedText>
            <ThemedText style={wt.revenueValue}>
              {formatPrice(totalRevenue)}
            </ThemedText>
            <ThemedText style={wt.revenuePeriod}>
              {PERIOD_LABELS[period]}
            </ThemedText>
          </View>

          {/* Stats row */}
          <View style={wt.statsRow}>
            <View
              style={[
                wt.statCard,
                { backgroundColor: theme.backgroundDefault },
              ]}
            >
              <MaterialCommunityIcons
                name="clipboard-check-outline"
                size={22}
                color={ORANGE}
              />
              <ThemedText style={[wt.statValue, { color: ORANGE }]}>
                {totalOrders}
              </ThemedText>
              <ThemedText style={wt.statLabel}>طلب مكتمل</ThemedText>
            </View>
            <View
              style={[
                wt.statCard,
                { backgroundColor: theme.backgroundDefault },
              ]}
            >
              <MaterialCommunityIcons
                name="chart-line"
                size={22}
                color={AppColors.success}
              />
              <ThemedText style={[wt.statValue, { color: AppColors.success }]}>
                {formatPrice(avgOrder)}
              </ThemedText>
              <ThemedText style={wt.statLabel}>متوسط الطلب</ThemedText>
            </View>
          </View>

          {/* Bar chart */}
          {dailySales.length > 0 && (
            <View
              style={[wt.section, { backgroundColor: theme.backgroundDefault }]}
            >
              <View style={wt.sectionHeader}>
                <Feather name="bar-chart-2" size={16} color={ORANGE} />
                <ThemedText style={wt.sectionTitle}>
                  المبيعات اليومية
                </ThemedText>
              </View>
              <BarChart data={dailySales} />
            </View>
          )}

          {/* Recent sales */}
          {recentSales.length > 0 ? (
            <View
              style={[wt.section, { backgroundColor: theme.backgroundDefault }]}
            >
              <View style={wt.sectionHeader}>
                <Feather name="list" size={16} color={ORANGE} />
                <ThemedText style={wt.sectionTitle}>آخر المبيعات</ThemedText>
              </View>
              {recentSales.map((sale, i) => (
                <View
                  key={sale.id}
                  style={[
                    wt.saleRow,
                    i < recentSales.length - 1 && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: AppColors.gray100,
                    },
                  ]}
                >
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <ThemedText style={[wt.saleAmount, { color: ORANGE }]}>
                      {formatPrice(sale.subtotal)}
                    </ThemedText>
                    {sale.netEarning !== undefined && (
                      <ThemedText
                        style={{
                          fontFamily: FontFamily.cairoBold,
                          fontSize: 12,
                          color: AppColors.success,
                        }}
                      >
                        صافي: {formatPrice(sale.netEarning)}
                      </ThemedText>
                    )}
                    <View
                      style={[
                        wt.saleBadge,
                        { backgroundColor: AppColors.secondary },
                      ]}
                    >
                      <ThemedText style={[wt.saleBadgeText, { color: ORANGE }]}>
                        {STATUS_LABELS[sale.status] || sale.status}
                      </ThemedText>
                    </View>
                  </View>
                  <View style={{ alignItems: "flex-start", gap: 2 }}>
                    <ThemedText style={wt.saleDate}>
                      {fullDate(sale.date)}
                    </ThemedText>
                    <ThemedText style={wt.saleMeta}>
                      {sale.itemCount} منتج ·{" "}
                      {sale.customerPhone
                        .slice(-4)
                        .padStart(sale.customerPhone.length, "*")}
                    </ThemedText>
                    {sale.commissionRate !== undefined &&
                      sale.commissionRate > 0 && (
                        <ThemedText
                          style={[wt.saleMeta, { color: AppColors.error }]}
                        >
                          عمولة {sale.commissionRate}%
                        </ThemedText>
                      )}
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View
              style={{ alignItems: "center", paddingVertical: 48, gap: 10 }}
            >
              <MaterialCommunityIcons
                name="wallet-outline"
                size={52}
                color={ORANGE}
                style={{ opacity: 0.25 }}
              />
              <ThemedText
                style={{
                  fontFamily: FontFamily.cairoBold,
                  fontSize: 17,
                  color: theme.text,
                  textAlign: "center",
                }}
              >
                لا توجد مبيعات بعد
              </ThemedText>
              <ThemedText
                style={{
                  fontFamily: FontFamily.tajawal,
                  fontSize: 13,
                  color: theme.textSecondary,
                  textAlign: "center",
                }}
              >
                ستظهر هنا مبيعاتك بعد اكتمال أول طلب
              </ThemedText>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const wt = StyleSheet.create({
  periodRow: {
    flexDirection: "row-reverse",
    gap: 8,
    backgroundColor: AppColors.gray100,
    borderRadius: 14,
    padding: 4,
  },
  periodBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: "center",
  },
  periodText: {
    fontFamily: FontFamily.cairoBold,
    fontSize: 13,
    color: AppColors.gray500,
  },
  revenueCard: { borderRadius: 20, padding: 24, alignItems: "center", gap: 6 },
  revenueLabel: {
    fontFamily: FontFamily.tajawal,
    fontSize: 14,
    color: "rgba(255,255,255,0.75)",
    textAlign: "center",
  },
  revenueValue: {
    fontFamily: FontFamily.cairoBold,
    fontSize: 30,
    lineHeight: 42,
    includeFontPadding: true,
    color: AppColors.white,
    textAlign: "center",
  },
  revenuePeriod: {
    fontFamily: FontFamily.tajawal,
    fontSize: 12,
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
  },
  statsRow: { flexDirection: "row-reverse", gap: 10 },
  statCard: {
    flex: 1,
    borderRadius: 20,
    padding: 16,
    alignItems: "center",
    gap: 6,
    ...Shadows.sm,
  },
  statValue: {
    fontFamily: FontFamily.cairoBold,
    fontSize: 20,
    lineHeight: 30,
    includeFontPadding: true,
    textAlign: "center",
  },
  statLabel: {
    fontFamily: FontFamily.tajawal,
    fontSize: 12,
    color: AppColors.gray500,
    textAlign: "center",
  },
  section: { borderRadius: 20, padding: 16, ...Shadows.sm },
  sectionHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: FontFamily.cairoBold,
    fontSize: 14,
    color: AppColors.gray800,
  },
  saleRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  saleAmount: { fontFamily: FontFamily.cairoBold, fontSize: 15 },
  saleBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  saleBadgeText: { fontFamily: FontFamily.cairoBold, fontSize: 10 },
  saleDate: {
    fontFamily: FontFamily.cairoBold,
    fontSize: 12,
    color: AppColors.gray700,
  },
  saleMeta: {
    fontFamily: FontFamily.tajawal,
    fontSize: 11,
    color: AppColors.gray400,
  },
});

// ─── Ratings tab ──────────────────────────────────────────────────────────────

function RatingsTab({ vendorId }: { vendorId: string | null }) {
  const { vendorToken } = useAuth();
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FilterType>("all");
  const [replyModal, setReply] = useState({
    visible: false,
    ratingId: "",
    existing: "",
  });

  const queryKey = ["vendor-ratings", vendorId, filter];
  const { data, isLoading, isRefetching, refetch } = useQuery<RatingsSummary>({
    queryKey,
    enabled: !!vendorId,
    queryFn: async () => {
      const url = new URL(`/api/stores/${vendorId}/ratings`, getApiUrl());
      url.searchParams.set("filter", filter);
      url.searchParams.set("page", "1");
      url.searchParams.set("limit", "50");
      const res = await fetch(url.toString(), {
        headers: vendorToken ? { Authorization: `Bearer ${vendorToken}` } : {},
      });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
  });

  const summary = data ?? {
    average: 0,
    total: 0,
    breakdown: [],
    items: [],
    hasMore: false,
  };

  const handleReply = async (ratingId: string, text: string) => {
    const res = await fetch(
      new URL(`/api/ratings/${ratingId}/vendor-reply`, getApiUrl()).toString(),
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(vendorToken ? { Authorization: `Bearer ${vendorToken}` } : {}),
        },
        body: JSON.stringify({ reply: text }),
      },
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "فشل");
    }
    queryClient.invalidateQueries({ queryKey });
  };

  const renderItem = ({ item }: { item: RatingItem }) => {
    const dateStr = new Date(item.createdAt).toLocaleDateString("ar-IQ", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    return (
      <View
        style={[
          rt.card,
          { backgroundColor: theme.backgroundDefault },
          Shadows.sm,
        ]}
      >
        <View style={rt.header}>
          <View style={[rt.avatar, { backgroundColor: ORANGE + "15" }]}>
            <Feather name="user" size={15} color={ORANGE} />
          </View>
          <View style={{ flex: 1 }}>
            <ThemedText style={rt.phone}>
              {item.customerPhone
                ? `*****${item.customerPhone.slice(-4)}`
                : "زبون"}
            </ThemedText>
            <ThemedText style={[rt.date, { color: theme.textSecondary }]}>
              {dateStr}
            </ThemedText>
          </View>
          <StarRow value={item.stars} size={13} />
        </View>
        {item.comment ? (
          <ThemedText style={[rt.comment, { color: theme.text }]}>
            {item.comment}
          </ThemedText>
        ) : (
          <ThemedText
            style={[
              rt.comment,
              { color: theme.textSecondary, fontStyle: "italic" },
            ]}
          >
            بدون تعليق
          </ThemedText>
        )}
        {item.image && (
          <Image
            source={{ uri: item.image }}
            style={rt.img}
            contentFit="cover"
          />
        )}
        {item.vendorReply && (
          <View
            style={[
              rt.replyBox,
              { backgroundColor: ORANGE + "08", borderColor: ORANGE + "25" },
            ]}
          >
            <View style={rt.replyHeader}>
              <Feather name="message-circle" size={13} color={ORANGE} />
              <ThemedText style={[rt.replyLabel, { color: ORANGE }]}>
                ردك
              </ThemedText>
            </View>
            <ThemedText style={[rt.replyText, { color: theme.text }]}>
              {item.vendorReply}
            </ThemedText>
          </View>
        )}
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            setReply({
              visible: true,
              ratingId: item.id,
              existing: item.vendorReply ?? "",
            })
          }
          style={[
            rt.replyBtn,
            {
              borderColor: ORANGE + "50",
              backgroundColor: item.vendorReply ? ORANGE + "10" : ORANGE,
            },
          ]}
        >
          <Feather
            name="message-circle"
            size={13}
            color={item.vendorReply ? ORANGE : AppColors.white}
          />
          <ThemedText
            style={[
              rt.replyBtnText,
              { color: item.vendorReply ? ORANGE : AppColors.white },
            ]}
          >
            {item.vendorReply ? "تعديل الرد" : "الرد على التقييم"}
          </ThemedText>
        </Pressable>
      </View>
    );
  };

  const ListHeader = () => (
    <View>
      {/* Stats card */}
      <View
        style={[
          rt.statsCard,
          { backgroundColor: theme.backgroundDefault },
          Shadows.sm,
        ]}
      >
        <View style={rt.statsRow}>
          <View style={rt.stat}>
            <ThemedText style={[rt.statNum, { color: AppColors.warning }]}>
              {summary.average > 0 ? summary.average.toFixed(1) : "—"}
            </ThemedText>
            <StarRow value={summary.average} size={16} />
            <ThemedText style={[rt.statLabel, { color: theme.textSecondary }]}>
              متوسط التقييم
            </ThemedText>
          </View>
          <View
            style={[
              rt.statDivider,
              { backgroundColor: theme.border ?? AppColors.divider },
            ]}
          />
          <View style={rt.stat}>
            <ThemedText style={[rt.statNum, { color: ORANGE }]}>
              {summary.total}
            </ThemedText>
            <ThemedText style={[rt.statLabel, { color: theme.textSecondary }]}>
              إجمالي التقييمات
            </ThemedText>
          </View>
          <View
            style={[
              rt.statDivider,
              { backgroundColor: theme.border ?? AppColors.divider },
            ]}
          />
          <View style={rt.stat}>
            <ThemedText style={[rt.statNum, { color: AppColors.success }]}>
              {summary.items.filter((i) => i.vendorReply).length}
            </ThemedText>
            <ThemedText style={[rt.statLabel, { color: theme.textSecondary }]}>
              تم الرد
            </ThemedText>
          </View>
        </View>
      </View>

      {/* Filter tabs */}
      <View style={rt.filterRow}>
        {FILTER_TABS.map((tab) => (
          <Pressable
            accessibilityRole="button"
            key={tab.key}
            onPress={() => setFilter(tab.key)}
            style={[
              rt.filterTab,
              filter === tab.key
                ? { backgroundColor: ORANGE }
                : {
                    backgroundColor: theme.backgroundDefault,
                    borderColor: theme.border ?? AppColors.divider,
                    borderWidth: 1,
                  },
            ]}
          >
            <ThemedText
              style={[
                rt.filterLabel,
                {
                  color:
                    filter === tab.key ? AppColors.white : theme.textSecondary,
                },
              ]}
            >
              {tab.label}
            </ThemedText>
          </Pressable>
        ))}
      </View>
    </View>
  );

  return (
    <>
      <FlatList
        data={summary.items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 16,
          gap: 10,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={ORANGE}
          />
        }
        ListHeaderComponent={<ListHeader />}
        ListEmptyComponent={
          isLoading ? (
            <View style={{ alignItems: "center", paddingVertical: 40 }}>
              <ActivityIndicator color={ORANGE} />
            </View>
          ) : (
            <View
              style={{ alignItems: "center", paddingVertical: 40, gap: 10 }}
            >
              <MaterialCommunityIcons
                name="star-outline"
                size={48}
                color={AppColors.gray300}
              />
              <ThemedText
                style={{
                  fontFamily: FontFamily.cairoBold,
                  fontSize: 16,
                  color: AppColors.gray400,
                  textAlign: "center",
                }}
              >
                لا توجد تقييمات بعد
              </ThemedText>
            </View>
          )
        }
        renderItem={renderItem}
      />
      <ReplyModal
        visible={replyModal.visible}
        existingReply={replyModal.existing}
        onClose={() => setReply((s) => ({ ...s, visible: false }))}
        onSave={(text) => handleReply(replyModal.ratingId, text)}
      />
    </>
  );
}

const rt = StyleSheet.create({
  card: { borderRadius: BorderRadius.lg, padding: 14, marginBottom: 10 },
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: "center",
    alignItems: "center",
  },
  phone: { fontFamily: FontFamily.cairoBold, fontSize: 13 },
  date: { fontFamily: FontFamily.tajawal, fontSize: 11 },
  comment: {
    fontFamily: FontFamily.tajawal,
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 8,
    textAlign: "right",
  },
  img: { width: "100%", height: 140, borderRadius: 10, marginBottom: 8 },
  replyBox: { borderWidth: 1, borderRadius: 12, padding: 10, marginBottom: 8 },
  replyHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  replyLabel: { fontFamily: FontFamily.cairoBold, fontSize: 12 },
  replyText: {
    fontFamily: FontFamily.tajawal,
    fontSize: 13,
    textAlign: "right",
  },
  replyBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
  },
  replyBtnText: { fontFamily: FontFamily.cairoBold, fontSize: 12 },
  statsCard: { borderRadius: 20, padding: 16, marginBottom: 14 },
  statsRow: { flexDirection: "row-reverse", alignItems: "center" },
  stat: { flex: 1, alignItems: "center", gap: 4 },
  statNum: {
    fontFamily: FontFamily.cairoBold,
    fontSize: 26,
    lineHeight: 36,
    includeFontPadding: true,
  },
  statLabel: {
    fontFamily: FontFamily.tajawal,
    fontSize: 11,
    textAlign: "center",
  },
  statDivider: { width: 1, height: 50, marginHorizontal: 8 },
  filterRow: {
    flexDirection: "row-reverse",
    gap: 8,
    marginBottom: 14,
    flexWrap: "wrap",
  },
  filterTab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  filterLabel: { fontFamily: FontFamily.cairoBold, fontSize: 12 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

const ANALYTICS_TABS = [
  { key: "wallet", label: "الأرباح", icon: "wallet-outline" },
  { key: "ratings", label: "التقييمات", icon: "star-outline" },
] as const;

export default function VendorAnalyticsScreen() {
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { vendorToken, vendorProfile } = useAuth();
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState<"wallet" | "ratings">("wallet");

  const vendorId = vendorProfile?.id ?? decodeVendorId(vendorToken);

  return (
    <View style={{ flex: 1, backgroundColor: AppColors.background }}>
      {/* Inner tab bar */}
      <View
        style={[
          main.tabBar,
          {
            paddingTop: headerHeight,
            backgroundColor: theme.backgroundDefault,
          },
        ]}
      >
        {ANALYTICS_TABS.map((t) => {
          const active = activeTab === t.key;
          return (
            <Pressable
              accessibilityRole="button"
              key={t.key}
              style={[
                main.tabBtn,
                active && { backgroundColor: ORANGE + "12" },
              ]}
              onPress={() => setActiveTab(t.key)}
            >
              <MaterialCommunityIcons
                name={t.icon as any}
                size={18}
                color={active ? ORANGE : AppColors.gray400}
              />
              <ThemedText
                style={[
                  main.tabLabel,
                  { color: active ? ORANGE : AppColors.gray400 },
                ]}
              >
                {t.label}
              </ThemedText>
              {active && <View style={main.tabIndicator} />}
            </Pressable>
          );
        })}
      </View>

      {/* Content */}
      <View style={{ flex: 1, paddingBottom: tabBarHeight }}>
        {activeTab === "wallet" ? (
          <WalletTab />
        ) : (
          <RatingsTab vendorId={vendorId ?? null} />
        )}
      </View>
    </View>
  );
}

const main = StyleSheet.create({
  tabBar: {
    flexDirection: "row-reverse",
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: AppColors.divider,
    ...Shadows.xs,
  },
  tabBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    gap: 4,
    borderRadius: 14,
    marginHorizontal: 8,
    position: "relative",
  },
  tabLabel: { fontFamily: FontFamily.cairoBold, fontSize: 13 },
  tabIndicator: {
    position: "absolute",
    bottom: 0,
    left: "20%",
    right: "20%",
    height: 3,
    borderRadius: 2,
    backgroundColor: ORANGE,
  },
});
