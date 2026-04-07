import React from "react";
import { StyleSheet, View, Pressable } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Shadows, AppColors } from "@/constants/theme";
import { Order } from "@/context/OrderContext";
import { formatPrice } from "@/constants/currency";

interface OrderCardProps {
  order: Order;
  onPress?: () => void;
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

export function OrderCard({ order, onPress }: OrderCardProps) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);

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
});
