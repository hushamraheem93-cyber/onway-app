import React, { useEffect } from "react";
import { StyleSheet, View, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { ThemedText } from "@/components/ThemedText";
import { Spacing, BorderRadius, AppColors, Shadows } from "@/constants/theme";
import { formatPrice } from "@/constants/currency";
import { Button } from "@/components/Button";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { Order } from "@/context/OrderContext";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RouteProps = RouteProp<RootStackParamList, "OrderConfirmation">;

export default function OrderConfirmationScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const order = route.params?.order;

  if (!order || !order.items) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.backgroundRoot, justifyContent: "center", alignItems: "center" }}>
        <ThemedText type="body">جاري التحميل...</ThemedText>
      </View>
    );
  }

  const formatOrderTime = (date: Date) => {
    const d = new Date(date);
    const hours = d.getHours().toString().padStart(2, "0");
    const minutes = d.getMinutes().toString().padStart(2, "0");
    const day = d.getDate().toString().padStart(2, "0");
    const month = (d.getMonth() + 1).toString().padStart(2, "0");
    const year = d.getFullYear();
    return `${hours}:${minutes} - ${day}/${month}/${year}`;
  };

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  const goHome = () => {
    navigation.navigate("MainTabs");
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: "قيد الانتظار",
      confirmed: "تم التأكيد",
      preparing: "جاري التحضير",
      delivering: "جاري التوصيل",
      delivered: "تم التوصيل",
      cancelled: "ملغي",
    };
    return labels[status] || status;
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: "#F59E0B",
      confirmed: "#3B82F6",
      preparing: "#8B5CF6",
      delivering: "#06B6D4",
      delivered: "#10B981",
      cancelled: "#EF4444",
    };
    return colors[status] || "#6B7280";
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingBottom: insets.bottom + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
    >
      <View style={styles.successIcon}>
        <View style={[styles.iconCircle, { backgroundColor: AppColors.success }]}>
          <Feather name="check" size={48} color="#FFFFFF" />
        </View>
      </View>

      <ThemedText type="h2" style={styles.title}>
        تم تأكيد طلبك بنجاح!
      </ThemedText>

      <ThemedText type="body" style={[styles.subtitle, { color: theme.textSecondary }]}>
        رقم الطلب: {order.id}
      </ThemedText>

      <View style={[styles.card, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
        <ThemedText type="h4" style={styles.cardTitle}>
          تفاصيل الطلب
        </ThemedText>

        <View style={styles.detailRow}>
          <ThemedText type="body">{order.phoneNumber}</ThemedText>
          <ThemedText type="body" style={{ color: theme.textSecondary }}>الهاتف</ThemedText>
        </View>

        <View style={styles.detailRow}>
          <ThemedText type="body">{order.region}</ThemedText>
          <ThemedText type="body" style={{ color: theme.textSecondary }}>المنطقة</ThemedText>
        </View>

        <View style={styles.detailRow}>
          <ThemedText type="body" style={{ flex: 1, textAlign: "left" }}>{order.address}</ThemedText>
          <ThemedText type="body" style={{ color: theme.textSecondary }}>العنوان</ThemedText>
        </View>

        <View style={[styles.detailRow, styles.divider]}>
          <ThemedText type="body">{order.items.length} منتج</ThemedText>
          <ThemedText type="body" style={{ color: theme.textSecondary }}>المنتجات</ThemedText>
        </View>

        {order.items.map((item, index) => (
          <View key={index} style={styles.itemRow}>
            <ThemedText type="small" style={{ color: AppColors.primary }}>
              {formatPrice(item.price * item.quantity)}
            </ThemedText>
            <ThemedText type="small" style={{ flex: 1, textAlign: "right" }}>
              {item.name} × {item.quantity}
            </ThemedText>
          </View>
        ))}

        <View style={styles.detailRow}>
          <ThemedText type="body" style={{ color: theme.textSecondary }}>
            {formatPrice(order.deliveryFee)}
          </ThemedText>
          <ThemedText type="body" style={{ color: theme.textSecondary }}>أجور التوصيل</ThemedText>
        </View>

        <View style={[styles.detailRow, styles.totalRow]}>
          <ThemedText type="h3" style={{ color: AppColors.primary }}>
            {formatPrice(order.total + order.deliveryFee)}
          </ThemedText>
          <ThemedText type="h4">المجموع الكلي</ThemedText>
        </View>

        <ThemedText type="small" style={[styles.timeText, { color: theme.textSecondary }]}>
          وقت الطلب: {formatOrderTime(new Date(order.createdAt))}
        </ThemedText>
      </View>

      <View style={[styles.statusCard, { backgroundColor: getStatusColor(order.status) + "15" }]}>
        <View style={[styles.statusIcon, { backgroundColor: getStatusColor(order.status) }]}>
          <Feather name="clock" size={24} color="#FFFFFF" />
        </View>
        <View style={styles.statusContent}>
          <ThemedText type="body" style={{ fontWeight: "600" }}>
            حالة الطلب
          </ThemedText>
          <ThemedText type="h4" style={{ color: getStatusColor(order.status) }}>
            {getStatusLabel(order.status)}
          </ThemedText>
        </View>
      </View>

      <View style={[styles.infoCard, { backgroundColor: theme.backgroundSecondary }]}>
        <Feather name="info" size={20} color={AppColors.primary} />
        <ThemedText type="small" style={{ flex: 1, textAlign: "right", color: theme.textSecondary }}>
          تم إرسال طلبك بنجاح وسيتم مراجعته من قبل الإدارة. يمكنك تتبع حالة طلبك مباشرة.
        </ThemedText>
      </View>

      <Button
        onPress={() => navigation.navigate("OrderTracking", { orderId: order.id })}
        style={styles.trackButton}
      >
        تتبع الطلب
      </Button>

      <Pressable onPress={goHome} style={styles.homeLink}>
        <ThemedText type="body" style={{ color: theme.textSecondary }}>العودة للرئيسية</ThemedText>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  successIcon: {
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  subtitle: {
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  card: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  cardTitle: {
    textAlign: "right",
    marginBottom: Spacing.md,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
    marginTop: Spacing.sm,
    paddingTop: Spacing.md,
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
    marginTop: Spacing.md,
    paddingTop: Spacing.lg,
  },
  timeText: {
    textAlign: "center",
    marginTop: Spacing.md,
  },
  statusCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    flexDirection: "row-reverse",
    alignItems: "center",
  },
  statusIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: Spacing.md,
  },
  statusContent: {
    flex: 1,
    alignItems: "flex-end",
    gap: Spacing.xs,
  },
  infoCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Spacing.md,
  },
  trackButton: {
    marginBottom: Spacing.md,
  },
  homeLink: {
    alignItems: "center",
    paddingVertical: Spacing.md,
    marginBottom: Spacing.xl,
  },
});
