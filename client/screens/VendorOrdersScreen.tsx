import React, { useCallback, useState, useMemo, useRef } from "react";
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

import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";
import { getApiUrl } from "@/lib/query-client";
import { useTheme } from "@/hooks/useTheme";

const ORANGE = "#E86520";
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
  pending:    { label: "طلب جديد",      color: "#D97706", bg: "#FFFBEB",  icon: "bell-ring" },
  confirmed:  { label: "مؤكد",          color: "#2563EB", bg: "#EFF6FF",  icon: "check-circle" },
  preparing:  { label: "قيد التحضير",  color: "#7C3AED", bg: "#F5F3FF",  icon: "chef-hat" },
  ready:      { label: "جاهز",          color: "#059669", bg: "#ECFDF5",  icon: "package-variant-closed-check" },
  picked_up:  { label: "استلمه السائق", color: "#0891B2", bg: "#ECFEFF",  icon: "moped" },
  delivering: { label: "في الطريق",     color: "#0284C7", bg: "#F0F9FF",  icon: "navigation" },
  delivered:  { label: "تم التوصيل",   color: "#16A34A", bg: "#F0FDF4",  icon: "check-all" },
  cancelled:  { label: "ملغي",          color: "#DC2626", bg: "#FFF5F5",  icon: "close-circle" },
};

// ── Tab definitions ────────────────────────────────────────────────────────────
const TABS = [
  { key: "new",      label: "جديد",    statuses: ["pending"],           icon: "bell-ring",             color: "#D97706" },
  { key: "active",   label: "تحضير",   statuses: ["confirmed","preparing"], icon: "chef-hat",           color: "#7C3AED" },
  { key: "ready",    label: "جاهز",    statuses: ["ready","picked_up"],  icon: "package-variant-closed-check", color: "#059669" },
  { key: "done",     label: "مكتمل",   statuses: ["delivered","delivering","cancelled"], icon: "check-all", color: "#6B7280" },
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
        { label: "قبول الطلب",   nextStatus: "confirmed", color: "#fff",     bg: "#16A34A", icon: "check",     primary: true },
        { label: "رفض",          nextStatus: "cancelled", color: "#DC2626",  bg: "#FEE2E2", icon: "close",     primary: false },
      ];
    case "confirmed":
      return [
        { label: "بدء التحضير",  nextStatus: "preparing", color: "#fff",     bg: ORANGE,    icon: "chef-hat",  primary: true },
        { label: "إلغاء",        nextStatus: "cancelled", color: "#DC2626",  bg: "#FEE2E2", icon: "close",     primary: false },
      ];
    case "preparing":
      return [
        { label: "الطلب جاهز",  nextStatus: "ready",     color: "#fff",     bg: "#059669", icon: "package-variant-closed-check", primary: true },
      ];
    default:
      return [];
  }
}

// ── Timer Badge for pending orders ────────────────────────────────────────────
function TimerBadge({ createdAt }: { createdAt: string }) {
  const mins = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
  const urgent = mins >= 5;
  return (
    <View style={[timerStyles.badge, { backgroundColor: urgent ? "#FEE2E2" : "#FEF3C7" }]}>
      <MaterialCommunityIcons name="timer-outline" size={13} color={urgent ? "#DC2626" : "#D97706"} />
      <ThemedText style={[timerStyles.text, { color: urgent ? "#DC2626" : "#D97706" }]}>
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
  badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: "#ECFDF5" },
  text: { fontFamily: "Cairo_700Bold", fontSize: 11, color: "#059669" },
});

// ── Per-status urgency thresholds (minutes) ───────────────────────────────────
const STATUS_URGENCY_THRESHOLD: Record<string, number> = {
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
function StatusTimerBadge({ status, statusAt }: { status: string; statusAt: string }) {
  if (!statusAt) return null;
  const label = STATUS_TIMER_LABEL[status];
  if (!label) return null;

  const mins = Math.floor((Date.now() - new Date(statusAt).getTime()) / 60000);
  const threshold = STATUS_URGENCY_THRESHOLD[status] ?? 15;
  const urgent = mins >= threshold;

  const normalColor = "#7C3AED";
  const normalBg = "#F5F3FF";

  return (
    <View style={[statusTimerStyles.badge, { backgroundColor: urgent ? "#FEE2E2" : normalBg }]}>
      <MaterialCommunityIcons name="clock-alert-outline" size={13} color={urgent ? "#DC2626" : normalColor} />
      <ThemedText style={[statusTimerStyles.text, { color: urgent ? "#DC2626" : normalColor }]}>
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
              {done ? <MaterialCommunityIcons name="check" size={8} color="#fff" /> : null}
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
  dotInactive: { backgroundColor: "#E5E7EB" },
  line: { flex: 1, height: 2, backgroundColor: "#E5E7EB" },
  lineActive: { backgroundColor: ORANGE },
});

// ── Order Card ─────────────────────────────────────────────────────────────────
function OrderCard({
  order,
  onUpdateStatus,
  updatingId,
}: {
  order: VendorOrder;
  onUpdateStatus: (id: string, status: string) => void;
  updatingId: string | null;
}) {
  const { theme } = useTheme();
  const [expanded, setExpanded] = useState(true);
  const cfg = STATUS_CFG[order.status] ?? { label: order.status, color: "#6B7280", bg: "#F3F4F6", icon: "help" };
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
              <StatusTimerBadge status={order.status} statusAt={currentStatusAt} />
            ) : null}
            {order.estimatedMinutes && order.estimatedMinutes > 0 ? (
              <View style={etaBadgeStyles.badge}>
                <MaterialCommunityIcons name="clock-fast" size={13} color="#059669" />
                <ThemedText style={etaBadgeStyles.text}>{order.estimatedMinutes} دقيقة</ThemedText>
              </View>
            ) : null}
            {order.paymentMethod ? (
              <View style={cardStyles.paymentBadge}>
                <MaterialCommunityIcons
                  name={order.paymentMethod === "cash" ? "cash" : "credit-card-outline"}
                  size={13}
                  color="#6B7280"
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
              <View style={[cardStyles.notesRow, { backgroundColor: "#FFFBEB", borderColor: "#FDE68A" }]}>
                <MaterialCommunityIcons name="note-text-outline" size={14} color="#D97706" />
                <ThemedText style={cardStyles.notesText} numberOfLines={3}>{order.notes}</ThemedText>
              </View>
            ) : null}
          </View>

          <View style={[cardStyles.divider, { backgroundColor: theme.border ?? "#F3F4F6" }]} />

          {/* Items with images */}
          <View style={cardStyles.itemsSection}>
            <ThemedText style={[cardStyles.sectionLabel, { color: theme.text }]}>
              المنتجات المطلوبة ({order.items?.length ?? 0})
            </ThemedText>
            {Array.isArray(order.items) && order.items.map((item, i) => (
              <View key={i} style={[cardStyles.itemRow, { borderBottomColor: theme.border ?? "#F3F4F6" }]}>
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

          {/* Total */}
          <View style={[cardStyles.totalRow, { backgroundColor: ORANGE + "08" }]}>
            <MaterialCommunityIcons name="cash-multiple" size={16} color={ORANGE} />
            <ThemedText style={cardStyles.totalLabel}>إجمالي المتجر</ThemedText>
            <ThemedText style={[cardStyles.totalAmount, { color: ORANGE }]}>
              {vendorTotal.toLocaleString("ar-IQ")} د.ع
            </ThemedText>
          </View>

          {/* Driver info section */}
          {order.status === "ready" ? (
            <View style={[cardStyles.driverBanner, { backgroundColor: "#ECFEFF" }]}>
              <MaterialCommunityIcons name="moped" size={20} color="#0891B2" />
              <View style={{ flex: 1 }}>
                <ThemedText style={[cardStyles.driverBannerText, { color: "#0891B2" }]}>
                  في انتظار السائق لاستلام الطلب
                </ThemedText>
              </View>
            </View>
          ) : (order.status === "picked_up" || order.status === "delivering") && order.driverName ? (
            <View style={[cardStyles.driverCard, { backgroundColor: "#F0F9FF", borderColor: "#BAE6FD" }]}>
              <View style={[cardStyles.driverAvatar, { backgroundColor: "#0891B2" }]}>
                <MaterialCommunityIcons name="moped" size={18} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={[cardStyles.driverName, { color: "#0369A1" }]}>
                  {order.driverName}
                </ThemedText>
                <ThemedText style={[cardStyles.driverSub, { color: "#0891B2" }]}>
                  {order.status === "picked_up" ? "استلم الطلب · في الطريق للزبون" : "في الطريق إلى الزبون"}
                </ThemedText>
                {order.driverPhone ? (
                  <ThemedText style={[cardStyles.driverSub, { color: "#64748B", marginTop: 1 }]}>
                    {order.driverPhone}
                  </ThemedText>
                ) : null}
              </View>
              <MaterialCommunityIcons name="navigation" size={18} color="#0891B2" />
            </View>
          ) : (order.status === "picked_up" || order.status === "delivering") ? (
            <View style={[cardStyles.driverBanner, { backgroundColor: "#F0F9FF" }]}>
              <MaterialCommunityIcons name="navigation" size={18} color="#0284C7" />
              <ThemedText style={[cardStyles.driverBannerText, { color: "#0284C7" }]}>
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
          <MaterialCommunityIcons name="clock-outline" size={44} color="#16A34A" style={{ alignSelf: "center" }} />
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
              style={[modalStyles.btn, { backgroundColor: "#16A34A" }]}
              onPress={handleConfirm}
              testID="btn-eta-confirm"
            >
              <ThemedText style={modalStyles.btnText}>
                {selected ? `قبول (${selected} دقيقة)` : "قبول بدون تحديد وقت"}
              </ThemedText>
            </Pressable>
            <Pressable style={[modalStyles.btn, { backgroundColor: "#F3F4F6" }]} onPress={handleCancel} testID="btn-eta-cancel">
              <ThemedText style={[modalStyles.btnText, { color: "#374151" }]}>تراجع</ThemedText>
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
    backgroundColor: "#F3F4F6", borderWidth: 2, borderColor: "transparent",
  },
  optionSelected: { backgroundColor: "#DCFCE7", borderColor: "#16A34A" },
  optionText: { fontFamily: "Cairo_700Bold", fontSize: 18, color: "#374151" },
  optionTextSelected: { color: "#15803D" },
  optionUnit: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "#6B7280" },
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
          <MaterialCommunityIcons name="alert-circle-outline" size={48} color="#DC2626" style={{ alignSelf: "center" }} />
          <ThemedText style={modalStyles.title}>رفض الطلب؟</ThemedText>
          <ThemedText style={modalStyles.subtitle}>سيتم إلغاء هذا الطلب وإشعار الزبون.</ThemedText>
          <View style={modalStyles.btns}>
            <Pressable style={[modalStyles.btn, { backgroundColor: "#DC2626" }]} onPress={onConfirm}>
              <ThemedText style={modalStyles.btnText}>نعم، إلغاء الطلب</ThemedText>
            </Pressable>
            <Pressable style={[modalStyles.btn, { backgroundColor: "#F3F4F6" }]} onPress={onCancel}>
              <ThemedText style={[modalStyles.btnText, { color: "#374151" }]}>تراجع</ThemedText>
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

  const [orders, setOrders] = useState<VendorOrder[]>([]);
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
      }
      prevNewCount.current = newPending;
      setOrders(incoming);
    } catch {} finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [vendorToken]);

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
        borderBottomColor: theme.border ?? "#F3F4F6",
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
                  color={active ? t.color : (theme.textSecondary ?? "#9CA3AF")}
                />
                <ThemedText style={[tabStyles.tabLabel, { color: active ? t.color : (theme.textSecondary ?? "#9CA3AF") }]}>
                  {t.label}
                </ThemedText>
                {count > 0 ? (
                  <View style={[tabStyles.badge, { backgroundColor: t.key === "new" && count > 0 ? "#EF4444" : t.color }]}>
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
          <MaterialCommunityIcons name="bell-ring" size={18} color="#fff" />
          <ThemedText style={bannerStyles.text}>وصل طلب جديد! اضغط لعرضه</ThemedText>
          <Pressable onPress={() => setNewArrived(false)} style={bannerStyles.closeBtn}>
            <MaterialCommunityIcons name="close" size={16} color="rgba(255,255,255,0.8)" />
          </Pressable>
        </Pressable>
      ) : null}

      {/* ── Status update error banner ── */}
      {updateError !== null ? (
        <View style={bannerStyles.errorBanner}>
          <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#fff" />
          <ThemedText style={bannerStyles.text}>{updateError}</ThemedText>
          <Pressable onPress={() => setUpdateError(null)} style={bannerStyles.closeBtn}>
            <MaterialCommunityIcons name="close" size={16} color="rgba(255,255,255,0.8)" />
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
              updatingId={updatingId}
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
  bar: { borderBottomWidth: 1, elevation: 2, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 4 },
  tabRow: { flexDirection: "row", paddingHorizontal: 12, gap: 4 },
  tab: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 2.5, borderBottomColor: "transparent",
  },
  tabLabel: { fontFamily: "Cairo_700Bold", fontSize: 13 },
  badge: { borderRadius: 9, minWidth: 18, height: 18, justifyContent: "center", alignItems: "center", paddingHorizontal: 4 },
  badgeText: { fontFamily: "Cairo_700Bold", fontSize: 10, color: "#fff" },
});

const cardStyles = StyleSheet.create({
  card: {
    borderRadius: 16, overflow: "hidden",
    shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  cardPending: {
    borderWidth: 2,
    borderColor: "#FCD34D",
    shadowColor: "#D97706",
    shadowOpacity: 0.15,
    elevation: 5,
  },
  paymentBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
    backgroundColor: "#F3F4F6",
  },
  paymentText: { fontFamily: "Cairo_700Bold", fontSize: 11, color: "#6B7280" },
  notesRow: {
    flexDirection: "row-reverse", alignItems: "flex-start", gap: 6,
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, borderWidth: 1,
  },
  notesText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "#92400E", flex: 1, textAlign: "right" },
  header: { flexDirection: "row-reverse", alignItems: "flex-start", padding: 16, gap: 10 },
  headerTop: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  headerMeta: { flexDirection: "row-reverse", alignItems: "center", gap: 8, flexWrap: "wrap" },
  orderId: { fontFamily: "Cairo_700Bold", fontSize: 16 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontFamily: "Cairo_700Bold", fontSize: 12 },
  timeText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "#9CA3AF" },
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
    backgroundColor: "#F3F4F6",
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

  totalRow: {
    flexDirection: "row-reverse", alignItems: "center",
    padding: 14, gap: 8, marginTop: 2,
  },
  totalLabel: { fontFamily: "Cairo_700Bold", fontSize: 14, color: ORANGE, flex: 1, textAlign: "right" },
  totalAmount: { fontFamily: "Cairo_700Bold", fontSize: 16 },

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
  actionBtnPrimary: { elevation: 2, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 4 },
  actionBtnSecondary: {},
  actionBtnText: { fontFamily: "Cairo_700Bold", fontSize: 13 },
});

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", alignItems: "center" },
  box: {
    backgroundColor: "#fff", borderRadius: 20, padding: 24,
    width: SCREEN_W * 0.85, gap: 12,
  },
  title: { fontFamily: "Cairo_700Bold", fontSize: 18, textAlign: "center", color: "#111" },
  subtitle: { fontFamily: "Cairo_400Regular", fontSize: 14, textAlign: "center", color: "#6B7280" },
  btns: { flexDirection: "column", gap: 8, marginTop: 8 },
  btn: { borderRadius: 12, paddingVertical: 13, alignItems: "center" },
  btnText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },
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
    backgroundColor: "#D97706", paddingVertical: 12, paddingHorizontal: 16,
  },
  errorBanner: {
    flexDirection: "row-reverse", alignItems: "center", gap: 10,
    backgroundColor: "#DC2626", paddingVertical: 12, paddingHorizontal: 16,
  },
  text: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff", textAlign: "right" },
  closeBtn: { padding: 4 },
});
