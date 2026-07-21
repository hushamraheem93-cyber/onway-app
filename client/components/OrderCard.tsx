import React, { useState } from "react";
import {
  StyleSheet,
  View,
  Pressable,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import {
  Spacing,
  BorderRadius,
  Shadows,
  AppColors,
  ORDER_STATUS_COLORS,
  ORDER_STATUS_LABELS,
  FontWeight,
} from "@/constants/theme";
import { Order } from "@/context/OrderContext";
import { formatPrice } from "@/constants/currency";
import { formatDateTime } from "@/lib/dateUtils";

interface OrderCardProps {
  order: Order;
  onPress?: () => void;
  onStorePress?: () => void;
  onRate?: (
    orderId: string,
    rating: number,
    comment?: string,
    image?: string,
    driverRating?: number,
  ) => Promise<void>;
  onReorder?: (order: Order) => void;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function StarRow({
  value,
  onChange,
  size = 36,
  testPrefix = "star",
}: {
  value: number;
  onChange: (v: number) => void;
  size?: number;
  testPrefix?: string;
}) {
  return (
    <View style={styles.modalStarsRow}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Pressable key={s} onPress={() => onChange(s)} hitSlop={8} testID={`${testPrefix}-${s}`}>
          <MaterialCommunityIcons
            name={s <= value ? "star" : "star-outline"}
            size={size}
            color={AppColors.warning}
          />
        </Pressable>
      ))}
    </View>
  );
}

function OrderCardComponent({ order, onPress, onStorePress, onRate, onReorder }: OrderCardProps) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);
  const [submittingRating, setSubmittingRating] = useState(false);
  const [ratedValue, setRatedValue] = useState<number | null>(order.customerRating ?? null);
  const [ratingModal, setRatingModal] = useState(false);
  const [vendorStar, setVendorStar] = useState(5);
  const [driverStar, setDriverStar] = useState(5);
  const [rateDriver, setRateDriver] = useState(false);
  const [commentText, setCommentText] = useState("");

  const canRate = order.status === "delivered" && order.vendorId && !ratedValue && !!onRate;
  const canReorder = order.status === "delivered" && !!onReorder;

  const handleOpenRatingModal = () => {
    if (!onRate || ratedValue) return;
    setVendorStar(5);
    setDriverStar(5);
    setRateDriver(false);
    setCommentText("");
    setRatingModal(true);
  };

  const handleSubmitRating = async () => {
    if (!onRate || submittingRating || ratedValue) return;
    setSubmittingRating(true);
    try {
      await onRate(
        order.id,
        vendorStar,
        commentText.trim(),
        undefined,
        rateDriver ? driverStar : undefined,
      );
      setRatedValue(vendorStar);
      setRatingModal(false);
    } catch {
      // silently ignore — caller shows error toast if needed
    } finally {
      setSubmittingRating(false);
    }
  };

  const handleReorderPress = () => {
    if (!onReorder) return;
    Alert.alert(
      "اطلب مجدداً",
      "سيتم إضافة عناصر هذا الطلب إلى سلّتك. هل تريد المتابعة؟",
      [
        { text: "إلغاء", style: "cancel" },
        { text: "نعم، أضف للسلة", onPress: () => onReorder(order) },
      ],
    );
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const handlePressIn = () => { scale.value = withSpring(0.98, { damping: 15, stiffness: 150 }); };
  const handlePressOut = () => { scale.value = withSpring(1, { damping: 15, stiffness: 150 }); };

  const orderRef = `#${String((order as any).orderNumber ?? order.id).slice(-6).toUpperCase()}`;

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[styles.card, { backgroundColor: theme.backgroundDefault }, Shadows.sm, animatedStyle]}
    >
      {/* Header */}
      <View style={styles.header}>
        <ThemedText type="h4" style={styles.orderId}>{orderRef}</ThemedText>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: (ORDER_STATUS_COLORS[order.status] ?? AppColors.gray400) + "20" },
          ]}
        >
          <View style={[styles.statusDot, { backgroundColor: ORDER_STATUS_COLORS[order.status] ?? AppColors.gray400 }]} />
          <ThemedText type="small" style={{ color: ORDER_STATUS_COLORS[order.status] ?? AppColors.gray400, fontWeight: FontWeight.bold }}>
            {ORDER_STATUS_LABELS[order.status] ?? order.status}
          </ThemedText>
        </View>
      </View>

      {/* Info */}
      <View style={styles.info}>
        {(() => {
          const storeName = order.vendorName || order.items.find(i => i.restaurant)?.restaurant;
          const canNavigate = !!(order.vendorId && onStorePress);
          return storeName ? (
            <View style={[styles.infoRow, styles.storeRow]}>
              <Pressable
                onPress={canNavigate ? onStorePress : undefined}
                style={[
                  styles.storeBadge,
                  { backgroundColor: AppColors.primary + "12" },
                  canNavigate && styles.storeBadgePressable,
                ]}
                testID="button-store-badge"
              >
                <Feather name="shopping-bag" size={13} color={AppColors.primary} />
                <ThemedText type="small" style={[styles.storeText, { color: AppColors.primary }]}>
                  {"من متجر " + storeName}
                </ThemedText>
                {canNavigate ? <Feather name="chevron-left" size={12} color={AppColors.primary} /> : null}
              </Pressable>
            </View>
          ) : null;
        })()}
        <View style={styles.infoRow}>
          <Feather name="package" size={16} color={theme.textSecondary} />
          <ThemedText type="body" style={[styles.infoText, { color: theme.textSecondary }]}>
            {order.items.length} منتج
          </ThemedText>
        </View>
        <View style={styles.infoRow}>
          <Feather name="clock" size={16} color={theme.textSecondary} />
          <ThemedText type="small" style={[styles.infoText, { color: theme.textSecondary }]}>
            {formatDateTime(order.createdAt)}
          </ThemedText>
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <ThemedText type="h3" style={{ color: AppColors.primary }}>
          {formatPrice(order.total)}
        </ThemedText>
        {canReorder ? (
          <Pressable
            onPress={handleReorderPress}
            style={styles.reorderBtn}
            testID={`button-reorder-${order.id}`}
          >
            <Feather name="refresh-cw" size={13} color={AppColors.primary} />
            <ThemedText type="small" style={{ color: AppColors.primary, fontFamily: "Cairo_700Bold" }}>
              اطلب مجدداً
            </ThemedText>
          </Pressable>
        ) : (
          <Feather name="chevron-left" size={20} color={theme.textSecondary} />
        )}
      </View>

      {/* Rating section */}
      {(canRate || ratedValue) ? (
        <View style={[styles.ratingSection, { borderTopColor: theme.border ?? AppColors.divider }]}>
          {ratedValue ? (
            <View style={styles.ratingRow}>
              <ThemedText type="small" style={{ color: AppColors.success, fontWeight: FontWeight.semiBold }}>
                شكراً على تقييمك!
              </ThemedText>
              <View style={styles.ratingStarsRow}>
                {[1,2,3,4,5].map((i) => (
                  <MaterialCommunityIcons
                    key={i}
                    name={i <= ratedValue ? "star" : "star-outline"}
                    size={16}
                    color={AppColors.warning}
                  />
                ))}
              </View>
            </View>
          ) : submittingRating ? (
            <View style={styles.ratingRow}>
              <ActivityIndicator size="small" color={AppColors.primary} />
              <ThemedText type="small" style={{ color: theme.textSecondary }}>جاري الحفظ...</ThemedText>
            </View>
          ) : (
            <Pressable
              onPress={handleOpenRatingModal}
              style={styles.rateBtn}
              testID={`button-rate-open-${order.id}`}
            >
              <MaterialCommunityIcons name="star" size={16} color={AppColors.white} />
              <ThemedText type="small" style={{ color: AppColors.white, fontFamily: "Cairo_700Bold" }}>
                قيّم طلبك
              </ThemedText>
            </Pressable>
          )}
        </View>
      ) : null}

      {/* Rating Modal */}
      <Modal visible={ratingModal} transparent animationType="slide" onRequestClose={() => setRatingModal(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Pressable style={styles.modalBg} onPress={() => setRatingModal(false)} />
          <View style={[styles.modalSheet, { backgroundColor: theme.backgroundDefault }]}>
            <ThemedText type="h4" style={[styles.modalTitle, { color: theme.text }]}>
              كيف كانت تجربتك؟
            </ThemedText>

            {/* Vendor rating */}
            <ThemedText type="small" style={[styles.ratingLabel, { color: theme.textSecondary }]}>
              تقييم المتجر
            </ThemedText>
            <StarRow value={vendorStar} onChange={setVendorStar} testPrefix="modal-vendor-star" />

            {/* Driver rating toggle */}
            <Pressable
              onPress={() => setRateDriver((v) => !v)}
              style={[styles.driverToggle, { borderColor: rateDriver ? AppColors.primary : (theme.border ?? AppColors.divider) }]}
              testID="button-toggle-driver-rating"
            >
              <MaterialCommunityIcons
                name={rateDriver ? "checkbox-marked-circle" : "checkbox-blank-circle-outline"}
                size={18}
                color={rateDriver ? AppColors.primary : theme.textSecondary}
              />
              <ThemedText type="small" style={{ color: rateDriver ? AppColors.primary : theme.textSecondary, fontFamily: "Cairo_600SemiBold" }}>
                تقييم السائق أيضاً (اختياري)
              </ThemedText>
            </Pressable>
            {rateDriver ? (
              <StarRow value={driverStar} onChange={setDriverStar} testPrefix="modal-driver-star" />
            ) : null}

            {/* Comment */}
            <TextInput
              style={[styles.modalComment, { backgroundColor: theme.backgroundRoot, color: theme.text, borderColor: theme.border ?? AppColors.divider }]}
              placeholder="أضف تعليقاً (اختياري)..."
              placeholderTextColor={theme.textSecondary}
              value={commentText}
              onChangeText={setCommentText}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              textAlign="right"
              maxLength={500}
            />
            <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: "left", marginTop: 2 }}>
              {commentText.length}/500
            </ThemedText>

            {/* Actions */}
            <View style={styles.modalActions}>
              <Pressable onPress={() => setRatingModal(false)} style={[styles.modalBtn, { backgroundColor: theme.backgroundRoot }]}>
                <ThemedText type="body" style={{ color: theme.textSecondary, fontFamily: "Cairo_700Bold" }}>إلغاء</ThemedText>
              </Pressable>
              <Pressable
                onPress={handleSubmitRating}
                disabled={submittingRating}
                style={[styles.modalBtn, { backgroundColor: AppColors.primary, opacity: submittingRating ? 0.6 : 1 }]}
                testID="button-submit-rating"
              >
                {submittingRating ? (
                  <ActivityIndicator size="small" color={AppColors.white} />
                ) : (
                  <ThemedText type="body" style={{ color: AppColors.white, fontFamily: "Cairo_700Bold" }}>إرسال</ThemedText>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  header: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  orderId: { textAlign: "right" },
  statusBadge: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  info: { marginBottom: Spacing.md },
  infoRow: { flexDirection: "row-reverse", alignItems: "center", marginBottom: Spacing.xs },
  storeRow: { marginBottom: Spacing.sm },
  storeBadge: {
    flexDirection: "row-reverse",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    gap: 4,
  },
  storeBadgePressable: { borderWidth: 1, borderColor: AppColors.primary + "30" },
  storeText: { fontWeight: FontWeight.semiBold },
  infoText: { marginRight: Spacing.sm, textAlign: "right" },
  footer: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: AppColors.border,
  },
  reorderBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    borderColor: AppColors.primary + "60",
    backgroundColor: AppColors.primary + "10",
  },
  ratingSection: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    alignItems: "center",
  },
  ratingRow: { flexDirection: "row-reverse", alignItems: "center", gap: Spacing.sm },
  ratingStarsRow: { flexDirection: "row-reverse", gap: 4 },
  rateBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    backgroundColor: AppColors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  modalOverlay: { flex: 1, justifyContent: "flex-end" },
  modalBg: { flex: 1, backgroundColor: AppColors.overlay },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 12,
  },
  modalTitle: { textAlign: "center", fontFamily: "Cairo_700Bold" },
  ratingLabel: { textAlign: "center", fontWeight: FontWeight.semiBold },
  modalStarsRow: { flexDirection: "row-reverse", justifyContent: "center", gap: 8 },
  driverToggle: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderRadius: 12,
  },
  modalComment: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    minHeight: 72,
    fontFamily: "Cairo_400Regular",
    fontSize: 16,
  },
  modalActions: { flexDirection: "row-reverse", gap: 10, marginTop: 4 },
  modalBtn: { flex: 1, padding: 13, borderRadius: 12, alignItems: "center" },
});

export const OrderCard = React.memo(OrderCardComponent);
