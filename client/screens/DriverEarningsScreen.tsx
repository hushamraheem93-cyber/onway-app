import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  StyleSheet,
  View,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  TextInput,
  Alert,
} from "react-native";
import { onSnapshot, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { GradientBackground } from "@/components/GradientBackground";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { AppColors, Spacing, BorderRadius, Shadows, FontWeight } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";
import { formatPrice } from "@/constants/currency";
import { SettlementStatusBar } from "@/components/SettlementStatusBar";
import { useSettlement } from "@/hooks/useSettlement";
import { useSystemSettings } from "@/context/SystemSettingsContext";

// ─── Types ────────────────────────────────────────────────────────────────────
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
  type: "earning" | "commission" | "payment" | "adjustment";
  adjustmentType?: "add" | "deduct";
  description: string;
  notes?: string;
  orderId?: string;
  amountOwedAfter?: number;
  timestamp: string;
  // Payment-specific fields (added in T019)
  paymentMethod?: "cash" | "transfer" | "card" | "other";
  adminName?: string;
  receiptNumber?: string;
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

type TxFilter = "all" | "today" | "week" | "month" | "3months" | "custom";
type ActiveTab = "earnings" | "wallet" | "report" | "payments";

// ─── Account status helper ────────────────────────────────────────────────────
function getAccountStatus(owed: number, threshold = 100000): {
  label: string;
  sublabel: string;
  color: string;
  bgColor: string;
  icon: keyof typeof Feather.glyphMap;
} {
  if (owed >= threshold)
    return {
      label: "الحساب موقوف",
      sublabel: "تواصل مع الإدارة فوراً لتسوية الحساب",
      color: AppColors.error,
      bgColor: AppColors.errorLight,
      icon: "x-circle",
    };
  const highMark = threshold * 0.8;
  const warnMark = threshold * 0.5;
  if (owed >= highMark)
    return {
      label: "المستحقات مرتفعة",
      sublabel: `تجاوزت ${formatPrice(Math.round(highMark))} — سارع للتسوية قبل الحجب`,
      color: AppColors.primary,
      bgColor: AppColors.secondary,
      icon: "alert-triangle",
    };
  if (owed >= warnMark)
    return {
      label: "توجد مستحقات",
      sublabel: `${formatPrice(owed)} مستحق — يُطلب التسوية قبل تجاوز ${formatPrice(threshold)}`,
      color: AppColors.warning,
      bgColor: AppColors.warningLight,
      icon: "alert-circle",
    };
  return {
    label: "الحساب سليم",
    sublabel: owed > 0 ? `مستحق ${formatPrice(owed)} — الحساب ضمن الحد` : "لا توجد مستحقات",
    color: AppColors.success,
    bgColor: AppColors.successLight,
    icon: "check-circle",
  };
}

// ─── Debt limit progress bar ─────────────────────────────────────────────────
function DebtLimitBar({
  owed,
  threshold,
}: {
  owed: number;
  threshold: number;
}) {
  const { theme } = useTheme();
  const pct = Math.min(100, threshold > 0 ? (owed / threshold) * 100 : 0);
  const barColor =
    pct >= 100 ? AppColors.error
    : pct >= 80  ? AppColors.primary
    : pct >= 50  ? AppColors.warning
    : AppColors.success;

  return (
    <View style={[styles.ratioCard, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
      <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: Spacing.sm, marginBottom: 8 }}>
        <Feather name="activity" size={16} color={barColor} />
        <ThemedText type="h4" style={{ color: theme.text }}>حد الحجب التلقائي</ThemedText>
        <View style={{ flex: 1 }} />
        <View style={{ paddingHorizontal: Spacing.md, paddingVertical: 3, borderRadius: 20, backgroundColor: barColor + "20" }}>
          <ThemedText type="small" style={{ color: barColor, fontWeight: FontWeight.bold }}>
            {Math.round(pct)}%
          </ThemedText>
        </View>
      </View>
      <View style={{ height: 10, borderRadius: 5, backgroundColor: AppColors.border, overflow: "hidden", marginBottom: Spacing.lg }}>
        <View style={{ width: `${pct}%`, height: "100%", backgroundColor: barColor, borderRadius: 5 }} />
      </View>
      <View style={{ flexDirection: "row-reverse", justifyContent: "space-between" }}>
        <View style={{ alignItems: "center" }}>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>المستحق الحالي</ThemedText>
          <ThemedText type="body" style={{ color: AppColors.error, fontWeight: FontWeight.bold }}>{formatPrice(owed)}</ThemedText>
        </View>
        <View style={{ alignItems: "center" }}>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>حد الحجب</ThemedText>
          <ThemedText type="body" style={{ color: AppColors.warning, fontWeight: FontWeight.bold }}>{formatPrice(threshold)}</ThemedText>
        </View>
        <View style={{ alignItems: "center" }}>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>المتبقي</ThemedText>
          <ThemedText type="body" style={{ color: AppColors.success, fontWeight: FontWeight.bold }}>{formatPrice(Math.max(0, threshold - owed))}</ThemedText>
        </View>
      </View>
    </View>
  );
}

// ─── Day names ───────────────────────────────────────────────────────────────
const DAY_NAMES = ["أحد", "إثن", "ثلا", "أرب", "خمي", "جمع", "سبت"];

function buildWeekData(orders: CompletedOrder[]) {
  const result: { day: string; amount: number; isToday: boolean }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dayStr = d.toISOString().slice(0, 10);
    const amount = orders
      .filter(o => o.completedAt?.startsWith(dayStr))
      .reduce((s, o) => s + (o.driverEarning || 0), 0);
    result.push({ day: DAY_NAMES[d.getDay()], amount, isToday: i === 0 });
  }
  return result;
}

// ─── Bar chart ───────────────────────────────────────────────────────────────
function EarningsBarChart({ orders }: { orders: CompletedOrder[] }) {
  const { theme } = useTheme();
  const data = buildWeekData(orders);
  const maxVal = Math.max(...data.map(d => d.amount), 1);
  return (
    <View style={[chartSt.card, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
      <View style={chartSt.titleRow}>
        <ThemedText type="small" style={{ color: theme.textSecondary }}>أرباح الأسبوع</ThemedText>
        <ThemedText type="h4" style={{ color: theme.text, fontWeight: FontWeight.bold }}>آخر 7 أيام</ThemedText>
      </View>
      <View style={chartSt.barsRow}>
        {data.map((d, i) => {
          const barH = maxVal > 0 ? Math.max((d.amount / maxVal) * 90, d.amount > 0 ? 8 : 0) : 0;
          return (
            <View key={i} style={chartSt.barCol}>
              <ThemedText type="small" style={[chartSt.barValue, { color: d.isToday ? AppColors.primary : theme.textSecondary }]}>
                {d.amount > 0 ? (d.amount >= 1000 ? `${(d.amount / 1000).toFixed(1)}ك` : String(d.amount)) : ""}
              </ThemedText>
              <View style={chartSt.barTrack}>
                <View style={[chartSt.barFill, { height: barH, backgroundColor: d.isToday ? AppColors.primary : AppColors.primary + "50", borderRadius: 4 }]} />
              </View>
              <ThemedText type="small" style={[chartSt.barLabel, { color: d.isToday ? AppColors.primary : theme.textSecondary, fontWeight: d.isToday ? "700" : "400" }]}>
                {d.day}
              </ThemedText>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const chartSt = StyleSheet.create({
  card: { borderRadius: BorderRadius.xl, padding: Spacing.lg, marginBottom: Spacing.lg },
  titleRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: Spacing.lg },
  barsRow: { flexDirection: "row-reverse", alignItems: "flex-end", justifyContent: "space-between", height: 120 },
  barCol: { flex: 1, alignItems: "center", justifyContent: "flex-end", gap: 4 },
  barValue: { fontSize: 9, height: 14 },
  barTrack: { width: "60%", height: 90, justifyContent: "flex-end", alignItems: "center" },
  barFill: { width: "100%" },
  barLabel: { fontSize: 10 },
});

// ─── Filter pills ─────────────────────────────────────────────────────────────
const TX_FILTERS: { key: TxFilter; label: string }[] = [
  { key: "all", label: "الكل" },
  { key: "today", label: "اليوم" },
  { key: "week", label: "الأسبوع" },
  { key: "month", label: "الشهر" },
  { key: "3months", label: "3 أشهر" },
  { key: "custom", label: "مخصص" },
];

function FilterPills({
  active,
  onChange,
}: {
  active: TxFilter;
  onChange: (f: TxFilter) => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 6, marginBottom: Spacing.md }}>
      {TX_FILTERS.map(f => {
        const isActive = f.key === active;
        return (
          <Pressable
            key={f.key}
            onPress={() => onChange(f.key)}
            style={{
              paddingHorizontal: Spacing.md,
              paddingVertical: 6,
              borderRadius: BorderRadius.full,
              backgroundColor: isActive ? AppColors.primary : theme.backgroundDefault,
              borderWidth: 1,
              borderColor: isActive ? AppColors.primary : AppColors.border,
            }}
          >
            <ThemedText type="small" style={{ color: isActive ? AppColors.white : theme.textSecondary, fontWeight: isActive ? FontWeight.bold : FontWeight.regular }}>
              {f.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Payment ratio card ───────────────────────────────────────────────────────
function PaymentRatioCard({ account }: { account: DriverFinancialAccount }) {
  const { theme } = useTheme();
  const commission = account.totalOnwayCommission || 0;
  const paid = account.totalPaid || 0;
  const remaining = Math.max(0, commission - paid);
  const ratio = commission > 0 ? Math.min(1, paid / commission) : 1;
  const pct = Math.round(ratio * 100);
  return (
    <View style={[styles.ratioCard, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
      <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: Spacing.sm, marginBottom: Spacing.lg }}>
        <Feather name="pie-chart" size={16} color={AppColors.primary} />
        <ThemedText type="h4" style={{ color: theme.text }}>نسبة السداد</ThemedText>
        <View style={{ flex: 1 }} />
        <View style={{ paddingHorizontal: Spacing.md, paddingVertical: 3, borderRadius: 20, backgroundColor: pct >= 80 ? AppColors.successLight : pct >= 40 ? AppColors.warningLight : AppColors.errorLight }}>
          <ThemedText type="small" style={{ color: pct >= 80 ? AppColors.success : pct >= 40 ? AppColors.warning : AppColors.error, fontWeight: FontWeight.bold }}>{pct}%</ThemedText>
        </View>
      </View>
      {/* Progress bar */}
      <View style={{ height: 10, borderRadius: 5, backgroundColor: AppColors.border, overflow: "hidden", marginBottom: Spacing.lg }}>
        <View style={{ width: `${pct}%`, height: "100%", backgroundColor: pct >= 80 ? AppColors.success : pct >= 40 ? AppColors.warning : AppColors.error, borderRadius: 5 }} />
      </View>
      <View style={{ flexDirection: "row-reverse", justifyContent: "space-between" }}>
        <View style={{ alignItems: "center" }}>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>إجمالي العمولات</ThemedText>
          <ThemedText type="body" style={{ color: AppColors.error, fontWeight: FontWeight.bold }}>{formatPrice(commission)}</ThemedText>
        </View>
        <View style={{ alignItems: "center" }}>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>المسدّد</ThemedText>
          <ThemedText type="body" style={{ color: AppColors.success, fontWeight: FontWeight.bold }}>{formatPrice(paid)}</ThemedText>
        </View>
        <View style={{ alignItems: "center" }}>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>المتبقي</ThemedText>
          <ThemedText type="body" style={{ color: remaining > 0 ? AppColors.warning : AppColors.success, fontWeight: FontWeight.bold }}>{formatPrice(remaining)}</ThemedText>
        </View>
      </View>
    </View>
  );
}

// ─── Timeline item ────────────────────────────────────────────────────────────
function TimelineItem({ item, isLast }: { item: DriverTransaction; isLast: boolean }) {
  const { theme } = useTheme();
  const isPayment    = item.type === "payment";
  const isAdjustment = item.type === "adjustment";
  const isEarning    = item.type === "earning";
  const isCommission = item.type === "commission";

  const color = isPayment ? AppColors.success : isAdjustment ? AppColors.warning : isEarning ? AppColors.info : AppColors.error;
  const icon: keyof typeof Feather.glyphMap = isPayment ? "check-circle" : isAdjustment ? "edit-2" : isEarning ? "arrow-up-circle" : "arrow-down-circle";
  const typeLabel = isPayment ? "دفعة للإدارة" : isAdjustment ? (item.adjustmentType === "deduct" ? "تعديل — خصم" : "تعديل — إضافة") : isEarning ? "أرباح توصيل" : "عمولة OnWay";
  const amountSign = isEarning ? "+" : isPayment || (isAdjustment && item.adjustmentType === "deduct") ? "-" : "+";

  const ts = item.timestamp ? new Date(item.timestamp) : null;
  const dateStr = ts ? ts.toLocaleDateString("ar-IQ") : "";
  const timeStr = ts
    ? ts.toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <View style={{ flexDirection: "row-reverse", paddingHorizontal: Spacing.lg }}>
      {/* Timeline rail */}
      <View style={{ alignItems: "center", marginLeft: Spacing.md }}>
        <View style={[tlSt.dot, { backgroundColor: color + "20", borderColor: color }]}>
          <Feather name={icon} size={14} color={color} />
        </View>
        {!isLast ? <View style={[tlSt.line, { backgroundColor: AppColors.border }]} /> : null}
      </View>

      {/* Content */}
      <View style={[tlSt.card, { backgroundColor: theme.backgroundDefault, flex: 1, marginBottom: isLast ? 0 : Spacing.sm }, Shadows.sm]}>
        {/* Row 1: label + amount */}
        <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }}>
          <ThemedText type="body" style={{ color: theme.text, fontWeight: FontWeight.semiBold }}>{typeLabel}</ThemedText>
          <ThemedText type="body" style={{ color, fontWeight: FontWeight.bold }}>
            {amountSign}{formatPrice(item.amount)}
          </ThemedText>
        </View>

        {/* Row 2: description + balance after */}
        <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
          <ThemedText type="small" style={{ color: theme.textSecondary, flex: 1, textAlign: "right" }} numberOfLines={1}>
            {item.description || item.notes || "—"}
          </ThemedText>
          {item.amountOwedAfter !== undefined ? (
            <ThemedText type="small" style={{ color: theme.textSecondary, marginLeft: Spacing.sm }}>
              مستحق: {formatPrice(item.amountOwedAfter)}
            </ThemedText>
          ) : null}
        </View>

        {/* Row 3: orderId + date/time */}
        <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
          {item.orderId ? (
            <ThemedText type="small" style={{ color: AppColors.primary, fontSize: 10 }}>
              #{item.orderId.slice(-6)}
            </ThemedText>
          ) : <View />}
          <ThemedText type="small" style={{ color: theme.textSecondary, fontSize: 10 }}>
            {dateStr} {timeStr}
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

const tlSt = StyleSheet.create({
  dot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    justifyContent: "center",
    alignItems: "center",
  },
  line: {
    width: 2,
    flex: 1,
    minHeight: 16,
    marginVertical: 2,
  },
  card: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
});

// ─── Payment method labels ────────────────────────────────────────────────────
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash:     "نقدي",
  transfer: "تحويل بنكي",
  card:     "بطاقة",
  other:    "أخرى",
};

// ─── Payment receipt card ─────────────────────────────────────────────────────
function PaymentReceiptCard({ item, index }: { item: DriverTransaction; index: number }) {
  const { theme } = useTheme();
  const ts = item.timestamp ? new Date(item.timestamp) : null;
  const dateStr = ts ? ts.toLocaleDateString("ar-IQ") : "—";
  const timeStr = ts ? ts.toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit" }) : "";
  const methodLabel = PAYMENT_METHOD_LABELS[item.paymentMethod || "cash"] || "نقدي";

  return (
    <View style={[rcSt.card, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
      {/* Header row: receipt number + amount */}
      <View style={rcSt.headerRow}>
        <View style={rcSt.badgeRow}>
          <View style={rcSt.indexBadge}>
            <ThemedText type="small" style={{ color: AppColors.white, fontWeight: FontWeight.bold, fontSize: 10 }}>
              #{index + 1}
            </ThemedText>
          </View>
          {item.receiptNumber ? (
            <ThemedText type="small" style={{ color: AppColors.primary, fontSize: 10, fontWeight: FontWeight.semiBold }}>
              {item.receiptNumber}
            </ThemedText>
          ) : null}
        </View>
        <ThemedText type="h4" style={{ color: AppColors.success, fontWeight: FontWeight.bold }}>
          {formatPrice(item.amount)}
        </ThemedText>
      </View>

      {/* Divider */}
      <View style={[rcSt.divider, { backgroundColor: AppColors.border }]} />

      {/* Details grid */}
      <View style={rcSt.detailsGrid}>
        <View style={rcSt.detailRow}>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>تاريخ الدفعة</ThemedText>
          <ThemedText type="small" style={{ color: theme.text, fontWeight: FontWeight.semiBold }}>
            {dateStr}  {timeStr}
          </ThemedText>
        </View>
        <View style={rcSt.detailRow}>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>طريقة الدفع</ThemedText>
          <View style={[rcSt.methodBadge, { backgroundColor: AppColors.info + "18" }]}>
            <ThemedText type="small" style={{ color: AppColors.info, fontWeight: FontWeight.semiBold, fontSize: 11 }}>
              {methodLabel}
            </ThemedText>
          </View>
        </View>
        {item.adminName ? (
          <View style={rcSt.detailRow}>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>استلم الدفعة</ThemedText>
            <ThemedText type="small" style={{ color: theme.text, fontWeight: FontWeight.semiBold }}>
              {item.adminName}
            </ThemedText>
          </View>
        ) : null}
        {item.amountOwedAfter !== undefined ? (
          <View style={rcSt.detailRow}>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>المستحق بعد الدفعة</ThemedText>
            <ThemedText type="small" style={{ color: item.amountOwedAfter > 0 ? AppColors.warning : AppColors.success, fontWeight: FontWeight.bold }}>
              {formatPrice(item.amountOwedAfter)}
            </ThemedText>
          </View>
        ) : null}
        {item.notes ? (
          <View style={[rcSt.detailRow, { alignItems: "flex-start" }]}>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>ملاحظات</ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary, flex: 1, textAlign: "left", paddingLeft: Spacing.sm }}>
              {item.notes}
            </ThemedText>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const rcSt = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  headerRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  badgeRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Spacing.sm,
  },
  indexBadge: {
    backgroundColor: AppColors.success,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  divider: { height: 1, marginBottom: Spacing.md },
  detailsGrid: { gap: Spacing.sm },
  detailRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
  },
  methodBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
  },
});

// ─── Completed order row ─────────────────────────────────────────────────────
function OrderItem({ item }: { item: CompletedOrder }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.listItem, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
      <View style={[styles.listItemIcon, { backgroundColor: AppColors.success + "18" }]}>
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
}

// ─── Monthly report view ──────────────────────────────────────────────────────
function MonthlyReport({
  earnings,
  transactions,
}: {
  earnings: EarningsData | null;
  transactions: DriverTransaction[];
}) {
  const { theme } = useTheme();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  const monthTx = transactions.filter(t => t.timestamp && new Date(t.timestamp).getTime() >= monthStart);
  const monthCommission = monthTx.filter(t => t.type === "commission").reduce((s, t) => s + (t.amount || 0), 0);
  const monthPaid = monthTx.filter(t => t.type === "payment").reduce((s, t) => s + (t.amount || 0), 0);
  const monthOrders = earnings?.monthOrders || 0;
  const monthEarnings = earnings?.monthEarnings || 0;
  const avgPerOrder = monthOrders > 0 ? Math.round(monthEarnings / monthOrders) : 0;
  const monthName = now.toLocaleDateString("ar-IQ", { month: "long", year: "numeric" });

  const rows: { label: string; value: string; color: string; icon: keyof typeof Feather.glyphMap }[] = [
    { label: "عدد الطلبات المكتملة", value: `${monthOrders} طلب`, color: AppColors.info, icon: "package" },
    { label: "إجمالي أرباح التوصيل", value: formatPrice(monthEarnings), color: AppColors.success, icon: "dollar-sign" },
    { label: "متوسط الربح لكل طلب", value: formatPrice(avgPerOrder), color: AppColors.primary, icon: "trending-up" },
    { label: "عمولات OnWay هذا الشهر", value: formatPrice(monthCommission), color: AppColors.error, icon: "percent" },
    { label: "المدفوع للإدارة هذا الشهر", value: formatPrice(monthPaid), color: AppColors.success, icon: "check-circle" },
    { label: "الصافي (الأرباح - العمولات)", value: formatPrice(monthEarnings - monthCommission), color: monthEarnings - monthCommission >= 0 ? AppColors.success : AppColors.error, icon: "activity" },
  ];

  return (
    <View style={{ padding: Spacing.lg }}>
      {/* Month header */}
      <View style={[styles.totalCard, { backgroundColor: theme.backgroundDefault }, Shadows.md]}>
        <Feather name="calendar" size={28} color={AppColors.primary} />
        <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: Spacing.sm }}>التقرير الشهري</ThemedText>
        <ThemedText type="h2" style={{ color: theme.text, marginTop: 4 }}>{monthName}</ThemedText>
      </View>

      {/* Report rows */}
      {rows.map((row, i) => (
        <View key={i} style={[styles.reportRow, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
          <View style={[styles.listItemIcon, { backgroundColor: row.color + "18" }]}>
            <Feather name={row.icon} size={18} color={row.color} />
          </View>
          <View style={{ flex: 1, alignItems: "flex-end" }}>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>{row.label}</ThemedText>
          </View>
          <ThemedText type="body" style={{ color: row.color, fontWeight: FontWeight.bold }}>{row.value}</ThemedText>
        </View>
      ))}

      {/* Note */}
      <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6, marginTop: Spacing.md }}>
        <Feather name="info" size={12} color={theme.textSecondary} />
        <ThemedText type="small" style={{ color: theme.textSecondary, flex: 1, textAlign: "right" }}>
          العمولات والمدفوعات محسوبة من معاملات الشهر الحالي فقط
        </ThemedText>
      </View>
    </View>
  );
}

// ─── Stat card helper ─────────────────────────────────────────────────────────
function StatCard({ title, value, icon, color }: { title: string; value: string; icon: keyof typeof Feather.glyphMap; color: string }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.statCard, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
      <View style={[styles.statIcon, { backgroundColor: color + "18" }]}>
        <Feather name={icon} size={20} color={color} />
      </View>
      <ThemedText type="h3" style={{ color: theme.text, fontWeight: FontWeight.bold, marginTop: Spacing.xs }}>{value}</ThemedText>
      <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 2, textAlign: "center" }}>{title}</ThemedText>
    </View>
  );
}

// ─── Filter transactions ──────────────────────────────────────────────────────
function filterTransactions(
  transactions: DriverTransaction[],
  filter: TxFilter,
  customFrom: string,
  customTo: string,
): DriverTransaction[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const weekStart  = todayStart - 6 * 24 * 60 * 60 * 1000;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const threeMoStart = new Date(now.getFullYear(), now.getMonth() - 3, 1).getTime();

  return transactions.filter(t => {
    if (!t.timestamp) return false;
    const ts = new Date(t.timestamp).getTime();
    switch (filter) {
      case "today":    return ts >= todayStart;
      case "week":     return ts >= weekStart;
      case "month":    return ts >= monthStart;
      case "3months":  return ts >= threeMoStart;
      case "custom": {
        const from = customFrom ? new Date(customFrom).getTime() : 0;
        const to   = customTo   ? new Date(customTo).getTime() + 86400000 : Date.now();
        return ts >= from && ts <= to;
      }
      default: return true;
    }
  });
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function DriverEarningsScreen() {
  const insets       = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme }    = useTheme();
  const { phoneNumber } = useAuth();
  const settlement = useSettlement("driver");
  const handleRequestSettlement = useCallback(() => {
    Alert.alert(
      "طلب تسوية",
      `سيتم إرسال طلب تسوية بالمبلغ ${formatPrice(settlement.view?.outstanding || 0)} إلى الإدارة.`,
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

  const { settings: systemSettings } = useSystemSettings();
  const suspendThreshold = systemSettings.autoSuspendThreshold || 100000;

  const [earnings,        setEarnings]        = useState<EarningsData | null>(null);
  const [account,         setAccount]         = useState<DriverFinancialAccount | null>(null);
  const [transactions,    setTransactions]    = useState<DriverTransaction[]>([]);
  const [activeTab,       setActiveTab]       = useState<ActiveTab>("earnings");
  const [loading,         setLoading]         = useState(true);
  const [refreshing,      setRefreshing]      = useState(false);
  const [txFilter,        setTxFilter]        = useState<TxFilter>("all");
  const [customFrom,      setCustomFrom]      = useState("");
  const [customTo,        setCustomTo]        = useState("");
  const [liveSettlement,  setLiveSettlement]  = useState<{
    outstandingTotal: number;
    totalGross: number;
    totalCommission: number;
    lastSettlementAmount: number;
    totalOrders: number;
  } | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

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
    } catch (_) {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [phoneNumber]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Real-time Firestore listener on settlementLedger/driver:${phoneNumber} ─
  useEffect(() => {
    if (!phoneNumber) return;
    const ledgerDocId = `driver:${phoneNumber}`;
    try {
      const docRef = doc(db, "settlementLedger", ledgerDocId);
      const unsub = onSnapshot(docRef, (snap) => {
        if (snap.exists()) {
          const d = snap.data() as any;
          setLiveSettlement({
            outstandingTotal:     d.outstandingTotal     ?? 0,
            totalGross:           d.totalGross           ?? 0,
            totalCommission:      d.totalCommission      ?? 0,
            lastSettlementAmount: d.lastSettlementAmount ?? 0,
            totalOrders:          d.totalOrders          ?? 0,
          });
        }
      }, (_err) => {
        // Silently ignore — the REST-based account state remains the fallback
      });
      unsubscribeRef.current = unsub;
      return () => { unsub(); unsubscribeRef.current = null; };
    } catch {
      // firebase SDK not ready — gracefully ignore
    }
  }, [phoneNumber]);

  // ── Filtered transactions ──────────────────────────────────────────────────
  const filteredTx = useMemo(
    () => filterTransactions(transactions, txFilter, customFrom, customTo),
    [transactions, txFilter, customFrom, customTo]
  );

  // ── Account status ─────────────────────────────────────────────────────────
  // Prefer live Firestore data when available; fall back to REST-based account
  const amountOwed  = liveSettlement?.outstandingTotal ?? account?.amountOwed ?? 0;
  const acctStatus  = getAccountStatus(amountOwed, suspendThreshold);

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot, justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={AppColors.primary} />
      </View>
    );
  }

  // ─── Earnings tab header ───────────────────────────────────────────────────
  const EarningsHeader = (
    <View style={styles.sectionPadding}>
      {/* Total card */}
      <View style={[styles.totalCard, { backgroundColor: theme.backgroundDefault }, Shadows.md]}>
        <ThemedText type="small" style={{ color: theme.textSecondary }}>إجمالي الأرباح</ThemedText>
        <ThemedText type="h1" style={{ color: AppColors.primary, marginTop: 4 }}>
          {formatPrice(earnings?.totalEarnings || 0)}
        </ThemedText>
        <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 4 }}>
          {earnings?.totalOrders || 0} طلب مكتمل
        </ThemedText>
      </View>

      {/* Bar chart */}
      <EarningsBarChart orders={earnings?.completedOrders || []} />

      {/* Stats grid */}
      <View style={styles.statsGrid}>
        <StatCard title="أرباح اليوم"   value={formatPrice(earnings?.todayEarnings || 0)} icon="sun"         color={AppColors.warning} />
        <StatCard title="أرباح الأسبوع" value={formatPrice(earnings?.weekEarnings  || 0)} icon="calendar"    color={AppColors.info}    />
      </View>
      <View style={styles.statsGrid}>
        <StatCard title="أرباح الشهر"   value={formatPrice(earnings?.monthEarnings || 0)} icon="trending-up" color={AppColors.success}  />
        <StatCard title="طلبات الشهر"   value={String(earnings?.monthOrders || 0)}        icon="package"     color={AppColors.primary}  />
      </View>
      <View style={styles.statsGrid}>
        <StatCard title="طلبات اليوم"   value={String(earnings?.todayOrders || 0)} icon="clock" color={AppColors.warning} />
        <StatCard title="إجمالي الطلبات" value={String(earnings?.totalOrders || 0)} icon="truck" color={AppColors.info}    />
      </View>

      {(earnings?.completedOrders?.length || 0) > 0 ? (
        <ThemedText type="h4" style={[styles.sectionLabel, { color: theme.text }]}>سجل الطلبات المكتملة</ThemedText>
      ) : null}
    </View>
  );

  // ─── Wallet tab header ─────────────────────────────────────────────────────
  const WalletHeader = (
    <View style={styles.sectionPadding}>
      {/* Account status banner */}
      <View style={[styles.statusCard, { backgroundColor: acctStatus.bgColor }, Shadows.md]}>
        <View style={styles.statusIconRow}>
          <View style={{ paddingHorizontal: Spacing.lg, paddingVertical: 4, borderRadius: BorderRadius.full, backgroundColor: acctStatus.color + "25" }}>
            <ThemedText type="small" style={{ color: acctStatus.color, fontWeight: FontWeight.bold }}>{acctStatus.label}</ThemedText>
          </View>
          <Feather name={acctStatus.icon} size={22} color={acctStatus.color} />
        </View>
        <ThemedText type="h1" style={{ color: acctStatus.color, marginTop: Spacing.sm }}>
          {formatPrice(amountOwed)}
        </ThemedText>
        <ThemedText type="small" style={{ color: acctStatus.color, marginTop: 4, textAlign: "center", opacity: 0.85 }}>
          {acctStatus.sublabel}
        </ThemedText>
        {account?.lastPaymentDate ? (
          <View style={[styles.lastPaymentRow, { borderTopColor: acctStatus.color + "30" }]}>
            <Feather name="clock" size={11} color={acctStatus.color} />
            <ThemedText type="small" style={{ color: acctStatus.color, opacity: 0.75 }}>
              آخر دفعة {formatPrice(account.lastPaymentAmount)} · {new Date(account.lastPaymentDate).toLocaleDateString("ar-IQ")}
            </ThemedText>
          </View>
        ) : null}
      </View>

      {/* Debt limit progress bar — live from Firestore onSnapshot */}
      <DebtLimitBar owed={amountOwed} threshold={suspendThreshold} />

      {/* Payment ratio card */}
      {account ? <PaymentRatioCard account={account} /> : null}

      {/* Financial summary */}
      {(account || liveSettlement) ? (
        <>
          <View style={styles.statsGrid}>
            <StatCard title="إجمالي أرباح التوصيل" value={formatPrice(liveSettlement?.totalCommission ?? account?.totalEarnings ?? 0)}        icon="dollar-sign"    color={AppColors.success} />
            <StatCard title="إجمالي عمولات OnWay"  value={formatPrice(account?.totalOnwayCommission ?? 0)}                                      icon="percent"        color={AppColors.error}   />
          </View>
          <View style={styles.statsGrid}>
            <StatCard title="إجمالي المسدّد"        value={formatPrice(account?.totalPaid ?? 0)}                                                 icon="check-circle"   color={AppColors.primary}  />
            <StatCard title="حد الحجب"              value={formatPrice(suspendThreshold)}                                                         icon="alert-triangle" color={AppColors.warning}  />
          </View>
          {liveSettlement ? (
            <View style={styles.statsGrid}>
              <StatCard title="آخر رحلة"       value={formatPrice(liveSettlement.lastSettlementAmount)} icon="zap"          color={AppColors.primary} />
              <StatCard title="نقد محصّل (كلي)" value={formatPrice(liveSettlement.totalGross)}           icon="dollar-sign"  color={AppColors.info}    />
            </View>
          ) : null}
        </>
      ) : null}

      {/* Commission info */}
      <View style={[styles.commissionCard, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
        <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: Spacing.sm, marginBottom: Spacing.lg }}>
          <Feather name="percent" size={16} color={AppColors.primary} />
          <ThemedText type="h4" style={{ color: theme.text }}>نظام العمولة</ThemedText>
        </View>
        {[
          { label: "توصيل مطعم", driver: 750, onway: 250, pct: 75, icon: "shopping-bag" as const, color: AppColors.warning },
          { label: "توصيل تسويق", driver: 2000, onway: 1000, pct: 67, icon: "truck" as const, color: AppColors.info },
        ].map((item, i) => (
          <View key={i} style={{ marginBottom: i === 0 ? Spacing.md : 0 }}>
            <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: Spacing.xs }}>
              <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: Spacing.xs }}>
                <Feather name={item.icon} size={13} color={item.color} />
                <ThemedText type="body" style={{ color: theme.text, fontWeight: FontWeight.semiBold }}>{item.label}</ThemedText>
              </View>
              <View style={{ flexDirection: "row", gap: Spacing.sm }}>
                <ThemedText type="small" style={{ color: AppColors.error, fontWeight: FontWeight.semiBold }}>-{formatPrice(item.onway)} OnWay</ThemedText>
                <ThemedText type="small" style={{ color: AppColors.success, fontWeight: FontWeight.bold }}>+{formatPrice(item.driver)} سائق</ThemedText>
              </View>
            </View>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: AppColors.border, overflow: "hidden" }}>
              <View style={{ width: `${item.pct}%`, height: "100%", backgroundColor: AppColors.success, borderRadius: 4 }} />
            </View>
          </View>
        ))}
      </View>

      {/* Filter pills + label */}
      <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: Spacing.md, marginBottom: Spacing.sm }}>
        <ThemedText type="h4" style={{ color: theme.text }}>سجل المعاملات</ThemedText>
        <ThemedText type="small" style={{ color: theme.textSecondary }}>{filteredTx.length} عملية</ThemedText>
      </View>
      <FilterPills active={txFilter} onChange={setTxFilter} />

      {/* Custom date inputs */}
      {txFilter === "custom" ? (
        <View style={{ flexDirection: "row-reverse", gap: Spacing.sm, marginBottom: Spacing.md }}>
          <TextInput
            value={customFrom}
            onChangeText={setCustomFrom}
            placeholder="من (YYYY-MM-DD)"
            style={[styles.dateInput, { backgroundColor: theme.backgroundDefault, color: theme.text, borderColor: AppColors.border }]}
            placeholderTextColor={theme.textSecondary}
          />
          <TextInput
            value={customTo}
            onChangeText={setCustomTo}
            placeholder="إلى (YYYY-MM-DD)"
            style={[styles.dateInput, { backgroundColor: theme.backgroundDefault, color: theme.text, borderColor: AppColors.border }]}
            placeholderTextColor={theme.textSecondary}
          />
        </View>
      ) : null}
    </View>
  );

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <GradientBackground />

      {/* Tab bar header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.xs, backgroundColor: theme.backgroundDefault }]}>
        <View style={styles.tabBar}>
          {(
            [
              { key: "earnings",  label: "الأرباح",        icon: "trending-up"  },
              { key: "wallet",    label: "الحساب المالي",  icon: "credit-card"  },
              { key: "payments",  label: "سجل الدفعات",   icon: "check-circle" },
              { key: "report",    label: "التقرير الشهري", icon: "bar-chart-2"  },
            ] as { key: ActiveTab; label: string; icon: keyof typeof Feather.glyphMap }[]
          ).map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                style={[styles.tabItem, isActive ? [styles.tabItemActive, { borderBottomColor: AppColors.primary }] : null]}
                onPress={() => setActiveTab(tab.key)}
              >
                <Feather name={tab.icon} size={12} color={isActive ? AppColors.primary : theme.textSecondary} />
                <ThemedText style={{ fontSize: 10, color: isActive ? AppColors.primary : theme.textSecondary, fontWeight: isActive ? FontWeight.bold : FontWeight.regular }}>
                  {tab.label}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Always-visible settlement status indicator (top of screen) */}
      <SettlementStatusBar
        view={settlement.view}
        requesting={settlement.requesting}
        onRequest={handleRequestSettlement}
      />

      {/* Content */}
      {/* Payments tab ─────────────────────────────────────────────────────────── */}
      {activeTab === "payments" ? (() => {
        const paymentTx = [...transactions]
          .filter(t => t.type === "payment")
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        const totalPaid = paymentTx.reduce((s, t) => s + (t.amount || 0), 0);
        return (
          <FlatList
            data={paymentTx}
            keyExtractor={item => item.id}
            renderItem={({ item, index }) => <PaymentReceiptCard item={item} index={index} />}
            ListHeaderComponent={
              <View style={styles.sectionPadding}>
                {/* Summary card */}
                <View style={[styles.totalCard, { backgroundColor: theme.backgroundDefault }, Shadows.md]}>
                  <Feather name="check-circle" size={28} color={AppColors.success} />
                  <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: Spacing.sm }}>إجمالي الدفعات للإدارة</ThemedText>
                  <ThemedText type="h1" style={{ color: AppColors.success, marginTop: 4 }}>{formatPrice(totalPaid)}</ThemedText>
                  <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 4 }}>
                    {paymentTx.length} دفعة مسجّلة
                  </ThemedText>
                </View>
                {paymentTx.length > 0 ? (
                  <ThemedText type="h4" style={[styles.sectionLabel, { color: theme.text }]}>سجل الدفعات (الأحدث أولاً)</ThemedText>
                ) : null}
              </View>
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Feather name="check-circle" size={40} color={theme.textSecondary} />
                <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: Spacing.md }}>
                  لا توجد دفعات مسجّلة بعد
                </ThemedText>
              </View>
            }
            contentContainerStyle={{ paddingBottom: tabBarHeight + Spacing.xl }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={AppColors.primary} />}
            showsVerticalScrollIndicator={false}
          />
        );
      })() : activeTab === "earnings" ? (
        <FlatList
          data={earnings?.completedOrders || []}
          keyExtractor={item => item.id}
          renderItem={({ item }) => <OrderItem item={item} />}
          ListHeaderComponent={EarningsHeader}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="inbox" size={40} color={theme.textSecondary} />
              <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: Spacing.md }}>لا توجد طلبات مكتملة بعد</ThemedText>
            </View>
          }
          contentContainerStyle={{ paddingBottom: tabBarHeight + Spacing.xl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={AppColors.primary} />}
          showsVerticalScrollIndicator={false}
        />
      ) : activeTab === "report" ? (
        <FlatList
          data={[]}
          renderItem={() => null}
          ListHeaderComponent={<MonthlyReport earnings={earnings} transactions={transactions} />}
          contentContainerStyle={{ paddingBottom: tabBarHeight + Spacing.xl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={AppColors.primary} />}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          data={filteredTx}
          keyExtractor={item => item.id}
          renderItem={({ item, index }) => (
            <TimelineItem item={item} isLast={index === filteredTx.length - 1} />
          )}
          ListHeaderComponent={WalletHeader}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="credit-card" size={40} color={theme.textSecondary} />
              <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: Spacing.md }}>
                {txFilter !== "all" ? "لا توجد عمليات في هذه الفترة" : "لا توجد عمليات بعد"}
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

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E020",
  },
  tabBar: { flexDirection: "row-reverse" },
  tabItem: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabItemActive: { borderBottomWidth: 2 },
  sectionPadding: { padding: Spacing.lg },
  totalCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  statusCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  statusIconRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  lastPaymentRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    width: "100%",
    justifyContent: "center",
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
  ratioCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
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
  reportRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Spacing.md,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  commissionCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
  },
  dateInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    textAlign: "right",
    fontSize: 16,
  },
});
