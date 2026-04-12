import React, { useState, useCallback } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Linking,
  Platform,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";

import { ThemedText } from "@/components/ThemedText";
import { GradientBackground } from "@/components/GradientBackground";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { AppColors, Spacing, BorderRadius, Shadows } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";
import { formatPrice } from "@/constants/currency";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { CurrentBatch, BatchOrder } from "@/screens/DriverHomeScreen";

type BatchScreenRoute = RouteProp<RootStackParamList, "DriverBatch">;

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: keyof typeof Feather.glyphMap }> = {
  confirmed:   { label: "منتظر", color: "#9E9E9E", icon: "clock" },
  preparing:   { label: "يُحضَّر", color: "#8B5CF6", icon: "shopping-bag" },
  ready:       { label: "جاهز للاستلام", color: AppColors.primary, icon: "check-square" },
  picked_up:   { label: "استُلم", color: "#FF9800", icon: "package" },
  in_delivery: { label: "في الطريق", color: "#2196F3", icon: "navigation" },
  delivered:   { label: "تم التوصيل", color: "#4CAF50", icon: "check-circle" },
};

export default function DriverBatchScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { phoneNumber } = useAuth();
  const navigation = useNavigation();
  const route = useRoute<BatchScreenRoute>();

  const [batch, setBatch] = useState<CurrentBatch>(route.params.batch);
  const [loadingOrderId, setLoadingOrderId] = useState<string | null>(null);
  const [isRejecting, setIsRejecting] = useState(false);

  const [issueModalVisible, setIssueModalVisible] = useState(false);
  const [issueSent, setIssueSent] = useState(false);
  const [issueSending, setIssueSending] = useState(false);
  const [issueOrderId, setIssueOrderId] = useState<string | null>(null);

  const ISSUE_OPTIONS = [
    { key: "no_answer", label: "الزبون ما يرد" },
    { key: "unclear_address", label: "العنوان غير واضح" },
    { key: "other", label: "مشكلة أخرى" },
  ];

  const refreshBatch = useCallback(async () => {
    if (!phoneNumber) return;
    try {
      const res = await fetch(
        new URL(`/api/driver/status?phoneNumber=${encodeURIComponent(phoneNumber)}`, getApiUrl()).toString()
      );
      if (res.ok) {
        const data = await res.json();
        if (data.currentBatch) {
          setBatch(data.currentBatch);
        }
      }
    } catch (e) {}
  }, [phoneNumber]);

  const getCurrentLocation = async (): Promise<{ lat?: number; lng?: number }> => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== "granted") return {};
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      return { lat: loc.coords.latitude, lng: loc.coords.longitude };
    } catch {
      return {};
    }
  };

  const handlePickup = async (order: BatchOrder) => {
    if (!phoneNumber) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoadingOrderId(order.id);
    try {
      const gps = await getCurrentLocation();
      const res = await fetch(new URL("/api/driver/batch/pickup-order", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber, orderId: order.id, batchId: batch.id, ...gps }),
      });
      if (res.ok) await refreshBatch();
    } catch (e) {
      console.error("pickup error:", e);
    } finally {
      setLoadingOrderId(null);
    }
  };

  const handleDeliver = async (order: BatchOrder) => {
    if (!phoneNumber) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setLoadingOrderId(order.id);
    try {
      const gps = await getCurrentLocation();
      const res = await fetch(new URL("/api/driver/batch/complete-order", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber, orderId: order.id, batchId: batch.id, ...gps }),
      });
      if (res.ok) {
        await refreshBatch();
        // If all delivered, go back
        const freshRes = await fetch(
          new URL(`/api/driver/status?phoneNumber=${encodeURIComponent(phoneNumber)}`, getApiUrl()).toString()
        );
        if (freshRes.ok) {
          const data = await freshRes.json();
          if (!data.currentBatch || data.currentBatch.status === "completed") {
            navigation.goBack();
          }
        }
      }
    } catch (e) {
      console.error("deliver error:", e);
    } finally {
      setLoadingOrderId(null);
    }
  };

  const handleCallCustomer = (phone: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const url = Platform.OS === "android" ? `tel:${phone}` : `telprompt:${phone}`;
    Linking.openURL(url).catch(() => Linking.openURL(`tel:${phone}`).catch(console.error));
  };

  const handleOpenMap = (order: BatchOrder) => {
    if (!order.latitude || !order.longitude) return;
    const url = Platform.OS === "ios"
      ? `maps://?daddr=${order.latitude},${order.longitude}`
      : `geo:${order.latitude},${order.longitude}?q=${order.latitude},${order.longitude}`;
    Linking.openURL(url).catch(() =>
      Linking.openURL(`https://maps.google.com/?q=${order.latitude},${order.longitude}`)
    );
  };

  const handleSelectIssue = async (issueType: string) => {
    if (!phoneNumber || !issueOrderId) return;
    setIssueSending(true);
    try {
      const res = await fetch(new URL("/api/driver/report-issue", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber, orderId: issueOrderId, issueType }),
      });
      if (res.ok) {
        setIssueSent(true);
        setTimeout(() => {
          setIssueModalVisible(false);
          setIssueSent(false);
          setIssueOrderId(null);
          refreshBatch();
        }, 1800);
      }
    } catch (e) {} finally {
      setIssueSending(false);
    }
  };

  const handleRejectBatch = async () => {
    if (!phoneNumber || isRejecting) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsRejecting(true);
    try {
      await fetch(new URL("/api/driver/reject-order", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber, batchId: batch.id }),
      });
    } catch (e) {
      console.error("Error rejecting batch:", e);
    } finally {
      setIsRejecting(false);
      navigation.goBack();
    }
  };

  const completedCount = batch.orders.filter(o => o.status === "delivered").length;
  const progress = completedCount / Math.max(batch.totalOrders, 1);

  // Determine step indicator phase
  const hasPickupPending = batch.orders.some(o => o.status === "preparing" || o.status === "ready" || o.status === "confirmed");
  const hasDeliveryActive = batch.orders.some(o => o.status === "picked_up" || o.status === "in_delivery");
  const allDone = completedCount === batch.totalOrders && batch.totalOrders > 0;
  const currentStep = allDone ? 2 : hasDeliveryActive && !hasPickupPending ? 1 : 0;

  const renderOrderCard = (order: BatchOrder, index: number) => {
    const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.confirmed;
    const isLoading = loadingOrderId === order.id;
    const canPickup = order.status === "preparing" || order.status === "ready";
    const isInDelivery = order.status === "in_delivery" || order.status === "picked_up";
    const isDelivered = order.status === "delivered";
    const canAct = canPickup || isInDelivery;

    return (
      <View
        key={order.id}
        style={[styles.orderCard, { backgroundColor: theme.backgroundDefault }, Shadows.sm, isDelivered && styles.orderCardDelivered]}
        testID={`card-order-${order.id}`}
      >
        {/* Order card header */}
        <View style={[styles.orderCardHeader, { borderBottomColor: theme.border }]}>
          <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: Spacing.sm }}>
            <View style={[styles.seqCircle, { backgroundColor: isDelivered ? "#4CAF5020" : AppColors.primary + "15" }]}>
              {isDelivered
                ? <Feather name="check" size={14} color="#4CAF50" />
                : <ThemedText type="small" style={{ color: AppColors.primary, fontWeight: "800" }}>{order.deliverySequence}</ThemedText>
              }
            </View>
            <ThemedText type="h4" style={{ color: theme.text, fontWeight: "700" }}>
              {order.customerName || "زبون"}
            </ThemedText>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: cfg.color + "20" }]}>
            <Feather name={cfg.icon} size={12} color={cfg.color} />
            <ThemedText type="small" style={{ color: cfg.color, fontWeight: "700", fontSize: 11 }}>{cfg.label}</ThemedText>
          </View>
        </View>

        {/* Order details */}
        <View style={styles.orderDetails}>
          <View style={styles.detailRow}>
            <ThemedText type="body" style={{ color: theme.text }} numberOfLines={2}>{order.region || order.address}</ThemedText>
            <Feather name="map-pin" size={16} color={theme.textSecondary} />
          </View>
          <View style={styles.detailRow}>
            <ThemedText type="body" style={{ color: AppColors.primary, fontWeight: "700" }}>
              {formatPrice(order.total + (order.deliveryFee || 0))}
            </ThemedText>
            <Feather name="dollar-sign" size={16} color={AppColors.primary} />
          </View>
          {order.vendorName ? (
            <View style={styles.detailRow}>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>{order.vendorName}</ThemedText>
              <Feather name="shopping-bag" size={14} color={theme.textSecondary} />
            </View>
          ) : null}
          {order.items && order.items.length > 0 ? (
            <View style={[styles.itemsBox, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
              <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: Spacing.xs, marginBottom: Spacing.xs }}>
                <Feather name="shopping-cart" size={13} color={theme.textSecondary} />
                <ThemedText type="small" style={{ color: theme.textSecondary, fontWeight: "700" }}>المنتجات</ThemedText>
              </View>
              {order.items.map((item: any, idx: number) => (
                <View key={idx} style={styles.itemRow}>
                  <ThemedText type="small" style={{ color: AppColors.primary, fontWeight: "700" }}>
                    {formatPrice(item.price * item.quantity)}
                  </ThemedText>
                  <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: Spacing.xs, flex: 1 }}>
                    <ThemedText type="small" style={{ color: theme.textSecondary, fontWeight: "700" }}>×{item.quantity}</ThemedText>
                    <ThemedText type="small" style={{ color: theme.text, flex: 1, textAlign: "right" }} numberOfLines={1}>
                      {item.name}
                    </ThemedText>
                  </View>
                </View>
              ))}
            </View>
          ) : null}
          {order.notes ? (
            <View style={[styles.notesBox, { backgroundColor: "#FFF3E0" }]}>
              <ThemedText type="small" style={{ color: "#E65100", textAlign: "right" }}>{order.notes}</ThemedText>
            </View>
          ) : null}
        </View>

        {/* Quick action buttons */}
        <View style={styles.quickActions}>
          <Pressable
            style={[styles.quickBtn, { backgroundColor: "#4CAF5015" }]}
            onPress={() => handleCallCustomer(order.customerPhone)}
            testID={`button-call-${order.id}`}
          >
            <Feather name="phone" size={18} color="#4CAF50" />
            <ThemedText type="small" style={{ color: "#4CAF50", fontWeight: "600" }}>اتصال</ThemedText>
          </Pressable>
          {order.latitude && order.longitude ? (
            <Pressable
              style={[styles.quickBtn, { backgroundColor: "#2196F315" }]}
              onPress={() => handleOpenMap(order)}
              testID={`button-map-${order.id}`}
            >
              <Feather name="map" size={18} color="#2196F3" />
              <ThemedText type="small" style={{ color: "#2196F3", fontWeight: "600" }}>الخريطة</ThemedText>
            </Pressable>
          ) : null}
          {canAct ? (
            <Pressable
              style={[styles.quickBtn, { backgroundColor: AppColors.primary + "15" }]}
              onPress={() => { setIssueOrderId(order.id); setIssueModalVisible(true); }}
              testID={`button-issue-${order.id}`}
            >
              <Feather name="alert-triangle" size={18} color={AppColors.primary} />
              <ThemedText type="small" style={{ color: AppColors.primary, fontWeight: "600" }}>مشكلة</ThemedText>
            </Pressable>
          ) : null}
        </View>

        {/* Main action button */}
        {!isDelivered ? (
          <Pressable
            style={[
              styles.mainActionBtn,
              {
                backgroundColor: isInDelivery ? "#4CAF50" : canPickup ? "#8B5CF6" : "#BDBDBD",
                opacity: isLoading ? 0.7 : 1,
              },
            ]}
            onPress={() => {
              if (canPickup) handlePickup(order);
              else if (isInDelivery) handleDeliver(order);
            }}
            disabled={isLoading || order.status === "confirmed"}
            testID={`button-action-${order.id}`}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Feather
                  name={isInDelivery ? "check-circle" : canPickup ? "package" : "clock"}
                  size={20}
                  color="#FFFFFF"
                />
                <ThemedText type="h4" style={{ color: "#FFFFFF", fontWeight: "700" }}>
                  {isInDelivery ? "تم التوصيل" : canPickup ? "تم الاستلام من المحل" : "بانتظار القبول"}
                </ThemedText>
              </>
            )}
          </Pressable>
        ) : (
          <View style={[styles.deliveredBanner, { backgroundColor: "#4CAF5015" }]}>
            <Feather name="check-circle" size={18} color="#4CAF50" />
            <ThemedText type="body" style={{ color: "#4CAF50", fontWeight: "700" }}>تم التوصيل بنجاح</ThemedText>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <GradientBackground />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md, backgroundColor: "#8B5CF6" }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} testID="button-back">
          <Feather name="chevron-right" size={26} color="#FFFFFF" />
        </Pressable>
        <View style={styles.headerCenter}>
          <ThemedText type="h3" style={styles.headerTitle}>إدارة الدفعة</ThemedText>
          <ThemedText type="small" style={styles.headerSub}>
            {completedCount} / {batch.totalOrders} طلبات
          </ThemedText>
        </View>
        {batch.status === "pending" ? (
          <Pressable
            style={styles.rejectHeaderBtn}
            onPress={handleRejectBatch}
            disabled={isRejecting}
            testID="button-reject-batch"
          >
            {isRejecting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Feather name="x" size={22} color="#FFFFFF" />
            )}
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {/* Reject banner for pending batches */}
      {batch.status === "pending" ? (
        <View style={styles.rejectBanner}>
          <Feather name="clock" size={15} color="#F44336" />
          <ThemedText type="small" style={styles.rejectBannerText}>طلب معلق — قبول أو رفض مطلوب</ThemedText>
          <Pressable
            style={styles.rejectBannerBtn}
            onPress={handleRejectBatch}
            disabled={isRejecting}
            testID="button-reject-batch-banner"
          >
            {isRejecting ? (
              <ActivityIndicator size="small" color="#F44336" />
            ) : (
              <ThemedText type="small" style={{ color: "#F44336", fontWeight: "700" }}>رفض</ThemedText>
            )}
          </Pressable>
        </View>
      ) : null}

      {/* Progress */}
      <View style={[styles.progressBox, { backgroundColor: theme.backgroundDefault }]}>
        <View style={styles.progressLabelRow}>
          <ThemedText type="small" style={{ color: "#8B5CF6", fontWeight: "700" }}>
            {Math.round(progress * 100)}%
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            {completedCount} من {batch.totalOrders} تم توصيلها
          </ThemedText>
        </View>
        <View style={[styles.progressBar, { backgroundColor: theme.border }]}>
          <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` as any }]} />
        </View>
      </View>

      {/* Step Indicator */}
      <View style={[styles.stepRow, { backgroundColor: theme.backgroundDefault }]}>
        {[
          { label: "الاستلام", icon: "package" as const },
          { label: "التوصيل", icon: "navigation" as const },
          { label: "مكتمل", icon: "check-circle" as const },
        ].map((step, idx) => {
          const done = idx < currentStep;
          const active = idx === currentStep;
          const stepColor = done ? "#4CAF50" : active ? "#8B5CF6" : theme.border;
          return (
            <React.Fragment key={idx}>
              <View style={styles.stepItem}>
                <View style={[styles.stepCircle, {
                  backgroundColor: done ? "#4CAF50" : active ? "#8B5CF6" : theme.backgroundRoot,
                  borderColor: stepColor,
                }]}>
                  <Feather name={step.icon} size={14} color={done || active ? "#fff" : theme.textSecondary} />
                </View>
                <ThemedText type="small" style={{ color: active ? "#8B5CF6" : done ? "#4CAF50" : theme.textSecondary, fontWeight: active ? "700" : "400", fontSize: 11, marginTop: 4 }}>
                  {step.label}
                </ThemedText>
              </View>
              {idx < 2 ? (
                <View style={[styles.stepLine, { backgroundColor: idx < currentStep ? "#4CAF50" : theme.border }]} />
              ) : null}
            </React.Fragment>
          );
        })}
      </View>

      {/* Orders List */}
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + Spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        {batch.orders.map((order, idx) => renderOrderCard(order, idx))}
      </ScrollView>

      {/* Issue Modal */}
      <Modal
        visible={issueModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !issueSending && setIssueModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => !issueSending && setIssueModalVisible(false)}>
          <Pressable style={[styles.modalBox, { backgroundColor: theme.backgroundDefault }]} onPress={() => {}}>
            {issueSent ? (
              <View style={styles.modalSent}>
                <View style={[styles.modalSentIcon, { backgroundColor: "#E8F5E9" }]}>
                  <Feather name="check-circle" size={36} color="#4CAF50" />
                </View>
                <ThemedText type="h4" style={{ color: "#4CAF50", fontWeight: "700", marginTop: Spacing.md }}>
                  تم إرسال المشكلة
                </ThemedText>
              </View>
            ) : (
              <>
                <View style={styles.modalHeader}>
                  <Feather name="alert-triangle" size={22} color={AppColors.primary} />
                  <ThemedText type="h4" style={{ color: theme.text, fontWeight: "700" }}>إبلاغ عن مشكلة</ThemedText>
                </View>
                <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: "center", marginBottom: Spacing.lg }}>
                  اختر نوع المشكلة
                </ThemedText>
                {ISSUE_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.key}
                    style={[styles.issueOption, { borderColor: theme.border }]}
                    onPress={() => handleSelectIssue(opt.key)}
                    disabled={issueSending}
                    testID={`button-issue-type-${opt.key}`}
                  >
                    {issueSending
                      ? <ActivityIndicator size="small" color={AppColors.primary} />
                      : <Feather name="chevron-left" size={18} color={AppColors.primary} />
                    }
                    <ThemedText type="body" style={{ color: theme.text, fontWeight: "600", flex: 1, textAlign: "right" }}>
                      {opt.label}
                    </ThemedText>
                  </Pressable>
                ))}
                <Pressable style={styles.modalCancelBtn} onPress={() => setIssueModalVisible(false)} disabled={issueSending}>
                  <ThemedText type="small" style={{ color: theme.textSecondary }}>إلغاء</ThemedText>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  backBtn: { width: 40, alignItems: "flex-start" },
  headerCenter: { flex: 1, alignItems: "center" },
  rejectHeaderBtn: { width: 40, alignItems: "flex-end", justifyContent: "center" },
  rejectBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF3F3",
    borderBottomWidth: 1,
    borderBottomColor: "#FFCDD2",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  rejectBannerText: { flex: 1, color: "#C62828", fontWeight: "600", textAlign: "right" },
  rejectBannerBtn: {
    backgroundColor: "#FFF",
    borderWidth: 1.5,
    borderColor: "#F44336",
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  headerTitle: { color: "#FFFFFF", fontWeight: "800" },
  headerSub: { color: "rgba(255,255,255,0.8)", marginTop: 2 },
  progressBox: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  progressLabelRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  progressBar: { height: 8, borderRadius: 4, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 4, backgroundColor: "#8B5CF6" },
  scrollContent: { padding: Spacing.lg, gap: Spacing.md },
  orderCard: { borderRadius: BorderRadius.xl, padding: Spacing.lg },
  orderCardDelivered: { opacity: 0.75 },
  orderCardHeader: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    marginBottom: Spacing.md,
  },
  seqCircle: {
    width: 32, height: 32, borderRadius: 16,
    justifyContent: "center", alignItems: "center",
  },
  statusBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
  },
  orderDetails: { gap: Spacing.sm, marginBottom: Spacing.md },
  detailRow: { flexDirection: "row-reverse", alignItems: "center", gap: Spacing.sm },
  notesBox: { padding: Spacing.sm, borderRadius: BorderRadius.sm, marginTop: 2 },
  itemsBox: { padding: Spacing.sm, borderRadius: BorderRadius.sm, borderWidth: 1, marginTop: 2, gap: 4 },
  itemRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  quickActions: { flexDirection: "row-reverse", gap: Spacing.sm, marginBottom: Spacing.md },
  quickBtn: {
    flex: 1, flexDirection: "row", justifyContent: "center",
    alignItems: "center", gap: 4, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md,
  },
  mainActionBtn: {
    flexDirection: "row-reverse", justifyContent: "center", alignItems: "center",
    gap: Spacing.sm, paddingVertical: Spacing.md + 2, borderRadius: BorderRadius.md,
  },
  deliveredBanner: {
    flexDirection: "row-reverse", justifyContent: "center", alignItems: "center",
    gap: Spacing.sm, paddingVertical: Spacing.md, borderRadius: BorderRadius.md,
  },
  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center", alignItems: "center", padding: Spacing.xl,
  },
  modalBox: {
    width: "100%", borderRadius: BorderRadius.xl, padding: Spacing.xl,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 12, elevation: 8,
  },
  modalHeader: {
    flexDirection: "row-reverse", alignItems: "center",
    gap: Spacing.sm, justifyContent: "center", marginBottom: Spacing.sm,
  },
  issueOption: {
    flexDirection: "row-reverse", alignItems: "center", gap: Spacing.sm,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg, borderWidth: 1, marginBottom: Spacing.sm,
  },
  modalCancelBtn: { alignItems: "center", paddingVertical: Spacing.sm, marginTop: Spacing.xs },
  modalSent: { alignItems: "center", paddingVertical: Spacing.xl },
  modalSentIcon: { width: 70, height: 70, borderRadius: 35, justifyContent: "center", alignItems: "center" },
  // Step indicator
  stepRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  stepItem: { alignItems: "center", width: 64 },
  stepCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  stepLine: { flex: 1, height: 2, marginBottom: 18 },
});
