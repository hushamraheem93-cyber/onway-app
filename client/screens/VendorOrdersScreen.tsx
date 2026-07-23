import React, {
  useCallback,
  useState,
  useMemo,
  useRef,
  useEffect,
} from "react";
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
  Animated,
} from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useFocusEffect } from "@react-navigation/native";
import { MaterialCommunityIcons, Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Print from "expo-print";

import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";
import { getApiUrl } from "@/lib/query-client";
import { useTheme } from "@/hooks/useTheme";
import {
  AppColors,
  BorderRadius,
  FontFamily,
  FontSize,
  Shadows,
  Spacing,
} from "@/constants/theme";

const ORANGE = AppColors.primary;
const SCREEN_W = Dimensions.get("window").width;

// ─── Interfaces (unchanged) ────────────────────────────────────────────────────

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

// ─── Status config (preparing → orange instead of purple) ─────────────────────

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  pending:    { label: "طلب جديد",      color: AppColors.warning,      bg: AppColors.warningLight,  icon: "bell-ring" },
  confirmed:  { label: "مؤكد",          color: AppColors.info,         bg: AppColors.infoLight,     icon: "check-circle" },
  preparing:  { label: "قيد التحضير",  color: AppColors.primary,      bg: AppColors.secondary,     icon: "chef-hat" },
  ready:      { label: "جاهز",          color: AppColors.success,      bg: AppColors.successLight,  icon: "package-variant-closed-check" },
  picked_up:  { label: "استلمه السائق", color: AppColors.statusCyan,  bg: AppColors.infoLight,     icon: "moped" },
  delivering: { label: "في الطريق",     color: AppColors.info,         bg: AppColors.infoLight,     icon: "navigation" },
  delivered:  { label: "تم التوصيل",   color: AppColors.success,      bg: AppColors.successLight,  icon: "check-all" },
  cancelled:  { label: "ملغي",          color: AppColors.error,        bg: AppColors.errorLight,    icon: "close-circle" },
};

// ─── Tab definitions (unchanged logic) ────────────────────────────────────────

const TABS = [
  { key: "new",    label: "جديد",  statuses: ["pending"],                        icon: "bell-ring",                    color: AppColors.warning  },
  { key: "active", label: "تحضير", statuses: ["confirmed", "preparing"],          icon: "chef-hat",                    color: AppColors.primary  },
  { key: "ready",  label: "جاهز",  statuses: ["ready", "picked_up"],             icon: "package-variant-closed-check", color: AppColors.success  },
  { key: "done",   label: "مكتمل", statuses: ["delivered", "delivering", "cancelled"], icon: "check-all",              color: AppColors.gray500  },
];

// ─── Action buttons per status (unchanged) ────────────────────────────────────

type Action = { label: string; nextStatus: string; color: string; bg: string; icon: string; primary?: boolean };

function getActions(status: string): Action[] {
  switch (status) {
    case "pending":
      return [
        { label: "قبول الطلب",  nextStatus: "confirmed", color: AppColors.white, bg: AppColors.success,   icon: "check",    primary: true  },
        { label: "رفض",         nextStatus: "cancelled", color: AppColors.error, bg: AppColors.errorLight, icon: "close",    primary: false },
      ];
    case "confirmed":
      return [
        { label: "بدء التحضير", nextStatus: "preparing", color: AppColors.white, bg: ORANGE,              icon: "chef-hat", primary: true  },
        { label: "إلغاء",       nextStatus: "cancelled", color: AppColors.error, bg: AppColors.errorLight, icon: "close",    primary: false },
      ];
    case "preparing":
      return [
        { label: "الطلب جاهز",  nextStatus: "ready",     color: AppColors.white, bg: AppColors.success,   icon: "package-variant-closed-check", primary: true },
      ];
    default:
      return [];
  }
}

// ─── Receipt HTML builder (unchanged) ─────────────────────────────────────────

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
  .app-name{font-size:32px;font-weight:900;color:#FB5B21;letter-spacing:3px;}
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
  .grand-total{font-size:16px;font-weight:900;color:#FB5B21;padding-top:3px;}
  .payment-row{display:flex;justify-content:space-between;padding:5px 0;font-size:13px;}
  .notes-box{background:#fff2ec;border:1px dashed #FB5B21;border-radius:6px;padding:8px 10px;margin:6px 0;font-size:12px;color:#555;}
  .footer{text-align:center;margin-top:16px;padding-top:12px;border-top:2px solid #1a1a1a;}
  .footer-main{font-size:15px;font-weight:700;color:#FB5B21;margin-bottom:4px;}
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
  <thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th></tr></thead>
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

// ─── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  if (!iso) return "";
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1)  return "الآن";
    if (mins < 60) return `منذ ${mins} د`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)  return `منذ ${hrs} س`;
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

const DEFAULT_URGENCY_THRESHOLD: Record<string, number> = {
  confirmed: 10, preparing: 25, ready: 15,
};

const STATUS_TIMER_LABEL: Record<string, string> = {
  confirmed: "مؤكد منذ", preparing: "في التحضير منذ", ready: "جاهز منذ",
};

// ─── Live-ticking clock hook ───────────────────────────────────────────────────

function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// ─── Skeleton loading card ─────────────────────────────────────────────────────

const SkeletonCard = React.memo(() => {
  const anim = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1,   duration: 800, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <Animated.View style={[sk.card, { opacity: anim }]}>
      <View style={sk.header}>
        <View style={sk.idBox} />
        <View style={sk.chipBox} />
      </View>
      <View style={sk.line} />
      <View style={[sk.line, { width: "60%" }]} />
      <View style={sk.actions}>
        <View style={sk.btn} />
        <View style={[sk.btn, { backgroundColor: AppColors.gray100 }]} />
      </View>
    </Animated.View>
  );
});

const sk = StyleSheet.create({
  card:    { backgroundColor: AppColors.white, borderRadius: 20, padding: 16, gap: 12, ...Shadows.sm },
  header:  { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  idBox:   { width: 100, height: 18, borderRadius: 8, backgroundColor: AppColors.gray100 },
  chipBox: { width: 70,  height: 24, borderRadius: 12, backgroundColor: AppColors.gray100 },
  line:    { height: 14, borderRadius: 7, backgroundColor: AppColors.gray100, width: "80%" },
  actions: { flexDirection: "row", gap: 10, marginTop: 4 },
  btn:     { flex: 1, height: 44, borderRadius: 12, backgroundColor: AppColors.gray200 },
});

// ─── Status Chip ───────────────────────────────────────────────────────────────

const StatusChip = React.memo(({ status }: { status: string }) => {
  const cfg = STATUS_CFG[status] ?? { label: status, color: AppColors.gray500, bg: AppColors.gray100, icon: "help-circle" };
  return (
    <View style={[chip.wrap, { backgroundColor: cfg.bg }]}>
      <MaterialCommunityIcons name={cfg.icon as any} size={12} color={cfg.color} />
      <ThemedText style={[chip.text, { color: cfg.color }]}>{cfg.label}</ThemedText>
    </View>
  );
});

const chip = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  text: { fontFamily: FontFamily.cairoBold, fontSize: 11 },
});

// ─── Payment Badge ─────────────────────────────────────────────────────────────

const PaymentBadge = React.memo(({ method }: { method?: string }) => {
  if (!method) return null;
  const isCash = method === "cash";
  return (
    <View style={[pb.wrap, { backgroundColor: isCash ? AppColors.successLight : AppColors.infoLight }]}>
      <MaterialCommunityIcons
        name={isCash ? "cash" : "credit-card-outline"}
        size={12}
        color={isCash ? AppColors.success : AppColors.info}
      />
      <ThemedText style={[pb.text, { color: isCash ? AppColors.success : AppColors.info }]}>
        {isCash ? "كاش" : method === "card" ? "بطاقة" : method}
      </ThemedText>
    </View>
  );
});

const pb = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  text: { fontFamily: FontFamily.cairoBold, fontSize: 11 },
});

// ─── Timer Badge ───────────────────────────────────────────────────────────────

const TimerBadge = React.memo(({ createdAt }: { createdAt: string }) => {
  const now = useMinuteClock();
  const mins = Math.floor((now - new Date(createdAt).getTime()) / 60000);
  const urgent = mins >= 5;
  return (
    <View style={[tb.wrap, { backgroundColor: urgent ? AppColors.errorLight : AppColors.warningLight }]}>
      <MaterialCommunityIcons name="timer-outline" size={12} color={urgent ? AppColors.error : AppColors.warning} />
      <ThemedText style={[tb.text, { color: urgent ? AppColors.error : AppColors.warning }]}>
        {mins < 1 ? "< دقيقة" : `${mins} د`}
      </ThemedText>
    </View>
  );
});

const tb = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  text: { fontFamily: FontFamily.cairoBold, fontSize: 11 },
});

// ─── Status Timer Badge ────────────────────────────────────────────────────────

const StatusTimerBadge = React.memo(({
  status, statusAt, thresholds,
}: { status: string; statusAt: string; thresholds: Record<string, number> }) => {
  const now = useMinuteClock();
  if (!statusAt) return null;
  const label = STATUS_TIMER_LABEL[status];
  if (!label) return null;
  const mins = Math.floor((now - new Date(statusAt).getTime()) / 60000);
  const threshold = thresholds[status] ?? DEFAULT_URGENCY_THRESHOLD[status] ?? 15;
  const urgent = mins >= threshold;
  const color = urgent ? AppColors.error : AppColors.primary;
  const bg    = urgent ? AppColors.errorLight : AppColors.secondary;
  return (
    <View style={[stb.wrap, { backgroundColor: bg }]}>
      <MaterialCommunityIcons name="clock-alert-outline" size={12} color={color} />
      <ThemedText style={[stb.text, { color }]}>
        {label} {mins < 1 ? "أقل من دقيقة" : `${mins} د`}
      </ThemedText>
    </View>
  );
});

const stb = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  text: { fontFamily: FontFamily.cairoBold, fontSize: 11 },
});

// ─── Order Timeline (replaces ProgressBar) ────────────────────────────────────

const TIMELINE_STEPS = [
  { key: "pending",   label: "وصل",    icon: "bell"            },
  { key: "confirmed", label: "قُبل",   icon: "check"           },
  { key: "preparing", label: "يتحضر",  icon: "chef-hat"        },
  { key: "ready",     label: "جاهز",   icon: "package-variant-closed-check" },
  { key: "delivering",label: "يُوصَّل", icon: "moped"           },
  { key: "delivered", label: "وصل",    icon: "check-all"       },
];

const OrderTimeline = React.memo(({ status }: { status: string }) => {
  if (status === "cancelled") return null;
  const idx = TIMELINE_STEPS.findIndex(s => s.key === status);
  const active = idx < 0 ? 0 : idx;
  return (
    <View style={tl.row}>
      {TIMELINE_STEPS.map((step, i) => {
        const done    = i <= active;
        const current = i === active;
        return (
          <React.Fragment key={step.key}>
            <View style={tl.step}>
              <View style={[
                tl.dot,
                done    ? { backgroundColor: ORANGE }          : { backgroundColor: AppColors.gray200 },
                current ? { borderWidth: 2, borderColor: ORANGE + "50" } : {},
              ]}>
                <MaterialCommunityIcons
                  name={step.icon as any}
                  size={9}
                  color={done ? AppColors.white : AppColors.gray400}
                />
              </View>
              <ThemedText style={[tl.label, { color: done ? ORANGE : AppColors.gray300 }]}>
                {step.label}
              </ThemedText>
            </View>
            {i < TIMELINE_STEPS.length - 1 && (
              <View style={[tl.line, { backgroundColor: i < active ? ORANGE : AppColors.gray200 }]} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
});

const tl = StyleSheet.create({
  row:   { flexDirection: "row-reverse", alignItems: "flex-start", paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  step:  { alignItems: "center", gap: 4 },
  dot:   { width: 22, height: 22, borderRadius: 11, justifyContent: "center", alignItems: "center" },
  line:  { flex: 1, height: 2, marginTop: 10, marginHorizontal: 2 },
  label: { fontFamily: FontFamily.tajawal, fontSize: 9, textAlign: "center" },
});

// ─── Driver Banner ─────────────────────────────────────────────────────────────

const DriverSection = React.memo(({ order }: { order: VendorOrder }) => {
  if (order.status === "ready") {
    return (
      <View style={[ds.banner, { backgroundColor: AppColors.infoLight }]}>
        <MaterialCommunityIcons name="moped" size={18} color={AppColors.statusCyan} />
        <ThemedText style={[ds.bannerText, { color: AppColors.statusCyan }]}>
          في انتظار السائق لاستلام الطلب
        </ThemedText>
      </View>
    );
  }
  if ((order.status === "picked_up" || order.status === "delivering") && order.driverName) {
    return (
      <View style={[ds.card, { backgroundColor: AppColors.infoLight }]}>
        <View style={[ds.avatar, { backgroundColor: AppColors.statusCyan }]}>
          <MaterialCommunityIcons name="moped" size={16} color={AppColors.white} />
        </View>
        <View style={{ flex: 1 }}>
          <ThemedText style={ds.name}>{order.driverName}</ThemedText>
          <ThemedText style={ds.sub}>
            {order.status === "picked_up" ? "استلم الطلب · في الطريق للزبون" : "في الطريق إلى الزبون"}
          </ThemedText>
          {order.driverPhone ? <ThemedText style={ds.phone}>{order.driverPhone}</ThemedText> : null}
        </View>
        <MaterialCommunityIcons name="navigation" size={16} color={AppColors.statusCyan} />
      </View>
    );
  }
  if (order.status === "picked_up" || order.status === "delivering") {
    return (
      <View style={[ds.banner, { backgroundColor: AppColors.infoLight }]}>
        <MaterialCommunityIcons name="navigation" size={16} color={AppColors.info} />
        <ThemedText style={[ds.bannerText, { color: AppColors.info }]}>
          السائق في الطريق إلى العميل
        </ThemedText>
      </View>
    );
  }
  return null;
});

const ds = StyleSheet.create({
  banner:     { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginHorizontal: 14, marginVertical: 6, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14 },
  bannerText: { fontFamily: FontFamily.cairoBold, fontSize: 13, flex: 1, textAlign: "right" },
  card:       { flexDirection: "row-reverse", alignItems: "center", gap: 10, marginHorizontal: 14, marginVertical: 6, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14 },
  avatar:     { width: 34, height: 34, borderRadius: 17, justifyContent: "center", alignItems: "center" },
  name:       { fontFamily: FontFamily.cairoBold, fontSize: 14, color: AppColors.info, textAlign: "right" },
  sub:        { fontFamily: FontFamily.tajawal, fontSize: 11, color: AppColors.statusCyan, textAlign: "right", marginTop: 1 },
  phone:      { fontFamily: FontFamily.tajawal, fontSize: 11, color: AppColors.gray500, textAlign: "right", marginTop: 1 },
});

// ─── Order Card ────────────────────────────────────────────────────────────────

const OrderCard = React.memo(({
  order, onUpdateStatus, onPrint, updatingId, urgencyThresholds,
}: {
  order: VendorOrder;
  onUpdateStatus: (id: string, status: string) => void;
  onPrint: (order: VendorOrder) => void;
  updatingId: string | null;
  urgencyThresholds: Record<string, number>;
}) => {
  const { theme } = useTheme();
  const [expanded, setExpanded] = useState(true);

  const cfg        = STATUS_CFG[order.status] ?? { label: order.status, color: AppColors.gray500, bg: AppColors.gray100, icon: "help" };
  const actions    = getActions(order.status);
  const vendorTotal= order.vendorSubtotal ?? order.restaurantSubtotal ?? order.total;
  const displayName= order.customerName || order.customerPhone || order.phoneNumber || "عميل";
  const isUpdating = updatingId === order.id;
  const isPending  = order.status === "pending";

  const statusAtKey     = `vendorStatusAt_${order.status}` as keyof VendorOrder;
  const currentStatusAt = (order[statusAtKey] as string | undefined) ?? "";

  return (
    <View style={[
      oc.card,
      { backgroundColor: theme.backgroundDefault },
      isPending && oc.cardPending,
    ]}>
      {/* Left accent bar */}
      <View style={[oc.accentBar, { backgroundColor: cfg.color }]} />

      {/* ── Header ── */}
      <Pressable
        style={oc.header}
        onPress={() => setExpanded(e => !e)}
        accessibilityRole="button"
        accessibilityLabel={expanded ? "طي الطلب" : "توسيع الطلب"}
      >
        {/* Right: ID + status + meta */}
        <View style={{ flex: 1 }}>
          <View style={oc.headerTop}>
            <ThemedText style={oc.orderId}>
              #{order.id.slice(-8).toUpperCase()}
            </ThemedText>
            <StatusChip status={order.status} />
          </View>
          <View style={oc.metaRow}>
            <Feather name="clock" size={12} color={AppColors.gray400} />
            <ThemedText style={oc.timeText}>{relativeTime(order.createdAt)}</ThemedText>
            <ThemedText style={oc.dot}>·</ThemedText>
            <ThemedText style={oc.itemCount}>{order.items?.length ?? 0} منتج</ThemedText>
            {isPending && <TimerBadge createdAt={order.createdAt} />}
            {currentStatusAt.length > 0 && (
              <StatusTimerBadge status={order.status} statusAt={currentStatusAt} thresholds={urgencyThresholds} />
            )}
          </View>
          <View style={oc.badgeRow}>
            <PaymentBadge method={order.paymentMethod} />
            {order.estimatedMinutes && order.estimatedMinutes > 0 ? (
              <View style={oc.etaBadge}>
                <MaterialCommunityIcons name="clock-fast" size={12} color={AppColors.success} />
                <ThemedText style={oc.etaText}>{order.estimatedMinutes} د</ThemedText>
              </View>
            ) : null}
          </View>
        </View>

        {/* Left: total + expand */}
        <View style={oc.headerRight}>
          <ThemedText style={oc.totalText}>{order.total.toLocaleString("ar-IQ")}</ThemedText>
          <ThemedText style={oc.totalUnit}>د.ع</ThemedText>
          <MaterialCommunityIcons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={20}
            color={AppColors.gray400}
            style={{ marginTop: 4 }}
          />
        </View>
      </Pressable>

      {expanded && (
        <>
          {/* Timeline */}
          <OrderTimeline status={order.status} />

          {/* Divider */}
          <View style={[oc.divider, { backgroundColor: AppColors.gray100 }]} />

          {/* ── Customer ── */}
          <View style={oc.section}>
            <View style={[oc.customerRow, { backgroundColor: ORANGE + "08", borderColor: ORANGE + "20" }]}>
              <View style={[oc.customerAvatar, { backgroundColor: ORANGE + "18" }]}>
                <MaterialCommunityIcons name="account" size={18} color={ORANGE} />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={oc.customerName}>{displayName}</ThemedText>
                {(order.customerPhone || order.phoneNumber) ? (
                  <ThemedText style={oc.customerPhone}>
                    {order.customerPhone || order.phoneNumber}
                  </ThemedText>
                ) : null}
              </View>
            </View>
            {order.address ? (
              <View style={oc.infoRow}>
                <Feather name="map-pin" size={13} color={AppColors.gray400} />
                <ThemedText style={oc.infoText} numberOfLines={2}>{order.address}</ThemedText>
              </View>
            ) : null}
            <View style={oc.infoRow}>
              <Feather name="calendar" size={13} color={AppColors.gray400} />
              <ThemedText style={oc.infoText}>{fullDate(order.createdAt)}</ThemedText>
            </View>
            {order.notes ? (
              <View style={[oc.notesBox, { backgroundColor: AppColors.warningLight, borderColor: AppColors.warning + "50" }]}>
                <MaterialCommunityIcons name="note-text-outline" size={14} color={AppColors.warning} />
                <ThemedText style={oc.notesText} numberOfLines={3}>{order.notes}</ThemedText>
              </View>
            ) : null}
          </View>

          <View style={[oc.divider, { backgroundColor: AppColors.gray100 }]} />

          {/* ── Items ── */}
          <View style={oc.section}>
            <ThemedText style={oc.sectionLabel}>
              المنتجات ({order.items?.length ?? 0})
            </ThemedText>
            {Array.isArray(order.items) && order.items.map((item, i) => (
              <View key={i} style={[
                oc.itemRow,
                i < order.items.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: AppColors.gray100 },
              ]}>
                {item.imageUrl ? (
                  <Image source={{ uri: item.imageUrl }} style={oc.itemImg} resizeMode="cover" />
                ) : (
                  <View style={[oc.itemImgPlaceholder, { backgroundColor: ORANGE + "10" }]}>
                    <MaterialCommunityIcons name="food" size={16} color={ORANGE} style={{ opacity: 0.6 }} />
                  </View>
                )}
                <View style={[oc.qtyBadge, { backgroundColor: ORANGE + "15" }]}>
                  <ThemedText style={[oc.qtyText, { color: ORANGE }]}>×{item.quantity}</ThemedText>
                </View>
                <ThemedText style={oc.itemName} numberOfLines={2}>{item.name}</ThemedText>
                <ThemedText style={[oc.itemPrice, { color: ORANGE }]}>
                  {((item.price || 0) * (item.quantity || 1)).toLocaleString("ar-IQ")} د.ع
                </ThemedText>
              </View>
            ))}
          </View>

          {/* ── Cost breakdown ── */}
          <View style={[oc.breakdown, { backgroundColor: ORANGE + "06", borderColor: ORANGE + "15" }]}>
            <CostRow
              icon="store-outline"
              label="إجمالي المتجر"
              amount={vendorTotal}
              color={ORANGE}
              bold
            />
            {order.deliveryFee !== undefined && order.deliveryFee > 0 && (
              <CostRow icon="moped-outline" label="رسوم التوصيل" amount={order.deliveryFee} color={AppColors.gray500} />
            )}
            {order.serviceFee !== undefined && order.serviceFee > 0 && (
              <CostRow icon="shield-check-outline" label="رسوم الخدمة" amount={order.serviceFee} color={AppColors.gray400} note="تذهب للتطبيق" />
            )}
            {((order.deliveryFee !== undefined && order.deliveryFee > 0) || (order.serviceFee !== undefined && order.serviceFee > 0)) && (
              <>
                <View style={[oc.breakdownDivider, { backgroundColor: ORANGE + "20" }]} />
                <CostRow icon="cash-multiple" label="إجمالي الزبون" amount={order.total} color={ORANGE} bold large />
              </>
            )}
          </View>

          {/* ── Driver ── */}
          <DriverSection order={order} />

          {/* ── Action Buttons ── */}
          {actions.length > 0 && (
            <View style={oc.actionsRow}>
              {actions.map((a) => (
                <Pressable
                  key={a.nextStatus}
                  style={({ pressed }) => [
                    oc.actionBtn,
                    { backgroundColor: a.bg, opacity: pressed || isUpdating ? 0.75 : 1 },
                    a.primary && Shadows.sm,
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
                    <MaterialCommunityIcons name={a.icon as any} size={18} color={a.color} />
                  )}
                  <ThemedText style={[oc.actionText, { color: a.color }]}>{a.label}</ThemedText>
                </Pressable>
              ))}
            </View>
          )}

          {/* ── Print ── */}
          {order.status !== "pending" && order.status !== "cancelled" && (
            <Pressable
              style={oc.printBtn}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPrint(order); }}
              testID={`btn-print-${order.id}`}
            >
              <MaterialCommunityIcons name="printer-outline" size={15} color={AppColors.gray500} />
              <ThemedText style={oc.printText}>طباعة الوصل</ThemedText>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
});

// ─── Cost Row helper ───────────────────────────────────────────────────────────

const CostRow = React.memo(({
  icon, label, amount, color, bold, large, note,
}: {
  icon: string; label: string; amount: number;
  color: string; bold?: boolean; large?: boolean; note?: string;
}) => (
  <View style={cr.row}>
    <MaterialCommunityIcons name={icon as any} size={14} color={color} />
    <View style={{ flex: 1 }}>
      <ThemedText style={[cr.label, bold && { fontFamily: FontFamily.cairoBold }, { color: AppColors.gray700 }]}>
        {label}
      </ThemedText>
      {note ? <ThemedText style={cr.note}>{note}</ThemedText> : null}
    </View>
    <ThemedText style={[cr.amount, { color }, bold && { fontFamily: FontFamily.cairoBold }, large && { fontSize: 15 }]}>
      {amount.toLocaleString("ar-IQ")} د.ع
    </ThemedText>
  </View>
));

const cr = StyleSheet.create({
  row:    { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  label:  { fontFamily: FontFamily.tajawal, fontSize: 13, textAlign: "right" },
  note:   { fontFamily: FontFamily.tajawal, fontSize: 10, color: AppColors.gray400, textAlign: "right" },
  amount: { fontFamily: FontFamily.cairoMedium, fontSize: 13 },
});

// ─── ETA Options ───────────────────────────────────────────────────────────────

const ETA_OPTIONS = [15, 30, 45, 60];

function ETAModal({
  visible, onConfirm, onCancel,
}: { visible: boolean; onConfirm: (mins?: number) => void; onCancel: () => void }) {
  const [selected, setSelected] = useState<number | null>(null);
  const handleConfirm = () => { onConfirm(selected ?? undefined); setSelected(null); };
  const handleCancel  = () => { setSelected(null); onCancel(); };

  return (
    <Modal transparent visible={visible} animationType="slide">
      <View style={md.overlay}>
        <View style={md.sheet}>
          <View style={md.handle} />
          <View style={[md.iconCircle, { backgroundColor: AppColors.successLight }]}>
            <MaterialCommunityIcons name="clock-outline" size={32} color={AppColors.success} />
          </View>
          <ThemedText style={md.title}>قبول الطلب</ThemedText>
          <ThemedText style={md.subtitle}>كم تحتاج من الوقت لتحضير هذا الطلب؟</ThemedText>
          <View style={md.optionRow}>
            {ETA_OPTIONS.map((mins) => {
              const sel = selected === mins;
              return (
                <Pressable
                  key={mins}
                  style={[md.option, sel && { backgroundColor: AppColors.successLight, borderColor: AppColors.success }]}
                  onPress={() => setSelected(sel ? null : mins)}
                  testID={`eta-option-${mins}`}
                >
                  <ThemedText style={[md.optionVal, sel && { color: AppColors.success }]}>{mins}</ThemedText>
                  <ThemedText style={[md.optionUnit, sel && { color: AppColors.success }]}>د</ThemedText>
                </Pressable>
              );
            })}
          </View>
          <Pressable style={[md.btn, { backgroundColor: AppColors.success }]} onPress={handleConfirm} testID="btn-eta-confirm">
            <ThemedText style={md.btnText}>{selected ? `قبول (${selected} دقيقة)` : "قبول بدون تحديد وقت"}</ThemedText>
          </Pressable>
          <Pressable style={[md.btn, { backgroundColor: AppColors.gray100 }]} onPress={handleCancel} testID="btn-eta-cancel">
            <ThemedText style={[md.btnText, { color: AppColors.gray700 }]}>تراجع</ThemedText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function CancelModal({
  visible, onConfirm, onCancel,
}: { visible: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Modal transparent visible={visible} animationType="slide">
      <View style={md.overlay}>
        <View style={md.sheet}>
          <View style={md.handle} />
          <View style={[md.iconCircle, { backgroundColor: AppColors.errorLight }]}>
            <MaterialCommunityIcons name="alert-circle-outline" size={32} color={AppColors.error} />
          </View>
          <ThemedText style={md.title}>رفض الطلب؟</ThemedText>
          <ThemedText style={md.subtitle}>سيتم إلغاء هذا الطلب وإشعار الزبون.</ThemedText>
          <Pressable style={[md.btn, { backgroundColor: AppColors.error }]} onPress={onConfirm}>
            <ThemedText style={md.btnText}>نعم، إلغاء الطلب</ThemedText>
          </Pressable>
          <Pressable style={[md.btn, { backgroundColor: AppColors.gray100 }]} onPress={onCancel}>
            <ThemedText style={[md.btnText, { color: AppColors.gray700 }]}>تراجع</ThemedText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const md = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet:      { backgroundColor: AppColors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingTop: 12, gap: 12 },
  handle:     { width: 40, height: 4, borderRadius: 2, backgroundColor: AppColors.gray200, alignSelf: "center", marginBottom: 8 },
  iconCircle: { width: 64, height: 64, borderRadius: 32, justifyContent: "center", alignItems: "center", alignSelf: "center" },
  title:      { fontFamily: FontFamily.cairoBold, fontSize: 18, textAlign: "center", color: AppColors.gray800 },
  subtitle:   { fontFamily: FontFamily.tajawal, fontSize: 14, textAlign: "center", color: AppColors.gray500 },
  optionRow:  { flexDirection: "row-reverse", gap: 10, justifyContent: "center", flexWrap: "wrap" },
  option:     { flexDirection: "row", alignItems: "baseline", gap: 3, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14, backgroundColor: AppColors.gray100, borderWidth: 2, borderColor: "transparent" },
  optionVal:  { fontFamily: FontFamily.cairoBold, fontSize: 20, color: AppColors.gray700 },
  optionUnit: { fontFamily: FontFamily.tajawal, fontSize: 13, color: AppColors.gray500 },
  btn:        { borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  btnText:    { fontFamily: FontFamily.cairoBold, fontSize: 14, color: AppColors.white },
});

// ─── Empty State ───────────────────────────────────────────────────────────────

const EmptyState = React.memo(({ tab }: { tab: typeof TABS[0] }) => {
  const messages: Record<string, { title: string; sub: string }> = {
    new:    { title: "لا طلبات جديدة",          sub: "ستظهر هنا الطلبات الجديدة فور وصولها"   },
    active: { title: "لا طلبات قيد التحضير",    sub: "ستنتقل الطلبات المؤكدة هنا تلقائياً"   },
    ready:  { title: "لا طلبات جاهزة الآن",     sub: "ستظهر الطلبات الجاهزة للاستلام هنا"    },
    done:   { title: "لا طلبات مكتملة بعد",     sub: "ستظهر الطلبات المكتملة والملغاة هنا"   },
  };
  const msg = messages[tab.key] ?? messages.new;
  return (
    <View style={es.wrap}>
      <View style={[es.circle, { backgroundColor: tab.color + "12" }]}>
        <MaterialCommunityIcons name={tab.icon as any} size={40} color={tab.color} style={{ opacity: 0.5 }} />
      </View>
      <ThemedText style={es.title}>{msg.title}</ThemedText>
      <ThemedText style={es.sub}>{msg.sub}</ThemedText>
    </View>
  );
});

const es = StyleSheet.create({
  wrap:   { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 14 },
  circle: { width: 88, height: 88, borderRadius: 44, justifyContent: "center", alignItems: "center" },
  title:  { fontFamily: FontFamily.cairoBold, fontSize: 17, color: AppColors.gray700, textAlign: "center" },
  sub:    { fontFamily: FontFamily.tajawal, fontSize: 13, color: AppColors.gray400, textAlign: "center", lineHeight: 20 },
});

// ─── Main Screen ───────────────────────────────────────────────────────────────

export default function VendorOrdersScreen() {
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { vendorToken } = useAuth();
  const { theme } = useTheme();

  const [orders, setOrders]                   = useState<VendorOrder[]>([]);
  const [urgencyThresholds, setUrgencyThresholds] = useState<Record<string, number>>(DEFAULT_URGENCY_THRESHOLD);
  const [loading, setLoading]                 = useState(true);
  const [refreshing, setRefreshing]           = useState(false);
  const [activeTab, setActiveTab]             = useState("new");
  const [updatingId, setUpdatingId]           = useState<string | null>(null);
  const [cancelTarget, setCancelTarget]       = useState<string | null>(null);
  const [etaTarget, setEtaTarget]             = useState<string | null>(null);
  const [newArrived, setNewArrived]           = useState(false);
  const [updateError, setUpdateError]         = useState<string | null>(null);

  const prevNewCount = useRef(0);
  const pollRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const isFocused    = useRef(false);

  // ── Load orders ────────────────────────────────────────────────────────────
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
      const newPending = incoming.filter(o => o.status === "pending").length;
      if (silent && newPending > prevNewCount.current) {
        setNewArrived(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
      prevNewCount.current = newPending;
      setOrders(incoming);
    } catch {} finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [vendorToken]);

  // ── Urgency thresholds ─────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(new URL("/api/settings/urgency-thresholds", getApiUrl()).toString());
        if (res.ok) {
          const data = await res.json();
          setUrgencyThresholds({
            confirmed: data.confirmed ?? DEFAULT_URGENCY_THRESHOLD.confirmed,
            preparing: data.preparing ?? DEFAULT_URGENCY_THRESHOLD.preparing,
            ready:     data.ready     ?? DEFAULT_URGENCY_THRESHOLD.ready,
          });
        }
      } catch {}
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

  // ── Update status ──────────────────────────────────────────────────────────
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
        setOrders(prev => prev.map(o =>
          o.id === orderId
            ? { ...o, status: newStatus, [`vendorStatusAt_${newStatus}`]: nowIso, ...(estimatedMinutes ? { estimatedMinutes } : {}) }
            : o
        ));
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
    if (nextStatus === "cancelled")  setCancelTarget(orderId);
    else if (nextStatus === "confirmed") setEtaTarget(orderId);
    else updateStatus(orderId, nextStatus);
  }, [updateStatus]);

  const handlePrint = useCallback(async (order: VendorOrder) => {
    try { await Print.printAsync({ html: buildReceiptHTML(order) }); } catch {}
  }, []);

  // ── Derived ────────────────────────────────────────────────────────────────
  const tabDef = TABS.find(t => t.key === activeTab)!;

  const filtered = useMemo(
    () => orders.filter(o => tabDef.statuses.includes(o.status)),
    [orders, activeTab, tabDef]
  );

  const tabCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of TABS) m[t.key] = orders.filter(o => t.statuses.includes(o.status)).length;
    return m;
  }, [orders]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: AppColors.background }}>

      {/* ── Tab bar ── */}
      <View style={[ts.bar, { paddingTop: headerHeight, backgroundColor: theme.backgroundDefault }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={ts.row}
        >
          {TABS.map((t) => {
            const active = activeTab === t.key;
            const count  = tabCounts[t.key] ?? 0;
            return (
              <Pressable
                key={t.key}
                style={[ts.tab, active && { backgroundColor: t.color + "12" }]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActiveTab(t.key); }}
                testID={`tab-vendor-orders-${t.key}`}
              >
                <MaterialCommunityIcons
                  name={t.icon as any}
                  size={16}
                  color={active ? t.color : AppColors.gray400}
                />
                <ThemedText style={[ts.label, { color: active ? t.color : AppColors.gray400 }]}>
                  {t.label}
                </ThemedText>
                {count > 0 && (
                  <View style={[ts.badge, { backgroundColor: t.key === "new" ? AppColors.error : t.color }]}>
                    <ThemedText style={ts.badgeText}>{count > 9 ? "9+" : count}</ThemedText>
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* ── New order banner ── */}
      {newArrived && (
        <Pressable
          style={bn.newBanner}
          onPress={() => { setActiveTab("new"); setNewArrived(false); }}
        >
          <MaterialCommunityIcons name="bell-ring" size={18} color={AppColors.white} />
          <ThemedText style={bn.text}>وصل طلب جديد! اضغط لعرضه</ThemedText>
          <Pressable onPress={() => setNewArrived(false)} style={bn.close} hitSlop={8}>
            <MaterialCommunityIcons name="close" size={16} color="rgba(255,255,255,0.7)" />
          </Pressable>
        </Pressable>
      )}

      {/* ── Error banner ── */}
      {updateError !== null && (
        <View style={bn.errBanner}>
          <MaterialCommunityIcons name="alert-circle-outline" size={16} color={AppColors.white} />
          <ThemedText style={bn.text}>{updateError}</ThemedText>
          <Pressable onPress={() => setUpdateError(null)} style={bn.close} hitSlop={8}>
            <MaterialCommunityIcons name="close" size={16} color="rgba(255,255,255,0.7)" />
          </Pressable>
        </View>
      )}

      {/* ── Content ── */}
      {loading ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 14, gap: 12 }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </ScrollView>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={o => o.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={ORANGE} />
          }
          contentContainerStyle={{
            paddingTop: 12,
            paddingBottom: tabBarHeight + 16,
            paddingHorizontal: 14,
            flexGrow: 1,
            gap: 12,
          }}
          showsVerticalScrollIndicator={false}
          initialNumToRender={8}
          windowSize={5}
          maxToRenderPerBatch={6}
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
          ListEmptyComponent={<EmptyState tab={tabDef} />}
        />
      )}

      {/* ── Modals ── */}
      <CancelModal
        visible={!!cancelTarget}
        onConfirm={() => { if (cancelTarget) updateStatus(cancelTarget, "cancelled"); setCancelTarget(null); }}
        onCancel={() => setCancelTarget(null)}
      />
      <ETAModal
        visible={!!etaTarget}
        onConfirm={(mins) => { if (etaTarget) updateStatus(etaTarget, "confirmed", mins); setEtaTarget(null); }}
        onCancel={() => setEtaTarget(null)}
      />
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

// Tab bar
const ts = StyleSheet.create({
  bar:       { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: AppColors.divider, ...Shadows.xs },
  row:       { flexDirection: "row", paddingHorizontal: 12, paddingBottom: 10, gap: 6 },
  tab:       { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  label:     { fontFamily: FontFamily.cairoBold, fontSize: 13 },
  badge:     { borderRadius: 9, minWidth: 18, height: 18, justifyContent: "center", alignItems: "center", paddingHorizontal: 4 },
  badgeText: { fontFamily: FontFamily.cairoBold, fontSize: 10, color: AppColors.white },
});

// Banners
const bn = StyleSheet.create({
  newBanner: { flexDirection: "row-reverse", alignItems: "center", gap: 10, backgroundColor: AppColors.warning, paddingVertical: 12, paddingHorizontal: 16 },
  errBanner: { flexDirection: "row-reverse", alignItems: "center", gap: 10, backgroundColor: AppColors.error,   paddingVertical: 10, paddingHorizontal: 16 },
  text:      { flex: 1, fontFamily: FontFamily.cairoBold, fontSize: 14, color: AppColors.white, textAlign: "right" },
  close:     { padding: 4 },
});

// Order card
const oc = StyleSheet.create({
  card: {
    borderRadius: 20, overflow: "hidden",
    ...Shadows.md,
  },
  cardPending: {
    borderWidth: 2, borderColor: AppColors.warning,
  },
  accentBar: { position: "absolute", top: 0, bottom: 0, right: 0, width: 4 },
  header:    { flexDirection: "row-reverse", alignItems: "flex-start", paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, paddingRight: 20, gap: 10 },
  headerTop: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 6, gap: 8 },
  metaRow:   { flexDirection: "row-reverse", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 6 },
  badgeRow:  { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  orderId:   { fontFamily: FontFamily.cairoBold, fontSize: 15, color: AppColors.gray800 },
  timeText:  { fontFamily: FontFamily.tajawal, fontSize: 12, color: AppColors.gray400 },
  dot:       { fontSize: 12, color: AppColors.gray300 },
  itemCount: { fontFamily: FontFamily.tajawal, fontSize: 12, color: AppColors.gray400 },
  etaBadge:  { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, backgroundColor: AppColors.successLight },
  etaText:   { fontFamily: FontFamily.cairoBold, fontSize: 11, color: AppColors.success },
  headerRight:{ alignItems: "flex-end", gap: 2 },
  totalText: { fontFamily: FontFamily.cairoBold, fontSize: 17, color: AppColors.gray800, textAlign: "left" },
  totalUnit: { fontFamily: FontFamily.tajawal, fontSize: 11, color: AppColors.gray500, textAlign: "left" },

  divider:   { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },

  section:   { paddingHorizontal: 14, paddingVertical: 12, gap: 8 },
  sectionLabel: { fontFamily: FontFamily.cairoBold, fontSize: 13, color: AppColors.gray700, textAlign: "right", marginBottom: 4 },

  customerRow:    { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1 },
  customerAvatar: { width: 36, height: 36, borderRadius: 18, justifyContent: "center", alignItems: "center" },
  customerName:   { fontFamily: FontFamily.cairoBold, fontSize: 14, color: AppColors.gray800, textAlign: "right" },
  customerPhone:  { fontFamily: FontFamily.tajawal, fontSize: 12, color: AppColors.gray500, textAlign: "right", marginTop: 1 },

  infoRow:  { flexDirection: "row-reverse", alignItems: "flex-start", gap: 8 },
  infoText: { fontFamily: FontFamily.tajawal, fontSize: 12, color: AppColors.gray500, flex: 1, textAlign: "right", lineHeight: 18 },

  notesBox:  { flexDirection: "row-reverse", alignItems: "flex-start", gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  notesText: { fontFamily: FontFamily.tajawal, fontSize: 12, color: AppColors.primaryDark, flex: 1, textAlign: "right", lineHeight: 18 },

  itemRow:           { flexDirection: "row-reverse", alignItems: "center", paddingVertical: 8, gap: 10 },
  itemImg:           { width: 44, height: 44, borderRadius: 10, backgroundColor: AppColors.gray100 },
  itemImgPlaceholder:{ width: 44, height: 44, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  qtyBadge:          { minWidth: 28, height: 22, borderRadius: 8, justifyContent: "center", alignItems: "center", paddingHorizontal: 4 },
  qtyText:           { fontFamily: FontFamily.cairoBold, fontSize: 12 },
  itemName:          { flex: 1, fontFamily: FontFamily.cairoMedium, fontSize: 13, color: AppColors.gray800, textAlign: "right" },
  itemPrice:         { fontFamily: FontFamily.cairoBold, fontSize: 12, textAlign: "left" },

  breakdown:        { marginHorizontal: 14, marginBottom: 8, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 12, gap: 8 },
  breakdownDivider: { height: StyleSheet.hairlineWidth },

  actionsRow: { flexDirection: "row-reverse", gap: 10, padding: 14, paddingTop: 6 },
  actionBtn:  { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, borderRadius: 14 },
  actionText: { fontFamily: FontFamily.cairoBold, fontSize: 13 },

  printBtn:  { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginHorizontal: 14, marginBottom: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: AppColors.gray50, borderWidth: 1, borderColor: AppColors.gray200 },
  printText: { fontFamily: FontFamily.cairoMedium, fontSize: 13, color: AppColors.gray500 },
});
