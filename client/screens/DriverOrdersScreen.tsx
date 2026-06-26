import React, { useState, useCallback } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Platform,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ThemedText } from "@/components/ThemedText";
import { GradientBackground } from "@/components/GradientBackground";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { AppColors, Spacing, BorderRadius, Shadows } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";
import { formatPrice } from "@/constants/currency";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { CurrentBatch, BatchOrder } from "@/screens/DriverHomeScreen";

type Nav = NativeStackNavigationProp<RootStackParamList>;

// ─── Status chip config ───────────────────────────────────────────────────────
const STATUS_CFG: Record<string, { label: string; color: string; icon: keyof typeof Feather.glyphMap }> = {
  confirmed:   { label: "منتظر",             color: "#9E9E9E", icon: "clock" },
  preparing:   { label: "يُحضَّر",            color: "#8B5CF6", icon: "shopping-bag" },
  ready:       { label: "جاهز",              color: AppColors.primary, icon: "check-square" },
  picked_up:   { label: "استُلم",             color: "#FF9800", icon: "package" },
  in_delivery: { label: "في الطريق",          color: "#2196F3", icon: "navigation" },
  delivered:   { label: "مُوصَّل",            color: "#4CAF50", icon: "check-circle" },
};

// ─── Haversine distance ───────────────────────────────────────────────────────
function calcDist(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Nearest-Neighbor optimizer ───────────────────────────────────────────────
function optimizeRoute(orders: BatchOrder[], startLat: number, startLng: number): BatchOrder[] {
  if (orders.length <= 1) return orders;
  const remaining = [...orders];
  const result: BatchOrder[] = [];
  let curLat = startLat, curLng = startLng;
  while (remaining.length > 0) {
    let nearestIdx = 0;
    let shortest = calcDist(curLat, curLng, remaining[0].latitude ?? 0, remaining[0].longitude ?? 0);
    for (let i = 1; i < remaining.length; i++) {
      const d = calcDist(curLat, curLng, remaining[i].latitude ?? 0, remaining[i].longitude ?? 0);
      if (d < shortest) { shortest = d; nearestIdx = i; }
    }
    const nearest = remaining.splice(nearestIdx, 1)[0];
    result.push({ ...nearest, deliverySequence: result.length + 1 });
    curLat = nearest.latitude ?? 0;
    curLng = nearest.longitude ?? 0;
  }
  return result;
}

// ─── Confirm Modal ────────────────────────────────────────────────────────────
interface ConfirmModalProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  confirmColor?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}
function ConfirmModal({ visible, title, message, confirmLabel, confirmColor, loading, onConfirm, onCancel }: ConfirmModalProps) {
  const { theme } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.modalOverlay} onPress={loading ? undefined : onCancel}>
        <Pressable style={[styles.modalBox, { backgroundColor: theme.backgroundDefault }]} onPress={() => {}}>
          <ThemedText type="h4" style={{ color: theme.text, fontWeight: "700", textAlign: "center", marginBottom: Spacing.sm }}>
            {title}
          </ThemedText>
          <ThemedText type="body" style={{ color: theme.textSecondary, textAlign: "center", lineHeight: 24, marginBottom: Spacing.xl }}>
            {message}
          </ThemedText>
          <View style={styles.modalBtns}>
            <Pressable
              style={[styles.modalBtn, { borderColor: theme.border, borderWidth: 1 }]}
              onPress={onCancel}
              disabled={loading}
            >
              <ThemedText type="body" style={{ color: theme.textSecondary, fontWeight: "600" }}>إلغاء</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.modalBtn, { backgroundColor: confirmColor ?? AppColors.primary }]}
              onPress={onConfirm}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator size="small" color="#FFFFFF" />
                : <ThemedText type="body" style={{ color: "#FFFFFF", fontWeight: "700" }}>{confirmLabel}</ThemedText>
              }
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
interface DriverStatus {
  currentBatch: CurrentBatch | null;
  walletBalance: number;
}

export default function DriverOrdersScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const { phoneNumber } = useAuth();
  const navigation = useNavigation<Nav>();

  const [status, setStatus] = useState<DriverStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [optimized, setOptimized] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    confirmColor?: string;
    onConfirm: () => void;
  }>({ visible: false, title: "", message: "", confirmLabel: "", onConfirm: () => {} });

  // ─── Fetch ──────────────────────────────────────────────────────────────
  const fetchStatus = useCallback(async (isRefresh = false) => {
    if (!phoneNumber) return;
    if (isRefresh) setRefreshing(true);
    try {
      const res = await fetch(
        new URL(`/api/driver/status?phoneNumber=${encodeURIComponent(phoneNumber)}`, getApiUrl()).toString()
      );
      if (res.ok) {
        const data = await res.json();
        setStatus({
          currentBatch: data.currentBatch || null,
          walletBalance: data.walletBalance || 0,
        });
        setOptimized(false);
      }
    } catch (e) {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [phoneNumber]);

  useFocusEffect(
    useCallback(() => {
      fetchStatus();
      const interval = setInterval(() => fetchStatus(), 30000);
      return () => clearInterval(interval);
    }, [fetchStatus])
  );

  // ─── Optimize route client-side ─────────────────────────────────────────
  const handleOptimizeRoute = () => {
    if (!status?.currentBatch) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Use Baghdad center as fallback start point
    const sorted = optimizeRoute(status.currentBatch.orders, 33.3152, 44.3661);
    setStatus(prev => prev ? {
      ...prev,
      currentBatch: prev.currentBatch ? { ...prev.currentBatch, orders: sorted } : null,
    } : null);
    setOptimized(true);
  };

  // ─── Actions ────────────────────────────────────────────────────────────
  const showConfirm = (cfg: Omit<typeof confirmModal, "visible">) =>
    setConfirmModal({ ...cfg, visible: true });
  const hideConfirm = () => setConfirmModal(prev => ({ ...prev, visible: false }));

  const doPickup = async (order: BatchOrder) => {
    if (!phoneNumber || !status?.currentBatch) return;
    setActionLoading(true);
    try {
      const res = await fetch(new URL("/api/driver/batch/pickup-order", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber, orderId: order.id, batchId: status.currentBatch.id }),
      });
      if (res.ok) await fetchStatus();
    } catch (e) {
    } finally {
      setActionLoading(false);
      hideConfirm();
    }
  };

  const doDeliver = async (order: BatchOrder) => {
    if (!phoneNumber || !status?.currentBatch) return;
    setActionLoading(true);
    try {
      const res = await fetch(new URL("/api/driver/batch/complete-order", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber, orderId: order.id, batchId: status.currentBatch.id }),
      });
      if (res.ok) await fetchStatus();
    } catch (e) {
    } finally {
      setActionLoading(false);
      hideConfirm();
    }
  };

  const callCustomer = (phone: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const url = Platform.OS === "android" ? `tel:${phone}` : `telprompt:${phone}`;
    Linking.openURL(url).catch(() => Linking.openURL(`tel:${phone}`).catch(() => {}));
  };

  const openMap = (order: BatchOrder) => {
    const lat = order.latitude ?? order.customerLat;
    const lng = order.longitude ?? order.customerLng;
    if (!lat || !lng) return;
    const label = encodeURIComponent(order.address || order.region || "موقع الزبون");
    const url = Platform.OS === "ios"
      ? `maps:0,0?q=${label}@${lat},${lng}`
      : `geo:0,0?q=${lat},${lng}(${label})`;
    Linking.openURL(url).catch(() =>
      Linking.openURL(`https://maps.google.com/?q=${lat},${lng}`).catch(() => {})
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <View style={[styles.emptyIconBox, { backgroundColor: AppColors.primary + "15" }]}>
        <Feather name="package" size={48} color={AppColors.primary} />
      </View>
      <ThemedText type="h3" style={{ color: theme.text, fontWeight: "700", marginTop: Spacing.lg, textAlign: "center" }}>
        لا توجد طلبات نشطة
      </ThemedText>
      <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: Spacing.xs, textAlign: "center", lineHeight: 24 }}>
        ستظهر طلباتك هنا بعد قبول الدفعة من الشاشة الرئيسية
      </ThemedText>
    </View>
  );

  const renderOrderCard = (order: BatchOrder) => {
    const cfg = STATUS_CFG[order.status] || STATUS_CFG.confirmed;
    const canPickup = order.status === "preparing" || order.status === "ready";
    const canDeliver = order.status === "in_delivery" || order.status === "picked_up";
    const isDelivered = order.status === "delivered";
    const lat = order.latitude ?? order.customerLat;
    const lng = order.longitude ?? order.customerLng;
    const hasMap = !!(lat && lng);

    return (
      <View
        key={order.id}
        testID={`card-order-${order.id}`}
        style={[
          styles.orderCard,
          {
            backgroundColor: theme.backgroundDefault,
            borderColor: isDelivered ? "#4CAF5040" : cfg.color + "40",
            opacity: isDelivered ? 0.85 : 1,
          },
          Shadows.sm,
        ]}
      >
        {/* Sequence badge */}
        <View style={[styles.seqBadge, { backgroundColor: isDelivered ? "#4CAF50" : cfg.color }]}>
          {isDelivered
            ? <Feather name="check" size={14} color="#FFFFFF" />
            : <ThemedText type="small" style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 13 }}>{order.deliverySequence}</ThemedText>
          }
        </View>

        {/* Card header */}
        <View style={[styles.cardHeader, { borderBottomColor: theme.border }]}>
          <View style={[styles.statusChip, { backgroundColor: cfg.color + "20" }]}>
            <Feather name={cfg.icon} size={12} color={cfg.color} />
            <ThemedText type="small" style={{ color: cfg.color, fontWeight: "700", fontSize: 11 }}>{cfg.label}</ThemedText>
          </View>
          <View style={styles.cardHeaderRight}>
            <ThemedText type="h4" style={{ color: theme.text, fontWeight: "700" }}>
              {order.customerName || "زبون"}
            </ThemedText>
            <ThemedText type="h4" style={{ color: AppColors.primary, fontWeight: "800" }}>
              {formatPrice((order.totalPrice ?? order.total ?? 0) + (order.deliveryFee ?? 0))}
            </ThemedText>
          </View>
        </View>

        {/* Info rows */}
        <View style={styles.infoBlock}>
          {order.vendorName ? (
            <View style={styles.infoRow}>
              <ThemedText type="small" numberOfLines={1} style={{ color: theme.textSecondary, flex: 1, textAlign: "right" }}>
                {order.vendorName}
              </ThemedText>
              <Feather name="shopping-bag" size={14} color={theme.textSecondary} />
            </View>
          ) : null}
          <View style={styles.infoRow}>
            <ThemedText type="body" numberOfLines={2} style={{ color: theme.text, flex: 1, textAlign: "right" }}>
              {order.region || order.address || "العنوان غير محدد"}
            </ThemedText>
            <Feather name="map-pin" size={14} color={AppColors.primary} />
          </View>
          {order.customerPhone ? (
            <View style={styles.infoRow}>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>{order.customerPhone}</ThemedText>
              <Feather name="phone" size={13} color={theme.textSecondary} />
            </View>
          ) : null}
        </View>

        {/* Meta chips */}
        <View style={styles.metaRow}>
          {(order.distance ?? 0) > 0 ? (
            <View style={[styles.metaChip, { backgroundColor: "#2196F315" }]}>
              <Feather name="map" size={13} color="#2196F3" />
              <ThemedText type="small" style={{ color: "#2196F3", fontWeight: "600" }}>{order.distance} كم</ThemedText>
            </View>
          ) : null}
          {order.estimatedTime ? (
            <View style={[styles.metaChip, { backgroundColor: "#FF980015" }]}>
              <Feather name="clock" size={13} color="#FF9800" />
              <ThemedText type="small" style={{ color: "#FF9800", fontWeight: "600" }}>{order.estimatedTime}</ThemedText>
            </View>
          ) : null}
          <View style={[styles.metaChip, { backgroundColor: "#4CAF5015" }]}>
            <Feather name="dollar-sign" size={13} color="#4CAF50" />
            <ThemedText type="small" style={{ color: "#4CAF50", fontWeight: "600" }}>{formatPrice(order.deliveryFee ?? 0)}</ThemedText>
          </View>
        </View>

        {/* Items */}
        {order.items?.length > 0 ? (
          <View style={[styles.itemsBox, { backgroundColor: theme.backgroundRoot }]}>
            <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: 4 }}>المنتجات</ThemedText>
            {order.items.slice(0, 3).map((item: any, i: number) => (
              <ThemedText key={i} type="small" style={{ color: theme.text }}>
                {item.name} x{item.quantity}
              </ThemedText>
            ))}
            {order.items.length > 3 ? (
              <ThemedText type="small" style={{ color: theme.textSecondary }}>+{order.items.length - 3} أخرى</ThemedText>
            ) : null}
          </View>
        ) : null}

        {/* Notes */}
        {order.notes ? (
          <View style={[styles.notesBox, { backgroundColor: "#FFF3E0" }]}>
            <Feather name="alert-circle" size={14} color="#E65100" />
            <ThemedText type="small" style={{ color: "#E65100", flex: 1, textAlign: "right" }}>{order.notes}</ThemedText>
          </View>
        ) : null}

        {/* Quick actions */}
        <View style={styles.quickRow}>
          {order.customerPhone ? (
            <Pressable
              testID={`button-call-${order.id}`}
              style={[styles.quickBtn, { backgroundColor: "#4CAF5015" }]}
              onPress={() => callCustomer(order.customerPhone)}
            >
              <Feather name="phone" size={16} color="#4CAF50" />
              <ThemedText type="small" style={{ color: "#4CAF50", fontWeight: "600" }}>اتصال</ThemedText>
            </Pressable>
          ) : null}
          {hasMap ? (
            <Pressable
              testID={`button-map-${order.id}`}
              style={[styles.quickBtn, { backgroundColor: "#2196F315" }]}
              onPress={() => openMap(order)}
            >
              <Feather name="map" size={16} color="#2196F3" />
              <ThemedText type="small" style={{ color: "#2196F3", fontWeight: "600" }}>خريطة</ThemedText>
            </Pressable>
          ) : null}
        </View>

        {/* Primary action */}
        {isDelivered ? (
          <View style={[styles.deliveredBanner, { backgroundColor: "#4CAF5015" }]}>
            <Feather name="check-circle" size={18} color="#4CAF50" />
            <ThemedText type="body" style={{ color: "#4CAF50", fontWeight: "700" }}>تم التوصيل بنجاح</ThemedText>
          </View>
        ) : canDeliver ? (
          <Pressable
            testID={`button-deliver-${order.id}`}
            style={[styles.primaryBtn, { backgroundColor: "#4CAF50" }]}
            onPress={() => showConfirm({
              title: "تأكيد التوصيل",
              message: `هل تم توصيل الطلب لـ ${order.customerName || "الزبون"} بنجاح؟`,
              confirmLabel: "نعم، تم التوصيل",
              confirmColor: "#4CAF50",
              onConfirm: () => doDeliver(order),
            })}
          >
            <Feather name="check-circle" size={20} color="#FFFFFF" />
            <ThemedText type="h4" style={{ color: "#FFFFFF", fontWeight: "700" }}>تم التوصيل</ThemedText>
          </Pressable>
        ) : canPickup ? (
          <Pressable
            testID={`button-pickup-${order.id}`}
            style={[styles.primaryBtn, { backgroundColor: "#8B5CF6" }]}
            onPress={() => showConfirm({
              title: "تم الاستلام؟",
              message: `هل استلمت الطلب من ${order.vendorName || "المحل"}؟`,
              confirmLabel: "نعم، تم الاستلام",
              confirmColor: "#8B5CF6",
              onConfirm: () => doPickup(order),
            })}
          >
            <Feather name="package" size={20} color="#FFFFFF" />
            <ThemedText type="h4" style={{ color: "#FFFFFF", fontWeight: "700" }}>تم الاستلام من المحل</ThemedText>
          </Pressable>
        ) : (
          <View style={[styles.primaryBtn, { backgroundColor: "#9E9E9E" }]}>
            <Feather name="clock" size={18} color="#FFFFFF" />
            <ThemedText type="body" style={{ color: "#FFFFFF", fontWeight: "600" }}>بانتظار تجهيز الطلب</ThemedText>
          </View>
        )}
      </View>
    );
  };

  // ─── Root render ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center", backgroundColor: theme.backgroundRoot }]}>
        <ActivityIndicator size="large" color={AppColors.primary} />
      </View>
    );
  }

  const batch = status?.currentBatch ?? null;
  const orders = batch?.orders ?? [];
  const completedCount = orders.filter(o => o.status === "delivered").length;
  const totalOrders = batch?.totalOrders ?? orders.length;
  const progressPct = totalOrders > 0 ? Math.round((completedCount / totalOrders) * 100) : 0;

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <GradientBackground />

      {/* Confirm modal */}
      <ConfirmModal
        visible={confirmModal.visible}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmLabel={confirmModal.confirmLabel}
        confirmColor={confirmModal.confirmColor}
        loading={actionLoading}
        onConfirm={confirmModal.onConfirm}
        onCancel={hideConfirm}
      />

      {/* Header — flat themed, no gradient */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md, backgroundColor: theme.backgroundDefault }]}>
        <View style={styles.headerContent}>
          <View style={styles.headerLeft}>
            <ThemedText type="h3" style={[styles.headerTitle, { color: theme.text }]}>الطلبات النشطة</ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              {completedCount} مُوصَّل من {totalOrders}
            </ThemedText>
          </View>
          {orders.length > 0 ? (
            <View style={[styles.headerBadge, { backgroundColor: AppColors.primary + "15", borderWidth: 0 }]}>
              <ThemedText type="h3" style={[styles.headerBadgeText, { color: AppColors.primary }]}>{orders.length}</ThemedText>
              <ThemedText type="small" style={{ color: AppColors.primary + "CC", fontSize: 11 }}>نشط</ThemedText>
            </View>
          ) : null}
        </View>
        {totalOrders > 0 ? (
          <View style={[styles.headerProgressRow, { marginBottom: 2 }]}>
            <View style={[styles.progressBg, { backgroundColor: theme.border }]}>
              <View style={[styles.progressFill, { width: `${progressPct}%` as any, backgroundColor: AppColors.primary }]} />
            </View>
            <ThemedText type="small" style={[styles.headerProgressText, { color: AppColors.primary }]}>{progressPct}%</ThemedText>
          </View>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: tabBarHeight + Spacing.xl }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchStatus(true)}
            tintColor={AppColors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Orders section */}
        {orders.length > 0 ? (
          <View style={styles.section}>
            {/* Section header */}
            <View style={styles.sectionHeader}>
              <ThemedText type="h4" style={{ color: theme.text, fontWeight: "700" }}>
                الطلبات ({orders.length})
              </ThemedText>
              {orders.length > 1 ? (
                <Pressable
                  testID="button-optimize-route"
                  onPress={handleOptimizeRoute}
                  style={[styles.optimizeBtn, { backgroundColor: optimized ? "#4CAF5015" : "#8B5CF615" }]}
                >
                  <Feather name="navigation" size={14} color={optimized ? "#4CAF50" : "#8B5CF6"} />
                  <ThemedText type="small" style={{ color: optimized ? "#4CAF50" : "#8B5CF6", fontWeight: "700" }}>
                    {optimized ? "تم التحسين" : "تحسين المسار"}
                  </ThemedText>
                </Pressable>
              ) : null}
            </View>

            {orders.map(order => renderOrderCard(order))}
          </View>
        ) : renderEmptyState()}

        {/* Navigate to full batch screen */}
        {batch?.status === "in_progress" ? (
          <Pressable
            testID="button-manage-batch"
            style={[styles.manageBatchBtn, { backgroundColor: "#8B5CF6" }, Shadows.sm]}
            onPress={() => navigation.navigate("DriverBatch", { batch })}
          >
            <Feather name="list" size={20} color="#FFFFFF" />
            <ThemedText type="h4" style={{ color: "#FFFFFF", fontWeight: "700" }}>
              إدارة الدفعة بالتفصيل
            </ThemedText>
            <Feather name="chevron-left" size={20} color="#FFFFFF" />
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  // Header — flat
  header: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E020",
  },
  headerContent: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  headerLeft: { alignItems: "flex-end" },
  headerTitle: { fontWeight: "800" },
  headerBadge: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
    alignItems: "center",
  },
  headerBadgeText: { fontWeight: "800" },
  headerProgressRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Spacing.sm,
  },
  progressBg: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 3 },
  headerProgressText: { fontWeight: "700", width: 36, textAlign: "right" },
  // Scroll
  scrollContent: { padding: Spacing.lg },
  // Section
  section: { marginBottom: Spacing.lg },
  sectionHeader: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  optimizeBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: 20,
  },
  // Order card
  orderCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1.5,
  },
  seqBadge: {
    position: "absolute",
    top: -10,
    right: Spacing.lg,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#FFFFFF",
  },
  cardHeader: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    marginBottom: Spacing.sm,
    marginTop: Spacing.xs,
  },
  cardHeaderRight: { alignItems: "flex-end", gap: 2 },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  infoBlock: { gap: Spacing.xs, marginBottom: Spacing.sm },
  infoRow: { flexDirection: "row-reverse", alignItems: "flex-start", gap: Spacing.sm },
  metaRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: Spacing.sm, marginBottom: Spacing.sm },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  itemsBox: { padding: Spacing.sm, borderRadius: BorderRadius.sm, marginBottom: Spacing.sm, gap: 2 },
  notesBox: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Spacing.xs,
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.sm,
  },
  quickRow: { flexDirection: "row-reverse", gap: Spacing.sm, marginBottom: Spacing.sm },
  quickBtn: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  primaryBtn: {
    flexDirection: "row-reverse",
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md + 2,
    borderRadius: BorderRadius.md,
  },
  deliveredBanner: {
    flexDirection: "row-reverse",
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  // Empty state
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 60,
    paddingHorizontal: Spacing.xl,
  },
  emptyIconBox: { width: 100, height: 100, borderRadius: 50, justifyContent: "center", alignItems: "center" },
  // Manage batch button
  manageBatchBtn: {
    flexDirection: "row-reverse",
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.xl,
    marginTop: Spacing.md,
  },
  // Confirm modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  modalBox: {
    width: "100%",
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  modalBtns: { flexDirection: "row-reverse", gap: Spacing.md },
  modalBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
});
