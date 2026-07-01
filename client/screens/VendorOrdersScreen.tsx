import React, { useCallback, useState, useMemo, useRef, useEffect } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Pressable,
  ScrollView,
  Modal,
  Dimensions,
  Image,
} from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useFocusEffect } from "@react-navigation/native";
import { MaterialCommunityIcons, Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Print from "expo-print";
import { useAudioPlayer } from "expo-audio";

const alarmSound = require("../assets/sounds/alarm.mp3");

import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";
import { getApiUrl } from "@/lib/query-client";
import { useTheme } from "@/hooks/useTheme";
import { AppColors } from "@/constants/theme";

const ORANGE = AppColors.primary;
const SCREEN_W = Dimensions.get("window").width;

interface OrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  restaurant?: string;
  imageUrl?: string;
}

interface VendorOrder {
  id: string;
  customerName?: string;
  customerPhone?: string;
  phoneNumber?: string;
  items: OrderItem[];
  total: number;
  vendorSubtotal?: number;
  restaurantSubtotal?: number;
  deliveryFee?: number;
  serviceFee?: number;
  status: string;
  address?: string;
  createdAt: string;
  vendorName?: string;
  estimatedMinutes?: number;
  driverName?: string;
  driverPhone?: string;
  paymentMethod?: string;
  notes?: string;
  vendorStatusAt_confirmed?: string;
  vendorStatusAt_preparing?: string;
  vendorStatusAt_ready?: string;
  vendorStatusAt_cancelled?: string;
}

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_CFG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  pending:    { label: "طلب جديد",      color: AppColors.warning, bg: AppColors.warningLight,  icon: "bell-ring" },
  confirmed:  { label: "مؤكد",          color: AppColors.info, bg: AppColors.infoLight,  icon: "check-circle" },
  preparing:  { label: "قيد التحضير",  color: AppColors.statusPurple, bg: AppColors.vendorPurpleLight,  icon: "chef-hat" },
  ready:      { label: "جاهز",          color: AppColors.success, bg: AppColors.successLight,  icon: "package-variant-closed-check" },
  picked_up:  { label: "استلمه السائق", color: AppColors.statusCyan, bg: AppColors.infoLight,  icon: "moped" },
  delivering: { label: "في الطريق",     color: AppColors.info, bg: AppColors.infoLight,  icon: "navigation" },
  delivered:  { label: "تم التوصيل",   color: AppColors.success, bg: AppColors.successLight,  icon: "check-all" },
  cancelled:  { label: "ملغي",          color: AppColors.error, bg: AppColors.errorLight,  icon: "close-circle" },
};

// ── Tab definitions ────────────────────────────────────────────────────────────
const TABS = [
  { key: "new",      label: "جديد",    statuses: ["pending"],           icon: "bell-ring",             color: AppColors.warning },
  { key: "active",   label: "تحضير",   statuses: ["confirmed","preparing"], icon: "chef-hat",           color: AppColors.statusPurple },
  { key: "ready",    label: "جاهز",    statuses: ["ready","picked_up"],  icon: "package-variant-closed-check", color: AppColors.success },
  { key: "done",     label: "مكتمل",   statuses: ["delivered","delivering","cancelled"], icon: "check-all", color: AppColors.gray500 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function relativeTime(iso: string): string {
  if (!iso) return "";
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "الآن";
    if (mins < 60) return `منذ ${mins} دقيقة`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `منذ ${hrs} ساعة`;
    return `منذ ${Math.floor(hrs / 24)} يوم`;
  } catch { return iso; }
}

function fullDate(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("ar-IQ", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

// ── Action buttons per status ─────────────────────────────────────────────────
type Action = { label: string; nextStatus: string; color: string; bg: string; icon: string; primary?: boolean };

function getActions(status: string): Action[] {
  switch (status) {
    case "pending":
      return [
        { label: "قبول الطلب",   nextStatus: "confirmed", color: AppColors.white,     bg: AppColors.success, icon: "check",     primary: true },
        { label: "رفض",          nextStatus: "cancelled", color: AppColors.error,  bg: AppColors.errorLight, icon: "close",     primary: false },
      ];
    case "confirmed":
      return [
        { label: "بدء التحضير",  nextStatus: "preparing", color: AppColors.white,     bg: ORANGE,    icon: "chef-hat",  primary: true },
        { label: "إلغاء",        nextStatus: "cancelled", color: AppColors.error,  bg: AppColors.errorLight, icon: "close",     primary: false },
      ];
    case "preparing":
      return [
        { label: "الطلب جاهز",  nextStatus: "ready",     color: AppColors.white,     bg: AppColors.success, icon: "package-variant-closed-check", primary: true },
      ];
    default:
      return [];
  }
}

// ── Receipt HTML builder ───────────────────────────────────────────────────────
function buildReceiptHTML(order: VendorOrder): string {
  const orderNum = order.id.slice(-8).toUpperCase();
  const storeName = order.vendorName ?? "المتجر";
  const customerName = order.customerName ?? order.customerPhone ?? order.phoneNumber ?? "—";
  const customerPhone = order.customerPhone ?? order.phoneNumber ?? "—";
  const address = order.address ?? "—";
  const paymentLabel =
    order.paymentMethod === "cash" ? "دفع نقدي" :
    order.paymentMethod === "card" ? "بطاقة بنكية" :
    (order.paymentMethod ?? "—");
  const createdDate = (() => {
    try { return new Date(order.createdAt).toLocaleDateString("ar-IQ", { year: "numeric", month: "long", day: "numeric" }); }
    catch { return order.createdAt; }
  })();
  const createdTime = (() => {
    try { return new Date(order.createdAt).toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit" }); }
    catch { return ""; }
  })();
  const vendorTotal = order.vendorSubtotal ?? order.restaurantSubtotal ?? order.total;
  const itemsHTML = (order.items ?? []).map((item) => `
    <tr>
      <td style="text-align:right;padding:7px 4px;border-bottom:1px dashed #ddd;font-size:13px;">${item.name}</td>
      <td style="text-align:center;padding:7px 4px;border-bottom:1px dashed #ddd;font-size:13px;color:#555;">${item.quantity}</td>
      <td style="text-align:left;padding:7px 4px;border-bottom:1px dashed #ddd;font-size:13px;white-space:nowrap;">${((item.price || 0) * (item.quantity || 1)).toLocaleString("ar-IQ")} د.ع</td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;max-width:340px;margin:0 auto;padding:18px;color:#1a1a1a;background:#fff;}
  .header{text-align:center;padding-bottom:12px;}
  .app-name{font-size:32px;font-weight:900;color:#E86520;letter-spacing:3px;}
  .app-sub{font-size:12px;color:#999;margin-top:3px;}
  .store-name{text-align:center;font-size:17px;font-weight:700;margin:6px 0 2px;}
  .divider{border:none;border-top:1px dashed #ccc;margin:10px 0;}
  .divider-bold{border:none;border-top:2px solid #1a1a1a;margin:12px 0;}
  .row{display:flex;justify-content:space-between;align-items:flex-start;margin:6px 0;font-size:13px;gap:8px;}
  .row-label{color:#666;flex-shrink:0;}
  .row-value{font-weight:600;text-align:left;word-break:break-word;}
  .section-title{font-size:12px;font-weight:700;background:#f5f5f5;padding:5px 10px;border-radius:4px;margin:10px 0;text-align:center;color:#444;letter-spacing:1px;}
  table{width:100%;border-collapse:collapse;}
  th{font-size:11px;color:#777;padding:5px 4px;border-bottom:2px solid #333;font-weight:600;}
  th:first-child{text-align:right;}th:nth-child(2){text-align:center;}th:last-child{text-align:left;}
  .total-row{display:flex;justify-content:space-between;padding:5px 0;font-size:13px;}
  .grand-total{font-size:16px;font-weight:900;color:#E86520;padding-top:3px;}
  .payment-row{display:flex;justify-content:space-between;padding:5px 0;font-size:13px;}
  .notes-box{background:#fff9f0;border:1px dashed #E86520;border-radius:6px;padding:8px 10px;margin:6px 0;font-size:12px;color:#555;}
  .footer{text-align:center;margin-top:16px;padding-top:12px;border-top:2px solid #1a1a1a;}
  .footer-main{font-size:15px;font-weight:700;color:#E86520;margin-bottom:4px;}
  .footer-sub{font-size:12px;color:#888;}
  @media print{body{max-width:100%;padding:10px;}}
</style>
</head>
<body>
<div class="header">
  <div class="app-name">OnWay</div>
  <div class="app-sub">خدمة التوصيل السريع</div>
</div>
<div class="store-name">${storeName}</div>
<hr class="divider-bold">
<div class="row"><span class="row-label">رقم الطلب</span><span class="row-value">#${orderNum}</span></div>
<div class="row"><span class="row-label">التاريخ</span><span class="row-value">${createdDate}</span></div>
<div class="row"><span class="row-label">الوقت</span><span class="row-value">${createdTime}</span></div>
<hr class="divider">
<div class="section-title">بيانات العميل</div>
<div class="row"><span class="row-label">الاسم</span><span class="row-value">${customerName}</span></div>
<div class="row"><span class="row-label">الهاتف</span><span class="row-value">${customerPhone}</span></div>
<div class="row"><span class="row-label">عنوان التوصيل</span><span class="row-value" style="max-width:60%;text-align:left;">${address}</span></div>
<hr class="divider">
<div class="section-title">تفاصيل الطلب</div>
<table>
  <thead>
    <tr>
      <th>الصنف</th>
      <th>الكمية</th>
      <th>السعر</th>
    </tr>
  </thead>
  <tbody>${itemsHTML}</tbody>
</table>
<hr class="divider">
<div class="total-row"><span>إجمالي المتجر</span><span>${vendorTotal.toLocaleString("ar-IQ")} د.ع</span></div>
${order.deliveryFee !== undefined && order.deliveryFee > 0 ? `<div class="total-row"><span>رسوم التوصيل</span><span>${order.deliveryFee.toLocaleString("ar-IQ")} د.ع</span></div>` : ""}
${order.serviceFee !== undefined && order.serviceFee > 0 ? `<div class="total-row"><span>رسوم الخدمة</span><span>${order.serviceFee.toLocaleString("ar-IQ")} د.ع</span></div>` : ""}
<div class="total-row grand-total"><span>الإجمالي النهائي</span><span>${order.total.toLocaleString("ar-IQ")} د.ع</span></div>
<hr class="divider">
<div class="payment-row"><span style="color:#666;">طريقة الدفع</span><span style="font-weight:600;">${paymentLabel}</span></div>
${order.notes ? `<div class="notes-box"><strong>ملاحظات:</strong> ${order.notes}</div>` : ""}
<div class="footer">
  <div class="footer-main">شكراً لاستخدامكم OnWay</div>
  <div class="footer-sub">نتمنى لكم تجربة توصيل ممتازة</div>
</div>
</body>
</html>`;
}

// ── Live-ticking clock hook (updates every 60 s) ──────────────────────────────
function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// ── Timer Badge for pending orders ────────────────────────────────────────────
function TimerBadge({ createdAt }: { createdAt: string }) {
  const now = useMinuteClock();
  const mins = Math.floor((now - new Date(createdAt).getTime()) / 60000);
  const urgent = mins >= 5;
  return (
    <View style={[timerStyles.badge, { backgroundColor: urgent ? AppColors.errorLight : AppColors.warningLight }]}>
      <MaterialCommunityIcons name="timer-outline" size={13} color={urgent ? AppColors.error : AppColors.warning} />
      <ThemedText style={[timerStyles.text, { color: urgent ? AppColors.error : AppColors.warning }]}>
        {mins < 1 ? "أقل من دقيقة" : `${mins} دقيقة`}
      </ThemedText>
    </View>
  );
}
const timerStyles = StyleSheet.create({
  badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  text: { fontFamily: "Cairo_700Bold", fontSize: 11 },
});

const etaBadgeStyles = StyleSheet.create({
  badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: AppColors.successLight },
  text: { fontFamily: "Cairo_700Bold", fontSize: 11, color: AppColors.success },
});

// ── Default per-status urgency thresholds (minutes) — overridden by server config ──
const DEFAULT_URGENCY_THRESHOLD: Record<string, number> = {
  confirmed: 10,
  preparing: 25,
  ready:     15,
};

// Labels shown in the status timer badge for each status
const STATUS_TIMER_LABEL: Record<string, string> = {
  confirmed: "مؤكد منذ",
  preparing: "في التحضير منذ",
  ready:     "جاهز منذ",
};

// ── Status-specific elapsed timer badge ──────────────────────────────────────
function StatusTimerBadge({
  status,
  statusAt,
  thresholds,
}: {
  status: string;
  statusAt: string;
  thresholds: Record<string, number>;
}) {
  const now = useMinuteClock();
  if (!statusAt) return null;
  const label = STATUS_TIMER_LABEL[status];
  if (!label) return null;

  const mins = Math.floor((now - new Date(statusAt).getTime()) / 60000);
  const threshold = thresholds[status] ?? DEFAULT_URGENCY_THRESHOLD[status] ?? 15;
  const urgent = mins >= threshold;

  const normalColor = AppColors.statusPurple;
  const normalBg = AppColors.vendorPurpleLight;

  return (
    <View style={[statusTimerStyles.badge, { backgroundColor: urgent ? AppColors.errorLight : normalBg }]}>
      <MaterialCommunityIcons name="clock-alert-outline" size={13} color={urgent ? AppColors.error : normalColor} />
      <ThemedText style={[statusTimerStyles.text, { color: urgent ? AppColors.error : normalColor }]}>
        {label} {mins < 1 ? "أقل من دقيقة" : `${mins} دقيقة`}
      </ThemedText>
    </View>
  );
}
const statusTimerStyles = StyleSheet.create({
  badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  text: { fontFamily: "Cairo_700Bold", fontSize: 11 },
});

// ── Progress steps ────────────────────────────────────────────────────────────
const STEPS = ["pending", "confirmed", "preparing", "ready", "delivering", "delivered"];
function ProgressBar({ status }: { status: string }) {
  const idx = STEPS.indexOf(status);
  if (idx < 0 || status === "cancelled") return null;
  return (
    <View style={progressStyles.row}>
      {STEPS.slice(0, 6).map((s, i) => {
        const done = i <= idx;
        return (
          <React.Fragment key={s}>
            <View style={[progressStyles.dot, done ? progressStyles.dotActive : progressStyles.dotInactive]}>
              {done ? <MaterialCommunityIcons name="check" size={8} color={AppColors.white} /> : null}
            </View>
            {i < 5 ? <View style={[progressStyles.line, done && i < idx ? progressStyles.lineActive : {}]} /> : null}
          </React.Fragment>
        );
      })}
    </View>
  );
}
const progressStyles = StyleSheet.create({
  row: { flexDirection: "row-reverse", alignItems: "center", marginBottom: 12 },
  dot: { width: 16, height: 16, borderRadius: 8, justifyContent: "center", alignItems: "center" },
  dotActive: { backgroundColor: ORANGE },
  dotInactive: { backgroundColor: AppColors.divider },
  line: { flex: 1, height: 2, backgroundColor: AppColors.divider },
  lineActive: { backgroundColor: ORANGE },
});

// ── Order Card ─────────────────────────────────────────────────────────────────
function OrderCard({
  order,
  onUpdateStatus,
  onPrint,
  updatingId,
  urgencyThresholds,
}: {
  order: VendorOrder;
  onUpdateStatus: (id: string, status: string) => void;
  onPrint: (order: VendorOrder) => void;
  updatingId: string | null;
  urgencyThresholds: Record<string, number>;
}) {
  const { theme } = useTheme();
  const [expanded, setExpanded] = useState(true);
  const cfg = STATUS_CFG[order.status] ?? { label: order.status, color: AppColors.gray500, bg: AppColors.gray100, icon: "help" };
  const actions = getActions(order.status);
  const vendorTotal = order.vendorSubtotal ?? order.restaurantSubtotal ?? order.total;
  const displayName = order.customerName || order.customerPhone || order.phoneNumber || "عميل";
  const isUpdating = updatingId === order.id;

  const statusAtKey = `vendorStatusAt_${order.status}` as keyof VendorOrder;
  const currentStatusAt = (order[statusAtKey] as string | undefined) ?? "";

  return (
    <View style={[
      cardStyles.card,
      { backgroundColor: theme.backgroundDefault },
      order.status === "pending" && cardStyles.cardPending,
    ]}>
      {/* ── Card Header ── */}
      <View style={[cardStyles.header, { borderLeftColor: cfg.color, borderLeftWidth: 4 }]}>
        <View style={{ flex: 1 }}>
          <View style={cardStyles.headerTop}>
            <ThemedText style={[cardStyles.orderId, { color: theme.text }]}>
              #{order.id.slice(-8).toUpperCase()}
            </ThemedText>
            <View style={[cardStyles.statusBadge, { backgroundColor: cfg.bg }]}>
              <MaterialCommunityIcons name={cfg.icon as any} size={13} color={cfg.color} />
              <ThemedText style={[cardStyles.statusText, { color: cfg.color }]}>{cfg.label}</ThemedText>
            </View>
          </View>
          <View style={cardStyles.headerMeta}>
            <ThemedText style={cardStyles.timeText}>{relativeTime(order.createdAt)}</ThemedText>
            {order.status === "pending" ? <TimerBadge createdAt={order.createdAt} /> : null}
            {currentStatusAt.length > 0 ? (
              <StatusTimerBadge status={order.status} statusAt={currentStatusAt} thresholds={urgencyThresholds} />
            ) : null}
            {order.estimatedMinutes && order.estimatedMinutes > 0 ? (
              <View style={etaBadgeStyles.badge}>
                <MaterialCommunityIcons name="clock-fast" size={13} color={AppColors.success} />
                <ThemedText style={etaBadgeStyles.text}>{order.estimatedMinutes} دقيقة</ThemedText>
              </View>
            ) : null}
            {order.paymentMethod ? (
              <View style={cardStyles.paymentBadge}>
                <MaterialCommunityIcons
                  name={order.paymentMethod === "cash" ? "cash" : "credit-card-outline"}
                  size={13}
                  color={AppColors.gray500}
                />
                <ThemedText style={cardStyles.paymentText}>
                  {order.paymentMethod === "cash" ? "كاش" : order.paymentMethod === "card" ? "بطاقة" : order.paymentMethod}
                </ThemedText>
              </View>
            ) : null}
          </View>
        </View>
        <Pressable onPress={() => setExpanded(!expanded)} style={cardStyles.expandBtn}>
          <MaterialCommunityIcons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={20}
            color={theme.textSecondary}
          />
        </Pressable>
      </View>

      {expanded ? (
        <>
          {/* Progress bar */}
          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            <ProgressBar status={order.status} />
          </View>

          {/* Customer info */}
          <View style={cardStyles.customerSection}>
            <View style={[cardStyles.customerCard, { backgroundColor: ORANGE + "08", borderColor: ORANGE + "22" }]}>
              <View style={[cardStyles.customerAvatar, { backgroundColor: ORANGE + "18" }]}>
                <MaterialCommunityIcons name="account" size={20} color={ORANGE} />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={[cardStyles.customerName, { color: theme.text }]}>{displayName}</ThemedText>
                {(order.customerPhone || order.phoneNumber) ? (
                  <ThemedText style={[cardStyles.customerPhone, { color: theme.textSecondary }]}>
                    {order.customerPhone || order.phoneNumber}
                  </ThemedText>
                ) : null}
              </View>
              <MaterialCommunityIcons name="account-circle" size={14} color={ORANGE} style={{ opacity: 0.5 }} />
            </View>
            {order.address ? (
              <View style={cardStyles.infoRow}>
                <MaterialCommunityIcons name="map-marker-outline" size={15} color={theme.textSecondary} />
                <ThemedText style={[cardStyles.infoText, { color: theme.textSecondary }]} numberOfLines={2}>
                  {order.address}
                </ThemedText>
              </View>
            ) : null}
            <View style={cardStyles.infoRow}>
              <MaterialCommunityIcons name="clock-outline" size={15} color={theme.textSecondary} />
              <ThemedText style={[cardStyles.infoText, { color: theme.textSecondary }]}>{fullDate(order.createdAt)}</ThemedText>
            </View>
            {order.notes ? (
              <View style={[cardStyles.notesRow, { backgroundColor: AppColors.warningLight, borderColor: AppColors.warning }]}>
                <MaterialCommunityIcons name="note-text-outline" size={14} color={AppColors.warning} />
                <ThemedText style={cardStyles.notesText} numberOfLines={3}>{order.notes}</ThemedText>
              </View>
            ) : null}
          </View>

          <View style={[cardStyles.divider, { backgroundColor: theme.border ?? AppColors.gray100 }]} />

          {/* Items with images */}
          <View style={cardStyles.itemsSection}>
            <ThemedText style={[cardStyles.sectionLabel, { color: theme.text }]}>
              المنتجات المطلوبة ({order.items?.length ?? 0})
            </ThemedText>
            {Array.isArray(order.items) && order.items.map((item, i) => (
              <View key={i} style={[cardStyles.itemRow, { borderBottomColor: theme.border ?? AppColors.gray100 }]}>
                {/* Product image / placeholder */}
                {item.imageUrl ? (
                  <Image
                    source={{ uri: item.imageUrl }}
                    style={cardStyles.itemImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[cardStyles.itemImagePlaceholder, { backgroundColor: ORANGE + "12" }]}>
                    <MaterialCommunityIcons name="food" size={18} color={ORANGE} style={{ opacity: 0.6 }} />
                  </View>
                )}
                {/* Qty badge */}
                <View style={[cardStyles.itemQtyBadge, { backgroundColor: ORANGE + "15" }]}>
                  <ThemedText style={[cardStyles.itemQtyText, { color: ORANGE }]}>×{item.quantity}</ThemedText>
                </View>
                {/* Name */}
                <ThemedText style={[cardStyles.itemName, { color: theme.text }]} numberOfLines={2}>
                  {item.name}
                </ThemedText>
                {/* Price */}
                <ThemedText style={[cardStyles.itemPrice, { color: ORANGE }]}>
                  {((item.price || 0) * (item.quantity || 1)).toLocaleString("ar-IQ")}
                  {"\n"}
                  <ThemedText style={{ fontSize: 10, color: theme.textSecondary }}>د.ع</ThemedText>
                </ThemedText>
              </View>
            ))}
          </View>

          {/* Cost breakdown */}
          <View style={[cardStyles.breakdownBox, { backgroundColor: ORANGE + "06", borderColor: ORANGE + "20" }]}>
            {/* Vendor subtotal */}
            <View style={cardStyles.breakdownRow}>
              <MaterialCommunityIcons name="store-outline" size={14} color={ORANGE} />
              <ThemedText style={[cardStyles.breakdownLabel, { color: theme.text }]}>إجمالي المتجر</ThemedText>
              <ThemedText style={[cardStyles.breakdownAmount, { color: ORANGE }]}>
                {vendorTotal.toLocaleString("ar-IQ")} د.ع
              </ThemedText>
            </View>
            {/* Delivery fee */}
            {order.deliveryFee !== undefined && order.deliveryFee > 0 ? (
              <View style={cardStyles.breakdownRow}>
                <MaterialCommunityIcons name="moped-outline" size={14} color={theme.textSecondary} />
                <ThemedText style={[cardStyles.breakdownLabel, { color: theme.textSecondary }]}>رسوم التوصيل</ThemedText>
                <ThemedText style={[cardStyles.breakdownAmount, { color: theme.textSecondary }]}>
                  {(order.deliveryFee).toLocaleString("ar-IQ")} د.ع
                </ThemedText>
              </View>
            ) : null}
            {/* Service fee */}
            {order.serviceFee !== undefined && order.serviceFee > 0 ? (
              <View style={cardStyles.breakdownRow}>
                <MaterialCommunityIcons name="shield-check-outline" size={14} color={AppColors.gray500} />
                <View style={{ flex: 1 }}>
                  <ThemedText style={[cardStyles.breakdownLabel, { color: AppColors.gray500 }]}>رسوم الخدمة</ThemedText>
                  <ThemedText style={cardStyles.breakdownNote}>تذهب للتطبيق</ThemedText>
                </View>
                <ThemedText style={[cardStyles.breakdownAmount, { color: AppColors.gray500 }]}>
                  {(order.serviceFee).toLocaleString("ar-IQ")} د.ع
                </ThemedText>
              </View>
            ) : null}
            {/* Divider + grand total */}
            {(order.deliveryFee !== undefined && order.deliveryFee > 0) || (order.serviceFee !== undefined && order.serviceFee > 0) ? (
              <>
                <View style={[cardStyles.breakdownDivider, { backgroundColor: ORANGE + "25" }]} />
                <View style={cardStyles.breakdownRow}>
                  <MaterialCommunityIcons name="cash-multiple" size={14} color={ORANGE} />
                  <ThemedText style={[cardStyles.breakdownLabel, { color: theme.text, fontFamily: "Cairo_700Bold" }]}>إجمالي الزبون</ThemedText>
                  <ThemedText style={[cardStyles.breakdownAmount, { color: ORANGE, fontFamily: "Cairo_700Bold", fontSize: 15 }]}>
                    {(order.total).toLocaleString("ar-IQ")} د.ع
                  </ThemedText>
                </View>
              </>
            ) : null}
          </View>

          {/* Driver info section */}
          {order.status === "ready" ? (
            <View style={[cardStyles.driverBanner, { backgroundColor: AppColors.infoLight }]}>
              <MaterialCommunityIcons name="moped" size={20} color={AppColors.statusCyan} />
              <View style={{ flex: 1 }}>
                <ThemedText style={[cardStyles.driverBannerText, { color: AppColors.statusCyan }]}>
                  في انتظار السائق لاستلام الطلب
                </ThemedText>
              </View>
            </View>
          ) : (order.status === "picked_up" || order.status === "delivering") && order.driverName ? (
            <View style={[cardStyles.driverCard, { backgroundColor: AppColors.infoLight, borderColor: AppColors.infoLight }]}>
              <View style={[cardStyles.driverAvatar, { backgroundColor: AppColors.statusCyan }]}>
                <MaterialCommunityIcons name="moped" size={18} color={AppColors.white} />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={[cardStyles.driverName, { color: AppColors.info }]}>
                  {order.driverName}
                </ThemedText>
                <ThemedText style={[cardStyles.driverSub, { color: AppColors.statusCyan }]}>
                  {order.status === "picked_up" ? "استلم الطلب · في الطريق للزبون" : "في الطريق إلى الزبون"}
                </ThemedText>
                {order.driverPhone ? (
                  <ThemedText style={[cardStyles.driverSub, { color: AppColors.gray500, marginTop: 1 }]}>
                    {order.driverPhone}
                  </ThemedText>
                ) : null}
              </View>
              <MaterialCommunityIcons name="navigation" size={18} color={AppColors.statusCyan} />
            </View>
          ) : (order.status === "picked_up" || order.status === "delivering") ? (
            <View style={[cardStyles.driverBanner, { backgroundColor: AppColors.infoLight }]}>
              <MaterialCommunityIcons name="navigation" size={18} color={AppColors.info} />
              <ThemedText style={[cardStyles.driverBannerText, { color: AppColors.info }]}>
                السائق في الطريق إلى العميل
              </ThemedText>
            </View>
          ) : null}

          {/* Action buttons */}
          {actions.length > 0 ? (
            <View style={cardStyles.actionsRow}>
              {actions.map((a) => (
                <Pressable
                  key={a.nextStatus}
                  style={[
                    cardStyles.actionBtn,
                    a.primary ? cardStyles.actionBtnPrimary : cardStyles.actionBtnSecondary,
                    { backgroundColor: a.bg },
                    isUpdating && { opacity: 0.6 },
                  ]}
                  onPress={() => {
                    if (isUpdating) return;
                    Haptics.impactAsync(a.primary ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
                    onUpdateStatus(order.id, a.nextStatus);
                  }}
                  disabled={isUpdating}
                  testID={`btn-order-${a.nextStatus}-${order.id}`}
                >
                  {isUpdating && a.primary ? (
                    <ActivityIndicator size="small" color={a.color} />
                  ) : (
                    <MaterialCommunityIcons name={a.icon as any} size={16} color={a.color} />
                  )}
                  <ThemedText style={[cardStyles.actionBtnText, { color: a.color }]}>
                    {a.label}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          ) : null}

          {/* Print button — visible for all accepted orders */}
          {order.status !== "pending" && order.status !== "cancelled" ? (
            <Pressable
              style={cardStyles.printBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onPrint(order);
              }}
              testID={`btn-print-${order.id}`}
            >
              <MaterialCommunityIcons name="printer-outline" size={16} color={AppColors.gray500} />
              <ThemedText style={cardStyles.printBtnText}>طباعة الوصل</ThemedText>
            </Pressable>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

// ── ETA quick-pick options ─────────────────────────────────────────────────────
const ETA_OPTIONS = [15, 30, 45, 60];

// ── Accept with ETA modal ──────────────────────────────────────────────────────
function ETAModal({
  visible,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  onConfirm: (estimatedMinutes: number | undefined) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);

  const handleConfirm = () => {
    onConfirm(selected ?? undefined);
    setSelected(null);
  };

  const handleCancel = () => {
    setSelected(null);
    onCancel();
  };

  return (
    <Modal transparent visible={visible} animationType="fade">
      <View style={modalStyles.overlay}>
        <View style={modalStyles.box}>
          <MaterialCommunityIcons name="clock-outline" size={44} color={AppColors.success} style={{ alignSelf: "center" }} />
          <ThemedText style={modalStyles.title}>قبول الطلب</ThemedText>
          <ThemedText style={modalStyles.subtitle}>كم تحتاج من الوقت لتحضير هذا الطلب؟</ThemedText>
          <View style={etaStyles.optionRow}>
            {ETA_OPTIONS.map((mins) => {
              const isSelected = selected === mins;
              return (
                <Pressable
                  key={mins}
                  style={[etaStyles.option, isSelected && etaStyles.optionSelected]}
                  onPress={() => setSelected(isSelected ? null : mins)}
                  testID={`eta-option-${mins}`}
                >
                  <ThemedText style={[etaStyles.optionText, isSelected && etaStyles.optionTextSelected]}>
                    {mins}
                  </ThemedText>
                  <ThemedText style={[etaStyles.optionUnit, isSelected && etaStyles.optionTextSelected]}>
                    د
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
          <View style={modalStyles.btns}>
            <Pressable
              style={[modalStyles.btn, { backgroundColor: AppColors.success }]}
              onPress={handleConfirm}
              testID="btn-eta-confirm"
            >
              <ThemedText style={modalStyles.btnText}>
                {selected ? `قبول (${selected} دقيقة)` : "قبول بدون تحديد وقت"}
              </ThemedText>
            </Pressable>
            <Pressable style={[modalStyles.btn, { backgroundColor: AppColors.gray100 }]} onPress={handleCancel} testID="btn-eta-cancel">
              <ThemedText style={[modalStyles.btnText, { color: AppColors.gray700 }]}>تراجع</ThemedText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const etaStyles = StyleSheet.create({
  optionRow: { flexDirection: "row-reverse", gap: 8, justifyContent: "center", flexWrap: "wrap", marginVertical: 4 },
  option: {
    flexDirection: "row", alignItems: "baseline", gap: 2,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12,
    backgroundColor: AppColors.gray100, borderWidth: 2, borderColor: "transparent",
  },
  optionSelected: { backgroundColor: AppColors.successLight, borderColor: AppColors.success },
  optionText: { fontFamily: "Cairo_700Bold", fontSize: 18, color: AppColors.gray700 },
  optionTextSelected: { color: AppColors.success },
  optionUnit: { fontFamily: "Cairo_400Regular", fontSize: 12, color: AppColors.gray500 },
});

// ── Confirm cancel modal ───────────────────────────────────────────────────────
function CancelModal({
  visible,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal transparent visible={visible} animationType="fade">
      <View style={modalStyles.overlay}>
        <View style={modalStyles.box}>
          <MaterialCommunityIcons name="alert-circle-outline" size={48} color={AppColors.error} style={{ alignSelf: "center" }} />
          <ThemedText style={modalStyles.title}>رفض الطلب؟</ThemedText>
          <ThemedText style={modalStyles.subtitle}>سيتم إلغاء هذا الطلب وإشعار الزبون.</ThemedText>
          <View style={modalStyles.btns}>
            <Pressable style={[modalStyles.btn, { backgroundColor: AppColors.error }]} onPress={onConfirm}>
              <ThemedText style={modalStyles.btnText}>نعم، إلغاء الطلب</ThemedText>
            </Pressable>
            <Pressable style={[modalStyles.btn, { backgroundColor: AppColors.gray100 }]} onPress={onCancel}>
              <ThemedText style={[modalStyles.btnText, { color: AppColors.gray700 }]}>تراجع</ThemedText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function VendorOrdersScreen() {
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { vendorToken } = useAuth();
  const { theme } = useTheme();
  const alarmPlayer = useAudioPlayer(alarmSound);

  const [orders, setOrders] = useState<VendorOrder[]>([]);
  const [urgencyThresholds, setUrgencyThresholds] = useState<Record<string, number>>(DEFAULT_URGENCY_THRESHOLD);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState("new");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [etaTarget, setEtaTarget] = useState<string | null>(null);
  const [newArrived, setNewArrived] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const prevNewCount = useRef(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isFocused = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (!vendorToken) return;
    if (!silent) setLoading(true);
    try {
      const res = await fetch(new URL("/api/vendor/orders", getApiUrl()).toString(), {
        headers: { Authorization: `Bearer ${vendorToken}` },
      });
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      const incoming: VendorOrder[] = data.orders ?? [];
      const newPending = incoming.filter((o) => o.status === "pending").length;
      if (silent && newPending > prevNewCount.current) {
        setNewArrived(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        try {
          alarmPlayer.seekTo(0);
          alarmPlayer.play();
        } catch (_) {}
      }
      prevNewCount.current = newPending;
      setOrders(incoming);
    } catch {} finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [vendorToken]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(new URL("/api/settings/urgency-thresholds", getApiUrl()).toString());
        if (res.ok) {
          const data = await res.json();
          setUrgencyThresholds({
            confirmed: data.confirmed ?? DEFAULT_URGENCY_THRESHOLD.confirmed,
            preparing: data.preparing ?? DEFAULT_URGENCY_THRESHOLD.preparing,
            ready: data.ready ?? DEFAULT_URGENCY_THRESHOLD.ready,
          });
        }
      } catch (_) {}
    })();
  }, []);

  useFocusEffect(useCallback(() => {
    isFocused.current = true;
    load();
    pollRef.current = setInterval(() => { if (isFocused.current) load(true); }, 30_000);
    return () => {
      isFocused.current = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [load]));

  const handleRefresh = () => {
    setRefreshing(true);
    setNewArrived(false);
    load(true);
  };

  const updateStatus = useCallback(async (orderId: string, newStatus: string, estimatedMinutes?: number) => {
    if (!vendorToken) return;
    setUpdatingId(orderId);
    setUpdateError(null);
    try {
      const body: Record<string, any> = { status: newStatus };
      if (newStatus === "confirmed" && estimatedMinutes && estimatedMinutes > 0) {
        body.estimatedMinutes = estimatedMinutes;
      }
      const res = await fetch(
        new URL(`/api/vendor/orders/${orderId}/status`, getApiUrl()).toString(),
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${vendorToken}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      if (res.ok) {
        const nowIso = new Date().toISOString();
        setOrders((prev) =>
          prev.map((o) =>
            o.id === orderId
              ? {
                  ...o,
                  status: newStatus,
                  [`vendorStatusAt_${newStatus}`]: nowIso,
                  ...(estimatedMinutes ? { estimatedMinutes } : {}),
                }
              : o
          )
        );
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        const errBody = await res.json().catch(() => ({}));
        const msg = errBody?.error ?? "تعذّر تحديث حالة الطلب";
        setUpdateError(msg);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setTimeout(() => setUpdateError(null), 4000);
      }
    } catch {
      setUpdateError("تعذّر الاتصال بالخادم");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setTimeout(() => setUpdateError(null), 4000);
    } finally {
      setUpdatingId(null);
    }
  }, [vendorToken]);

  const handleAction = useCallback((orderId: string, nextStatus: string) => {
    if (nextStatus === "cancelled") {
      setCancelTarget(orderId);
    } else if (nextStatus === "confirmed") {
      setEtaTarget(orderId);
    } else {
      updateStatus(orderId, nextStatus);
    }
  }, [updateStatus]);

  const handlePrint = useCallback(async (order: VendorOrder) => {
    try {
      const html = buildReceiptHTML(order);
      await Print.printAsync({ html });
    } catch (_) {}
  }, []);

  const tabDef = TABS.find((t) => t.key === activeTab)!;
  const filtered = useMemo(
    () => orders.filter((o) => tabDef.statuses.includes(o.status)),
    [orders, activeTab, tabDef]
  );

  const tabCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of TABS) {
      m[t.key] = orders.filter((o) => t.statuses.includes(o.status)).length;
    }
    return m;
  }, [orders]);

  return (
    <View style={{ flex: 1 }}>
      {/* ── Tab bar ── */}
      <View style={[tabStyles.bar, {
        paddingTop: headerHeight,
        backgroundColor: theme.backgroundDefault,
        borderBottomColor: theme.border ?? AppColors.gray100,
      }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={tabStyles.tabRow}
        >
          {TABS.map((t) => {
            const active = activeTab === t.key;
            const count = tabCounts[t.key] ?? 0;
            return (
              <Pressable
                key={t.key}
                style={[
                  tabStyles.tab,
                  active ? { borderBottomColor: t.color, borderBottomWidth: 2.5 } : {},
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setActiveTab(t.key);
                }}
                testID={`tab-vendor-orders-${t.key}`}
              >
                <MaterialCommunityIcons
                  name={t.icon as any}
                  size={18}
                  color={active ? t.color : (theme.textSecondary ?? AppColors.gray400)}
                />
                <ThemedText style={[tabStyles.tabLabel, { color: active ? t.color : (theme.textSecondary ?? AppColors.gray400) }]}>
                  {t.label}
                </ThemedText>
                {count > 0 ? (
                  <View style={[tabStyles.badge, { backgroundColor: t.key === "new" && count > 0 ? AppColors.error : t.color }]}>
                    <ThemedText style={tabStyles.badgeText}>{count > 9 ? "9+" : count}</ThemedText>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* ── New order banner ── */}
      {newArrived ? (
        <Pressable
          style={bannerStyles.banner}
          onPress={() => { setActiveTab("new"); setNewArrived(false); }}
        >
          <MaterialCommunityIcons name="bell-ring" size={18} color={AppColors.white} />
          <ThemedText style={bannerStyles.text}>وصل طلب جديد! اضغط لعرضه</ThemedText>
          <Pressable onPress={() => setNewArrived(false)} style={bannerStyles.closeBtn}>
            <MaterialCommunityIcons name="close" size={16} color={AppColors.textOnBrandMuted} />
          </Pressable>
        </Pressable>
      ) : null}

      {/* ── Status update error banner ── */}
      {updateError !== null ? (
        <View style={bannerStyles.errorBanner}>
          <MaterialCommunityIcons name="alert-circle-outline" size={18} color={AppColors.white} />
          <ThemedText style={bannerStyles.text}>{updateError}</ThemedText>
          <Pressable onPress={() => setUpdateError(null)} style={bannerStyles.closeBtn}>
            <MaterialCommunityIcons name="close" size={16} color={AppColors.textOnBrandMuted} />
          </Pressable>
        </View>
      ) : null}

      {/* ── Content ── */}
      {loading ? (
        <View style={listStyles.center}>
          <ActivityIndicator size="large" color={ORANGE} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(o) => o.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={ORANGE} />
          }
          contentContainerStyle={{
            paddingTop: 12,
            paddingBottom: tabBarHeight + 16,
            paddingHorizontal: 14,
            flexGrow: 1,
          }}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          showsVerticalScrollIndicator={false}
          initialNumToRender={10}
          windowSize={5}
          maxToRenderPerBatch={8}
          removeClippedSubviews={true}
          renderItem={({ item }) => (
            <OrderCard
              order={item}
              onUpdateStatus={handleAction}
              onPrint={handlePrint}
              updatingId={updatingId}
              urgencyThresholds={urgencyThresholds}
            />
          )}
          ListEmptyComponent={
            <View style={listStyles.empty}>
              <MaterialCommunityIcons
                name={tabDef.icon as any}
                size={64}
                color={tabDef.color}
                style={{ opacity: 0.25 }}
              />
              <ThemedText style={[listStyles.emptyTitle, { color: theme.text }]}>
                {activeTab === "new"
                  ? "لا طلبات جديدة"
                  : activeTab === "active"
                  ? "لا طلبات قيد التحضير"
                  : activeTab === "ready"
                  ? "لا طلبات جاهزة الآن"
                  : "لا طلبات مكتملة بعد"}
              </ThemedText>
              <ThemedText style={[listStyles.emptySub, { color: theme.textSecondary }]}>
                {activeTab === "new"
                  ? "ستظهر هنا الطلبات الجديدة فور وصولها"
                  : "ستنتقل الطلبات هنا تلقائياً"}
              </ThemedText>
            </View>
          }
        />
      )}

      {/* Cancel confirmation modal */}
      <CancelModal
        visible={!!cancelTarget}
        onConfirm={() => {
          if (cancelTarget) updateStatus(cancelTarget, "cancelled");
          setCancelTarget(null);
        }}
        onCancel={() => setCancelTarget(null)}
      />

      {/* ETA modal for accepting orders */}
      <ETAModal
        visible={!!etaTarget}
        onConfirm={(estimatedMinutes) => {
          if (etaTarget) updateStatus(etaTarget, "confirmed", estimatedMinutes);
          setEtaTarget(null);
        }}
        onCancel={() => setEtaTarget(null)}
      />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const tabStyles = StyleSheet.create({
  bar: { borderBottomWidth: 1, elevation: 2, shadowColor: AppColors.black, shadowOpacity: 0.05, shadowRadius: 4 },
  tabRow: { flexDirection: "row", paddingHorizontal: 12, gap: 4 },
  tab: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 2.5, borderBottomColor: "transparent",
  },
  tabLabel: { fontFamily: "Cairo_700Bold", fontSize: 13 },
  badge: { borderRadius: 9, minWidth: 18, height: 18, justifyContent: "center", alignItems: "center", paddingHorizontal: 4 },
  badgeText: { fontFamily: "Cairo_700Bold", fontSize: 10, color: AppColors.white },
});

const cardStyles = StyleSheet.create({
  card: {
    borderRadius: 16, overflow: "hidden",
    shadowColor: AppColors.black, shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  cardPending: {
    borderWidth: 2,
    borderColor: AppColors.warning,
    shadowColor: AppColors.warning,
    shadowOpacity: 0.15,
    elevation: 5,
  },
  paymentBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
    backgroundColor: AppColors.gray100,
  },
  paymentText: { fontFamily: "Cairo_700Bold", fontSize: 11, color: AppColors.gray500 },
  notesRow: {
    flexDirection: "row-reverse", alignItems: "flex-start", gap: 6,
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, borderWidth: 1,
  },
  notesText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: AppColors.primaryDark, flex: 1, textAlign: "right" },
  header: { flexDirection: "row-reverse", alignItems: "flex-start", padding: 16, gap: 10 },
  headerTop: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  headerMeta: { flexDirection: "row-reverse", alignItems: "center", gap: 8, flexWrap: "wrap" },
  orderId: { fontFamily: "Cairo_700Bold", fontSize: 16 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontFamily: "Cairo_700Bold", fontSize: 12 },
  timeText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: AppColors.gray400 },
  expandBtn: { padding: 4, alignSelf: "center" },

  customerSection: { paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  customerCard: {
    flexDirection: "row-reverse", alignItems: "center", gap: 10,
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1,
  },
  customerAvatar: {
    width: 38, height: 38, borderRadius: 19,
    justifyContent: "center", alignItems: "center", flexShrink: 0,
  },
  customerName: { fontFamily: "Cairo_700Bold", fontSize: 14, textAlign: "right" },
  customerPhone: { fontFamily: "Cairo_400Regular", fontSize: 11, textAlign: "right", marginTop: 1 },
  infoRow: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 8 },
  infoText: { fontFamily: "Cairo_400Regular", fontSize: 12, flex: 1, textAlign: "right" },

  divider: { height: 1, marginHorizontal: 14, marginVertical: 2 },

  itemsSection: { paddingHorizontal: 14, paddingVertical: 10 },
  sectionLabel: { fontFamily: "Cairo_700Bold", fontSize: 13, textAlign: "right", marginBottom: 10 },
  itemRow: {
    flexDirection: "row-reverse", alignItems: "center",
    paddingVertical: 8, gap: 10,
    borderBottomWidth: 1,
  },
  itemImage: {
    width: 48, height: 48, borderRadius: 10, flexShrink: 0,
    backgroundColor: AppColors.gray100,
  },
  itemImagePlaceholder: {
    width: 48, height: 48, borderRadius: 10, flexShrink: 0,
    justifyContent: "center", alignItems: "center",
  },
  itemQtyBadge: {
    minWidth: 30, height: 24, borderRadius: 8,
    justifyContent: "center", alignItems: "center", paddingHorizontal: 4,
  },
  itemQtyText: { fontFamily: "Cairo_700Bold", fontSize: 12 },
  itemName: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 13, textAlign: "right" },
  itemPrice: { fontFamily: "Cairo_700Bold", fontSize: 13, textAlign: "center" },

  breakdownBox: {
    marginHorizontal: 14, marginTop: 2, marginBottom: 4,
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 10, gap: 8,
  },
  breakdownRow: {
    flexDirection: "row-reverse", alignItems: "center", gap: 8,
  },
  breakdownLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 13, flex: 1, textAlign: "right" },
  breakdownNote: { fontFamily: "Cairo_400Regular", fontSize: 10, color: AppColors.gray400, textAlign: "right" },
  breakdownAmount: { fontFamily: "Cairo_700Bold", fontSize: 13 },
  breakdownDivider: { height: 1, marginVertical: 2 },

  driverBanner: {
    flexDirection: "row-reverse", alignItems: "center", gap: 10,
    marginHorizontal: 14, marginTop: 6, marginBottom: 4,
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12,
  },
  driverBannerText: { fontFamily: "Cairo_700Bold", fontSize: 13, flex: 1, textAlign: "right" },
  driverCard: {
    flexDirection: "row-reverse", alignItems: "center", gap: 10,
    marginHorizontal: 14, marginTop: 6, marginBottom: 4,
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1,
  },
  driverAvatar: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: "center", alignItems: "center", flexShrink: 0,
  },
  driverName: { fontFamily: "Cairo_700Bold", fontSize: 14, textAlign: "right" },
  driverSub: { fontFamily: "Cairo_400Regular", fontSize: 11, textAlign: "right", marginTop: 1 },

  actionsRow: { flexDirection: "row-reverse", gap: 10, padding: 14, paddingTop: 8 },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 12, borderRadius: 12,
  },
  actionBtnPrimary: { elevation: 2, shadowColor: AppColors.black, shadowOpacity: 0.1, shadowRadius: 4 },
  actionBtnSecondary: {},
  actionBtnText: { fontFamily: "Cairo_700Bold", fontSize: 13 },
  printBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 7, marginHorizontal: 14, marginBottom: 12, paddingVertical: 10,
    borderRadius: 10, backgroundColor: AppColors.gray100,
    borderWidth: 1, borderColor: AppColors.divider,
  },
  printBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: AppColors.gray500 },
});

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: AppColors.overlay, justifyContent: "center", alignItems: "center" },
  box: {
    backgroundColor: AppColors.white, borderRadius: 20, padding: 24,
    width: SCREEN_W * 0.85, gap: 12,
  },
  title: { fontFamily: "Cairo_700Bold", fontSize: 18, textAlign: "center", color: AppColors.black },
  subtitle: { fontFamily: "Cairo_400Regular", fontSize: 14, textAlign: "center", color: AppColors.gray500 },
  btns: { flexDirection: "column", gap: 8, marginTop: 8 },
  btn: { borderRadius: 12, paddingVertical: 13, alignItems: "center" },
  btnText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: AppColors.white },
});

const listStyles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 12 },
  emptyTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, textAlign: "center" },
  emptySub: { fontFamily: "Cairo_400Regular", fontSize: 13, textAlign: "center" },
});

const bannerStyles = StyleSheet.create({
  banner: {
    flexDirection: "row-reverse", alignItems: "center", gap: 10,
    backgroundColor: AppColors.warning, paddingVertical: 12, paddingHorizontal: 16,
  },
  errorBanner: {
    flexDirection: "row-reverse", alignItems: "center", gap: 10,
    backgroundColor: AppColors.error, paddingVertical: 12, paddingHorizontal: 16,
  },
  text: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 14, color: AppColors.white, textAlign: "right" },
  closeBtn: { padding: 4 },
});
