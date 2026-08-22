import React, { useState, useCallback } from "react";
import {
  Alert,
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
import { EmptyState } from "@/components/EmptyState";
import { ErrorState, LoadingState } from "@/components/ScreenState";
import { GradientBackground } from "@/components/GradientBackground";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import {
  AppColors,
  Spacing,
  BorderRadius,
  Shadows,
  FontWeight,
} from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";
import { DHULUIYAH_CENTER } from "@/lib/geocoding";
import { formatPrice } from "@/constants/currency";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { CurrentBatch, BatchOrder } from "@/screens/DriverHomeScreen";

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * The message the server sent with a failed response (H-28).
 *
 * Same defect as DriverBatchScreen: pickup and deliver only acted `if (res.ok)`, so a
 * 409 ("حدّث الصفحة وحاول مجدداً") or a 503 ("حاول مرة أخرى") produced no message and
 * no resync — the spinner simply stopped. Every driver endpoint returns
 * `{ error: "<Arabic message>" }` on failure.
 */
async function serverError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => null)) as {
    error?: unknown;
  } | null;
  return typeof data?.error === "string" && data.error.trim()
    ? data.error
    : "حاول مرة أخرى";
}

const CONNECTION_ERROR =
  "تعذّر الاتصال بالخادم، تحقّق من الإنترنت وحاول مجدداً";

// ─── Status chip config ───────────────────────────────────────────────────────
const STATUS_CFG: Record<
  string,
  { label: string; color: string; icon: keyof typeof Feather.glyphMap }
> = {
  confirmed: { label: "منتظر", color: AppColors.gray400, icon: "clock" },
  preparing: {
    label: "يُحضَّر",
    color: AppColors.statusPurple,
    icon: "shopping-bag",
  },
  ready: { label: "جاهز", color: AppColors.primary, icon: "check-square" },
  picked_up: { label: "استُلم", color: AppColors.warning, icon: "package" },
  in_delivery: {
    label: "في الطريق",
    color: AppColors.info,
    icon: "navigation",
  },
  delivered: {
    label: "مُوصَّل",
    color: AppColors.success,
    icon: "check-circle",
  },
};

// ─── Haversine distance ───────────────────────────────────────────────────────
function calcDist(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Does this order carry a usable map pin? (H-58)
 *
 * Same validity rule the server already applies to store coordinates in
 * vendor.ts:371 — finite numbers inside the real lat/lng ranges — rather than a
 * new one invented here.
 *
 * An order legitimately has no pin: POST /api/orders only writes latitude and
 * longitude when the customer actually set one (routes.ts:2912), and
 * /api/driver/status then sends `order.latitude || null` (routes.ts:4332), so a
 * missing field, an explicit null and a stored 0 all reach this screen as null.
 * That `||` is also why a literal 0 cannot mean "a real pin on the equator" here.
 */
function hasPin(
  order: BatchOrder,
): order is BatchOrder & { latitude: number; longitude: number } {
  const { latitude: lat, longitude: lng } = order;
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

// ─── Nearest-Neighbor optimizer ───────────────────────────────────────────────
function optimizeRoute(
  orders: BatchOrder[],
  startLat: number,
  startLng: number,
): BatchOrder[] {
  if (orders.length <= 1) return orders;

  // H-58: coordinates used to be coerced with `?? 0`, so an order without a pin
  // was routed as if it sat at (0,0) — 5,928 km from the Baghdad start point. Two
  // consequences: the order was placed by a distance it never had, and once it was
  // visited `curLat/curLng` became (0,0), measuring every later leg from the Gulf
  // of Guinea. `??` also let NaN through untouched, and a NaN first element makes
  // every `d < shortest` false, so that order is picked first and the optimiser
  // collapses to input order from then on.
  //
  // An order with no usable pin simply cannot take part in a distance calculation,
  // so it is kept out of one. It stays in the batch — the driver still has the
  // address text — in its original relative order, after the routed ones.
  const routable = orders.filter(hasPin);
  const unlocated = orders.filter((order) => !hasPin(order));

  const remaining = [...routable];
  const result: (typeof routable)[number][] = [];
  let curLat = startLat,
    curLng = startLng;
  while (remaining.length > 0) {
    let nearestIdx = 0;
    let shortest = calcDist(
      curLat,
      curLng,
      remaining[0].latitude,
      remaining[0].longitude,
    );
    for (let i = 1; i < remaining.length; i++) {
      const d = calcDist(
        curLat,
        curLng,
        remaining[i].latitude,
        remaining[i].longitude,
      );
      if (d < shortest) {
        shortest = d;
        nearestIdx = i;
      }
    }
    const nearest = remaining.splice(nearestIdx, 1)[0];
    result.push(nearest);
    curLat = nearest.latitude;
    curLng = nearest.longitude;
  }

  return [...result, ...unlocated].map((order, index) => ({
    ...order,
    deliverySequence: index + 1,
  }));
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
function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel,
  confirmColor,
  loading,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const { theme } = useTheme();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <Pressable
        accessibilityRole="button"
        style={styles.modalOverlay}
        onPress={loading ? undefined : onCancel}
      >
        <Pressable
          accessibilityRole="button"
          style={[
            styles.modalBox,
            { backgroundColor: theme.backgroundDefault },
          ]}
          onPress={() => {}}
        >
          <ThemedText
            type="h4"
            style={{
              color: theme.text,
              fontWeight: FontWeight.bold,
              textAlign: "center",
              marginBottom: Spacing.sm,
            }}
          >
            {title}
          </ThemedText>
          <ThemedText
            type="body"
            style={{
              color: theme.textSecondary,
              textAlign: "center",
              lineHeight: 24,
              marginBottom: Spacing.xl,
            }}
          >
            {message}
          </ThemedText>
          <View style={styles.modalBtns}>
            <Pressable
              accessibilityRole="button"
              style={[
                styles.modalBtn,
                { borderColor: theme.border, borderWidth: 1 },
              ]}
              onPress={onCancel}
              disabled={loading}
            >
              <ThemedText
                type="body"
                style={{
                  color: theme.textSecondary,
                  fontWeight: FontWeight.semiBold,
                }}
              >
                إلغاء
              </ThemedText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={[
                styles.modalBtn,
                { backgroundColor: confirmColor ?? AppColors.primary },
              ]}
              onPress={onConfirm}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color={AppColors.white} />
              ) : (
                <ThemedText
                  type="body"
                  style={{
                    color: AppColors.white,
                    fontWeight: FontWeight.bold,
                  }}
                >
                  {confirmLabel}
                </ThemedText>
              )}
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
  // H-29: "the load failed" and "there is genuinely nothing to do" are different
  // answers, and the screen used to give the second one for both.
  const [loadError, setLoadError] = useState(false);
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
  }>({
    visible: false,
    title: "",
    message: "",
    confirmLabel: "",
    onConfirm: () => {},
  });

  // ─── Fetch ──────────────────────────────────────────────────────────────
  const fetchStatus = useCallback(
    async (isRefresh = false) => {
      if (!phoneNumber) return;
      if (isRefresh) setRefreshing(true);
      try {
        const res = await fetch(
          new URL(
            `/api/driver/status?phoneNumber=${encodeURIComponent(phoneNumber)}`,
            getApiUrl(),
          ).toString(),
        );
        // H-29: this used to be `if (res.ok) { ... }` with no else and an empty catch,
        // while `finally` cleared `loading` regardless. A failed first load therefore
        // left status null AND loading false, and the render fell through to the
        // "لا توجد طلبات نشطة" empty state — telling a driver who has a live batch that
        // they have no work. On a bike in Dhuluiyah a dropped request is routine; a
        // driver who believes the screen can stop working and go home.
        if (!res.ok) {
          setLoadError(true);
          return;
        }
        const data = await res.json();
        setStatus({
          currentBatch: data.currentBatch || null,
          walletBalance: data.walletBalance || 0,
        });
        setOptimized(false);
        setLoadError(false);
      } catch {
        setLoadError(true);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [phoneNumber],
  );

  useFocusEffect(
    useCallback(() => {
      fetchStatus();
      const interval = setInterval(() => fetchStatus(), 30000);
      return () => clearInterval(interval);
    }, [fetchStatus]),
  );

  // ─── Optimize route client-side ─────────────────────────────────────────
  const handleOptimizeRoute = () => {
    if (!status?.currentBatch) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // H-59: the start point was hardcoded to Baghdad (33.3152, 44.3661) — 79 km
    // from the only district OnWay actually serves, so the first leg of every
    // optimised route was measured from a city the driver is never in. Use the
    // service-area centre the app already defines and already falls back to on both
    // map-picker screens; nothing new is invented here.
    const sorted = optimizeRoute(
      status.currentBatch.orders,
      DHULUIYAH_CENTER.lat,
      DHULUIYAH_CENTER.lng,
    );
    setStatus((prev) =>
      prev
        ? {
            ...prev,
            currentBatch: prev.currentBatch
              ? { ...prev.currentBatch, orders: sorted }
              : null,
          }
        : null,
    );
    setOptimized(true);
  };

  // ─── Actions ────────────────────────────────────────────────────────────
  const showConfirm = (cfg: Omit<typeof confirmModal, "visible">) =>
    setConfirmModal({ ...cfg, visible: true });
  const hideConfirm = () =>
    setConfirmModal((prev) => ({ ...prev, visible: false }));

  const doPickup = async (order: BatchOrder) => {
    if (!phoneNumber || !status?.currentBatch) return;
    setActionLoading(true);
    try {
      const res = await fetch(
        new URL("/api/driver/batch/pickup-order", getApiUrl()).toString(),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phoneNumber,
            orderId: order.id,
            batchId: status.currentBatch.id,
          }),
        },
      );
      // H-28: resync on failure too — the server rejects a pickup precisely when this
      // screen's copy of the batch is stale, so the refresh IS the correction.
      if (!res.ok) {
        Alert.alert("تعذّر استلام الطلب", await serverError(res));
      }
      await fetchStatus();
    } catch {
      Alert.alert("خطأ", CONNECTION_ERROR);
    } finally {
      setActionLoading(false);
      hideConfirm();
    }
  };

  const doDeliver = async (order: BatchOrder) => {
    if (!phoneNumber || !status?.currentBatch) return;
    setActionLoading(true);
    try {
      const res = await fetch(
        new URL("/api/driver/batch/complete-order", getApiUrl()).toString(),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phoneNumber,
            orderId: order.id,
            batchId: status.currentBatch.id,
          }),
        },
      );
      // H-28: the money-critical action. A lost delivery report leaves the order at
      // "picked_up" with no settlement accrual and an open batch, so the driver stays
      // busy in the dispatch engine. `{ alreadyCompleted: true }` is a 200 and stays
      // on the success path.
      if (!res.ok) {
        Alert.alert("تعذّر تسليم الطلب", await serverError(res));
      }
      await fetchStatus();
    } catch {
      Alert.alert("خطأ", CONNECTION_ERROR);
    } finally {
      setActionLoading(false);
      hideConfirm();
    }
  };

  const callCustomer = (phone: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const url =
      Platform.OS === "android" ? `tel:${phone}` : `telprompt:${phone}`;
    Linking.openURL(url).catch(() =>
      Linking.openURL(`tel:${phone}`).catch(() => {}),
    );
  };

  const openMap = (order: BatchOrder) => {
    const lat = order.latitude ?? order.customerLat;
    const lng = order.longitude ?? order.customerLng;
    if (!lat || !lng) return;
    const label = encodeURIComponent(
      order.address || order.region || "موقع الزبون",
    );
    const url =
      Platform.OS === "ios"
        ? `maps:0,0?q=${label}@${lat},${lng}`
        : `geo:0,0?q=${lat},${lng}(${label})`;
    Linking.openURL(url).catch(() =>
      Linking.openURL(`https://maps.google.com/?q=${lat},${lng}`).catch(
        () => {},
      ),
    );
  };

  const renderEmptyState = () => (
    <EmptyState
      icon="cube-outline"
      title="لا توجد طلبات نشطة"
      subtitle="ستظهر طلباتك هنا بعد قبول الدفعة من الشاشة الرئيسية"
    />
  );

  // H-29: shown instead of the empty state when the screen has never managed to load.
  // Same layout as renderEmptyState, different icon, colour and words, so a driver can
  // tell "nothing assigned to me" apart from "I could not reach the server".
  // Pull-to-refresh below is the retry — nothing is re-sent automatically.
  const renderLoadError = () => (
    <ErrorState
      title="تعذّر تحميل طلباتك"
      message="تحقّق من الإنترنت وحاول مرة أخرى."
      onRetry={() => void fetchStatus(true)}
    />
  );

  const renderOrderCard = (order: BatchOrder) => {
    const cfg = STATUS_CFG[order.status] || STATUS_CFG.confirmed;
    const canPickup = order.status === "preparing" || order.status === "ready";
    const canDeliver =
      order.status === "in_delivery" || order.status === "picked_up";
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
        <View
          style={[
            styles.seqBadge,
            { backgroundColor: isDelivered ? AppColors.success : cfg.color },
          ]}
        >
          {isDelivered ? (
            <Feather name="check" size={14} color={AppColors.white} />
          ) : (
            <ThemedText
              type="small"
              style={{
                color: AppColors.white,
                fontWeight: FontWeight.xBold,
                fontSize: 13,
              }}
            >
              {order.deliverySequence}
            </ThemedText>
          )}
        </View>

        {/* Card header */}
        <View style={[styles.cardHeader, { borderBottomColor: theme.border }]}>
          <View
            style={[styles.statusChip, { backgroundColor: cfg.color + "20" }]}
          >
            <Feather name={cfg.icon} size={12} color={cfg.color} />
            <ThemedText
              type="small"
              style={{
                color: cfg.color,
                fontWeight: FontWeight.bold,
                fontSize: 11,
              }}
            >
              {cfg.label}
            </ThemedText>
          </View>
          <View style={styles.cardHeaderRight}>
            <ThemedText
              type="h4"
              style={{ color: theme.text, fontWeight: FontWeight.bold }}
            >
              {order.customerName || "زبون"}
            </ThemedText>
            <ThemedText
              type="h4"
              style={{ color: AppColors.primary, fontWeight: FontWeight.xBold }}
            >
              {formatPrice(order.total ?? 0)}
            </ThemedText>
          </View>
        </View>

        {/* Info rows */}
        <View style={styles.infoBlock}>
          {order.vendorName ? (
            <View style={styles.infoRow}>
              <ThemedText
                type="small"
                numberOfLines={1}
                style={{
                  color: theme.textSecondary,
                  flex: 1,
                  textAlign: "right",
                }}
              >
                {order.vendorName}
              </ThemedText>
              <Feather
                name="shopping-bag"
                size={14}
                color={theme.textSecondary}
              />
            </View>
          ) : null}
          <View style={styles.infoRow}>
            <ThemedText
              type="body"
              numberOfLines={2}
              style={{ color: theme.text, flex: 1, textAlign: "right" }}
            >
              {order.region || order.address || "العنوان غير محدد"}
            </ThemedText>
            <Feather name="map-pin" size={14} color={AppColors.primary} />
          </View>
          {order.customerPhone ? (
            <View style={styles.infoRow}>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                {order.customerPhone}
              </ThemedText>
              <Feather name="phone" size={13} color={theme.textSecondary} />
            </View>
          ) : null}
        </View>

        {/* Meta chips */}
        <View style={styles.metaRow}>
          {(order.distance ?? 0) > 0 ? (
            <View style={[styles.metaChip, { backgroundColor: "#2196F315" }]}>
              <Feather name="map" size={13} color={AppColors.info} />
              <ThemedText
                type="small"
                style={{
                  color: AppColors.info,
                  fontWeight: FontWeight.semiBold,
                }}
              >
                {order.distance} كم
              </ThemedText>
            </View>
          ) : null}
          {order.estimatedTime ? (
            <View style={[styles.metaChip, { backgroundColor: "#FF980015" }]}>
              <Feather name="clock" size={13} color={AppColors.warning} />
              <ThemedText
                type="small"
                style={{
                  color: AppColors.warning,
                  fontWeight: FontWeight.semiBold,
                }}
              >
                {order.estimatedTime}
              </ThemedText>
            </View>
          ) : null}
          <View style={[styles.metaChip, { backgroundColor: "#4CAF5015" }]}>
            <Feather name="dollar-sign" size={13} color={AppColors.success} />
            <ThemedText
              type="small"
              style={{
                color: AppColors.success,
                fontWeight: FontWeight.semiBold,
              }}
            >
              {formatPrice(order.deliveryFee ?? 0)}
            </ThemedText>
          </View>
        </View>

        {/* Items */}
        {order.items?.length > 0 ? (
          <View
            style={[styles.itemsBox, { backgroundColor: theme.backgroundRoot }]}
          >
            <ThemedText
              type="small"
              style={{ color: theme.textSecondary, marginBottom: 4 }}
            >
              المنتجات
            </ThemedText>
            {order.items.slice(0, 3).map((item: any, i: number) => (
              <ThemedText key={i} type="small" style={{ color: theme.text }}>
                {item.name} x{item.quantity}
              </ThemedText>
            ))}
            {order.items.length > 3 ? (
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                +{order.items.length - 3} أخرى
              </ThemedText>
            ) : null}
          </View>
        ) : null}

        {/* Notes */}
        {order.notes ? (
          <View
            style={[styles.notesBox, { backgroundColor: AppColors.secondary }]}
          >
            <Feather name="alert-circle" size={14} color={AppColors.primary} />
            <ThemedText
              type="small"
              style={{ color: AppColors.primary, flex: 1, textAlign: "right" }}
            >
              {order.notes}
            </ThemedText>
          </View>
        ) : null}

        {/* Quick actions */}
        <View style={styles.quickRow}>
          {order.customerPhone ? (
            <Pressable
              accessibilityRole="button"
              testID={`button-call-${order.id}`}
              style={[styles.quickBtn, { backgroundColor: "#4CAF5015" }]}
              onPress={() => callCustomer(order.customerPhone)}
            >
              <Feather name="phone" size={16} color={AppColors.success} />
              <ThemedText
                type="small"
                style={{
                  color: AppColors.success,
                  fontWeight: FontWeight.semiBold,
                }}
              >
                اتصال
              </ThemedText>
            </Pressable>
          ) : null}
          {hasMap ? (
            <Pressable
              accessibilityRole="button"
              testID={`button-map-${order.id}`}
              style={[styles.quickBtn, { backgroundColor: "#2196F315" }]}
              onPress={() => openMap(order)}
            >
              <Feather name="map" size={16} color={AppColors.info} />
              <ThemedText
                type="small"
                style={{
                  color: AppColors.info,
                  fontWeight: FontWeight.semiBold,
                }}
              >
                خريطة
              </ThemedText>
            </Pressable>
          ) : null}
        </View>

        {/* Primary action */}
        {isDelivered ? (
          <View
            style={[styles.deliveredBanner, { backgroundColor: "#4CAF5015" }]}
          >
            <Feather name="check-circle" size={18} color={AppColors.success} />
            <ThemedText
              type="body"
              style={{ color: AppColors.success, fontWeight: FontWeight.bold }}
            >
              تم التوصيل بنجاح
            </ThemedText>
          </View>
        ) : canDeliver ? (
          <Pressable
            accessibilityRole="button"
            testID={`button-deliver-${order.id}`}
            style={[styles.primaryBtn, { backgroundColor: AppColors.success }]}
            onPress={() =>
              showConfirm({
                title: "تأكيد التوصيل",
                message: `هل تم توصيل الطلب لـ ${order.customerName || "الزبون"} بنجاح؟`,
                confirmLabel: "نعم، تم التوصيل",
                confirmColor: AppColors.success,
                onConfirm: () => doDeliver(order),
              })
            }
          >
            <Feather name="check-circle" size={20} color={AppColors.white} />
            <ThemedText
              type="h4"
              style={{ color: AppColors.white, fontWeight: FontWeight.bold }}
            >
              تم التوصيل
            </ThemedText>
          </Pressable>
        ) : canPickup ? (
          <Pressable
            accessibilityRole="button"
            testID={`button-pickup-${order.id}`}
            style={[
              styles.primaryBtn,
              { backgroundColor: AppColors.statusPurple },
            ]}
            onPress={() =>
              showConfirm({
                title: "تم الاستلام؟",
                message: `هل استلمت الطلب من ${order.vendorName || "المحل"}؟`,
                confirmLabel: "نعم، تم الاستلام",
                confirmColor: AppColors.statusPurple,
                onConfirm: () => doPickup(order),
              })
            }
          >
            <Feather name="package" size={20} color={AppColors.white} />
            <ThemedText
              type="h4"
              style={{ color: AppColors.white, fontWeight: FontWeight.bold }}
            >
              تم الاستلام من المحل
            </ThemedText>
          </Pressable>
        ) : (
          <View
            style={[styles.primaryBtn, { backgroundColor: AppColors.gray400 }]}
          >
            <Feather name="clock" size={18} color={AppColors.white} />
            <ThemedText
              type="body"
              style={{
                color: AppColors.white,
                fontWeight: FontWeight.semiBold,
              }}
            >
              بانتظار تجهيز الطلب
            </ThemedText>
          </View>
        )}
      </View>
    );
  };

  // ─── Root render ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <LoadingState
        label="جاري تحميل طلباتك..."
        style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      />
    );
  }

  const batch = status?.currentBatch ?? null;
  const orders = batch?.orders ?? [];
  const completedCount = orders.filter((o) => o.status === "delivered").length;
  const totalOrders = batch?.totalOrders ?? orders.length;
  const progressPct =
    totalOrders > 0 ? Math.round((completedCount / totalOrders) * 100) : 0;

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
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + Spacing.md,
            backgroundColor: theme.backgroundDefault,
          },
        ]}
      >
        <View style={styles.headerContent}>
          <View style={styles.headerLeft}>
            <ThemedText
              type="h3"
              style={[styles.headerTitle, { color: theme.text }]}
            >
              الطلبات النشطة
            </ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              {completedCount} مُوصَّل من {totalOrders}
            </ThemedText>
          </View>
          {orders.length > 0 ? (
            <View
              style={[
                styles.headerBadge,
                { backgroundColor: AppColors.primary + "15", borderWidth: 0 },
              ]}
            >
              <ThemedText
                type="h3"
                style={[styles.headerBadgeText, { color: AppColors.primary }]}
              >
                {orders.length}
              </ThemedText>
              <ThemedText
                type="small"
                style={{ color: AppColors.primary + "CC", fontSize: 11 }}
              >
                نشط
              </ThemedText>
            </View>
          ) : null}
        </View>
        {totalOrders > 0 ? (
          <View style={[styles.headerProgressRow, { marginBottom: 2 }]}>
            <View
              style={[styles.progressBg, { backgroundColor: theme.border }]}
            >
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${progressPct}%` as any,
                    backgroundColor: AppColors.primary,
                  },
                ]}
              />
            </View>
            <ThemedText
              type="small"
              style={[styles.headerProgressText, { color: AppColors.primary }]}
            >
              {progressPct}%
            </ThemedText>
          </View>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: tabBarHeight + Spacing.xl },
        ]}
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
              <ThemedText
                type="h4"
                style={{ color: theme.text, fontWeight: FontWeight.bold }}
              >
                الطلبات ({orders.length})
              </ThemedText>
              {orders.length > 1 ? (
                <Pressable
                  accessibilityRole="button"
                  testID="button-optimize-route"
                  onPress={handleOptimizeRoute}
                  style={[
                    styles.optimizeBtn,
                    { backgroundColor: optimized ? "#4CAF5015" : "#8B5CF615" },
                  ]}
                >
                  <Feather
                    name="navigation"
                    size={14}
                    color={
                      optimized ? AppColors.success : AppColors.statusPurple
                    }
                  />
                  <ThemedText
                    type="small"
                    style={{
                      color: optimized
                        ? AppColors.success
                        : AppColors.statusPurple,
                      fontWeight: FontWeight.bold,
                    }}
                  >
                    {optimized ? "تم التحسين" : "تحسين المسار"}
                  </ThemedText>
                </Pressable>
              ) : null}
            </View>

            {orders.map((order) => renderOrderCard(order))}
          </View>
        ) : loadError && status === null ? (
          // H-29: only when nothing has ever loaded. Once a real answer has arrived,
          // a later failed refresh keeps showing it — stale data beats a blank screen.
          renderLoadError()
        ) : (
          renderEmptyState()
        )}

        {/* Navigate to full batch screen */}
        {batch?.status === "in_progress" ? (
          <Pressable
            accessibilityRole="button"
            testID="button-manage-batch"
            style={[
              styles.manageBatchBtn,
              { backgroundColor: AppColors.statusPurple },
              Shadows.sm,
            ]}
            onPress={() => navigation.navigate("DriverBatch", { batch })}
          >
            <Feather name="list" size={20} color={AppColors.white} />
            <ThemedText
              type="h4"
              style={{ color: AppColors.white, fontWeight: FontWeight.bold }}
            >
              إدارة الدفعة بالتفصيل
            </ThemedText>
            <Feather name="chevron-left" size={20} color={AppColors.white} />
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
  headerTitle: { fontWeight: FontWeight.xBold },
  headerBadge: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
    alignItems: "center",
  },
  headerBadgeText: { fontWeight: FontWeight.xBold },
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
  headerProgressText: {
    fontWeight: FontWeight.bold,
    width: 36,
    textAlign: "right",
  },
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
    borderColor: AppColors.white,
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
  infoRow: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    gap: Spacing.sm,
  },
  metaRow: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  itemsBox: {
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.sm,
    gap: 2,
  },
  notesBox: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Spacing.xs,
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.sm,
  },
  quickRow: {
    flexDirection: "row-reverse",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
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
  emptyIconBox: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
  },
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
    backgroundColor: AppColors.overlay,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  modalBox: {
    width: "100%",
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    shadowColor: AppColors.black,
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
