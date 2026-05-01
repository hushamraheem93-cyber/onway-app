import React, { useState } from "react";
import { StyleSheet, View, Pressable, ActivityIndicator } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Shadows, AppColors } from "@/constants/theme";
import { Order } from "@/context/OrderContext";
import { formatPrice } from "@/constants/currency";

interface OrderCardProps {
  order: Order;
  onPress?: () => void;
  onStorePress?: () => void;
  onRate?: (orderId: string, rating: number) => Promise<void>;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const statusLabels: Record<Order["status"], string> = {
  pending: "قيد الانتظار",
  confirmed: "تم تأكيد الطلب",
  preparing: "جاري التحضير",
  ready: "جاهز للاستلام",
  picked_up: "استُلم من المتجر",
  in_delivery: "في الطريق إليك",
  delivering: "في الطريق إليك",
  delivered: "تم التوصيل",
  cancelled: "ملغي",
  issue: "توجد مشكلة",
};

const statusColors: Record<Order["status"], string> = {
  pending: "#FFA726",
  confirmed: "#3B82F6",
  preparing: "#8B5CF6",
  ready: "#8B5CF6",
  picked_up: "#06B6D4",
  in_delivery: "#06B6D4",
  delivering: "#06B6D4",
  delivered: "#10B981",
  cancelled: "#EF4444",
  issue: "#F59E0B",
};

export function OrderCard({ order, onPress, onStorePress, onRate }: OrderCardProps) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);
  const [hoveredStar, setHoveredStar] = useState<number | null>(null);
  const [submittingRating, setSubmittingRating] = useState(false);
  const [ratedValue, setRatedValue] = useState<number | null>(order.customerRating ?? null);

  const canRate = order.status === "delivered" && order.vendorId && !ratedValue && !!onRate;

  const handleRate = async (star: number) => {
    if (!onRate || submittingRating || ratedValue) return;
    setSubmittingRating(true);
    try {
      await onRate(order.id, star);
      setRatedValue(star);
    } catch {
      // silently ignore
    } finally {
      setSubmittingRating(false);
    }
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.98, { damping: 15, stiffness: 150 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 150 });
  };

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString("ar-SA", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        styles.card,
        { backgroundColor: theme.backgroundDefault },
        Shadows.sm,
        animatedStyle,
      ]}
    >
      <View style={styles.header}>
        <ThemedText type="h4" style={styles.orderId}>
          {order.id}
        </ThemedText>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: statusColors[order.status] + "20" },
          ]}
        >
          <ThemedText
            type="small"
            style={{ color: statusColors[order.status], fontWeight: "600" }}
          >
            {statusLabels[order.status]}
          </ThemedText>
        </View>
      </View>
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
                {canNavigate ? (
                  <Feather name="chevron-left" size={12} color={AppColors.primary} />
                ) : null}
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
            {formatDate(order.createdAt)}
          </ThemedText>
        </View>
      </View>
      <View style={styles.footer}>
        <ThemedText type="h3" style={{ color: AppColors.primary }}>
          {formatPrice(order.total)}
        </ThemedText>
        <Feather name="chevron-left" size={20} color={theme.textSecondary} />
      </View>

      {/* Rating section — delivered + vendor orders only */}
      {(canRate || ratedValue) ? (
        <View style={[styles.ratingSection, { borderTopColor: theme.divider ?? "#E5E7EB" }]}>
          {ratedValue ? (
            <View style={styles.ratingRow}>
              <ThemedText type="small" style={{ color: "#10B981", fontWeight: "600" }}>
                شكراً على تقييمك!
              </ThemedText>
              <View style={styles.ratingStarsRow}>
                {[1,2,3,4,5].map((i) => (
                  <MaterialCommunityIcons
                    key={i}
                    name={i <= ratedValue ? "star" : "star-outline"}
                    size={16}
                    color="#F59E0B"
                  />
                ))}
              </View>
            </View>
          ) : submittingRating ? (
            <View style={styles.ratingRow}>
              <ActivityIndicator size="small" color={AppColors.primary} />
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                جاري الحفظ...
              </ThemedText>
            </View>
          ) : (
            <View style={styles.ratingColumn}>
              <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: 6 }}>
                كيف كانت تجربتك؟
              </ThemedText>
              <View style={styles.ratingStarsRow}>
                {[1,2,3,4,5].map((star) => (
                  <Pressable
                    key={star}
                    onPress={() => handleRate(star)}
                    testID={`button-rate-star-${star}-${order.id}`}
                    hitSlop={6}
                  >
                    <MaterialCommunityIcons
                      name={(hoveredStar !== null && star <= hoveredStar) ? "star" : "star-outline"}
                      size={28}
                      color="#F59E0B"
                    />
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </View>
      ) : null}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  header: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  orderId: {
    textAlign: "right",
  },
  statusBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  info: {
    marginBottom: Spacing.md,
  },
  infoRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  storeRow: {
    marginBottom: Spacing.sm,
  },
  storeBadge: {
    flexDirection: "row-reverse",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    gap: 4,
  },
  storeBadgePressable: {
    borderWidth: 1,
    borderColor: AppColors.primary + "30",
  },
  storeText: {
    fontWeight: "600",
  },
  infoText: {
    marginRight: Spacing.sm,
    textAlign: "right",
  },
  footer: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
  },
  ratingSection: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    alignItems: "center",
  },
  ratingRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Spacing.sm,
  },
  ratingColumn: {
    alignItems: "center",
  },
  ratingStarsRow: {
    flexDirection: "row-reverse",
    gap: 4,
  },
});
