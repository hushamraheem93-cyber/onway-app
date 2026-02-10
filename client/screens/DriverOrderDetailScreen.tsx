import React from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  Linking,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { AppColors, Spacing, BorderRadius, Shadows } from "@/constants/theme";
import { formatPrice } from "@/constants/currency";

interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
}

interface OrderDetail {
  id: string;
  customerName: string;
  customerPhone: string;
  address: string;
  region: string;
  items: OrderItem[];
  total: number;
  deliveryFee: number;
  status: string;
  createdAt: string;
  notes?: string;
  orderType?: string;
  latitude?: number;
  longitude?: number;
}

export default function DriverOrderDetailScreen() {
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<{ params: { order: OrderDetail } }, "params">>();
  const order = route.params?.order;

  if (!order) {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot, justifyContent: "center", alignItems: "center" }]}>
        <Feather name="alert-circle" size={40} color={theme.textSecondary} />
        <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: Spacing.md }}>
          لا توجد بيانات للطلب
        </ThemedText>
      </View>
    );
  }

  const handleCallCustomer = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const phoneUrl = Platform.OS === "android"
      ? `tel:${order.customerPhone}`
      : `telprompt:${order.customerPhone}`;
    Linking.openURL(phoneUrl).catch(() => {
      Linking.openURL(`tel:${order.customerPhone}`).catch(console.error);
    });
  };

  const statusLabel: Record<string, string> = {
    pending: "قيد الانتظار",
    confirmed: "تم التأكيد",
    preparing: "جاري التحضير",
    delivering: "جاري التوصيل",
    delivered: "تم التوصيل",
    cancelled: "ملغي",
  };

  const statusColor: Record<string, string> = {
    pending: "#FF9800",
    confirmed: "#3B82F6",
    preparing: "#8B5CF6",
    delivering: "#2196F3",
    delivered: "#4CAF50",
    cancelled: "#F44336",
  };

  const orderTotal = (order.total || 0) + (order.deliveryFee || 0);

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm, backgroundColor: AppColors.primary }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} testID="button-back">
          <Feather name="arrow-right" size={24} color="#FFFFFF" />
        </Pressable>
        <ThemedText type="h3" style={styles.headerTitle}>تفاصيل الطلب</ThemedText>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.statusBanner, { backgroundColor: (statusColor[order.status] || "#9E9E9E") + "15" }]}>
          <ThemedText type="h4" style={{ color: statusColor[order.status] || "#9E9E9E", fontWeight: "700" }}>
            {statusLabel[order.status] || order.status}
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 2 }}>
            #{order.id?.slice(-6)}
          </ThemedText>
        </View>

        <View style={[styles.card, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
          <View style={styles.cardHeader}>
            <Feather name="user" size={20} color={AppColors.primary} />
            <ThemedText type="h4" style={{ color: theme.text, fontWeight: "700" }}>بيانات الزبون</ThemedText>
          </View>

          <View style={styles.infoRow}>
            <ThemedText type="body" style={{ color: theme.text }}>{order.customerName || "زبون"}</ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>الاسم</ThemedText>
          </View>

          <View style={styles.infoRow}>
            <ThemedText type="body" style={{ color: theme.text, direction: "ltr" }}>{order.customerPhone}</ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>رقم الهاتف</ThemedText>
          </View>

          <View style={styles.infoRow}>
            <ThemedText type="body" style={{ color: theme.text }}>{order.region}</ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>المنطقة</ThemedText>
          </View>

          <View style={styles.infoRow}>
            <ThemedText type="body" style={{ color: theme.text }}>{order.address}</ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>العنوان</ThemedText>
          </View>

          <View style={styles.actionButtonsRow}>
            <Pressable
              style={styles.callButton}
              onPress={handleCallCustomer}
              testID="button-call-customer"
            >
              <Feather name="phone" size={20} color="#FFFFFF" />
              <ThemedText type="h4" style={styles.callButtonText}>اتصال بالزبون</ThemedText>
            </Pressable>

            {(order.latitude && order.longitude) ? (
              <Pressable
                style={styles.mapButton}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  const lat = order.latitude!;
                  const lng = order.longitude!;
                  const label = encodeURIComponent(order.customerName || "موقع الزبون");
                  const url = Platform.select({
                    ios: `maps:0,0?q=${label}@${lat},${lng}`,
                    android: `geo:0,0?q=${lat},${lng}(${label})`,
                    default: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
                  });
                  if (url) {
                    Linking.openURL(url).catch(() => {
                      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`).catch(console.error);
                    });
                  }
                }}
                testID="button-view-location"
              >
                <Feather name="map-pin" size={20} color="#FFFFFF" />
                <ThemedText type="h4" style={styles.callButtonText}>موقع الزبون</ThemedText>
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
          <View style={styles.cardHeader}>
            <Feather name="shopping-bag" size={20} color={AppColors.primary} />
            <ThemedText type="h4" style={{ color: theme.text, fontWeight: "700" }}>ملخص الطلب</ThemedText>
          </View>

          {order.orderType ? (
            <View style={[styles.orderTypeBadge, { backgroundColor: AppColors.primary + "15" }]}>
              <ThemedText type="small" style={{ color: AppColors.primary, fontWeight: "600" }}>
                {order.orderType === "delivery" ? "توصيل" : order.orderType}
              </ThemedText>
            </View>
          ) : null}

          <View style={[styles.tableHeader, { borderBottomColor: theme.border }]}>
            <ThemedText type="small" style={[styles.tableHeaderText, { color: theme.textSecondary, flex: 1 }]}>المجموع</ThemedText>
            <ThemedText type="small" style={[styles.tableHeaderText, { color: theme.textSecondary, width: 40, textAlign: "center" }]}>العدد</ThemedText>
            <ThemedText type="small" style={[styles.tableHeaderText, { color: theme.textSecondary, flex: 1, textAlign: "center" }]}>السعر</ThemedText>
            <ThemedText type="small" style={[styles.tableHeaderText, { color: theme.textSecondary, flex: 2, textAlign: "right" }]}>المنتج</ThemedText>
          </View>

          {(order.items || []).map((item, index) => (
            <View
              key={item.id || `item-${index}`}
              style={[styles.tableRow, { borderBottomColor: theme.border }]}
            >
              <ThemedText type="body" style={[styles.tableCell, { flex: 1, fontWeight: "600", color: AppColors.primary }]}>
                {formatPrice(item.price * item.quantity)}
              </ThemedText>
              <ThemedText type="body" style={[styles.tableCell, { width: 40, textAlign: "center", color: theme.text }]}>
                {item.quantity}
              </ThemedText>
              <ThemedText type="body" style={[styles.tableCell, { flex: 1, textAlign: "center", color: theme.textSecondary }]}>
                {formatPrice(item.price)}
              </ThemedText>
              <ThemedText type="body" style={[styles.tableCell, { flex: 2, textAlign: "right", color: theme.text, fontWeight: "500" }]}>
                {item.name}
              </ThemedText>
            </View>
          ))}

          <View style={[styles.totalSection, { borderTopColor: theme.border }]}>
            <View style={styles.totalRow}>
              <ThemedText type="body" style={{ color: theme.text }}>{formatPrice(order.total || 0)}</ThemedText>
              <ThemedText type="body" style={{ color: theme.textSecondary }}>المنتجات</ThemedText>
            </View>
            <View style={styles.totalRow}>
              <ThemedText type="body" style={{ color: theme.text }}>{formatPrice(order.deliveryFee || 0)}</ThemedText>
              <ThemedText type="body" style={{ color: theme.textSecondary }}>أجرة التوصيل</ThemedText>
            </View>
            <View style={[styles.totalRow, styles.grandTotalRow]}>
              <ThemedText type="h3" style={{ color: AppColors.primary, fontWeight: "800" }}>
                {formatPrice(orderTotal)}
              </ThemedText>
              <ThemedText type="h4" style={{ color: theme.text, fontWeight: "700" }}>المجموع الكلي</ThemedText>
            </View>
          </View>
        </View>

        {order.notes ? (
          <View style={[styles.card, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
            <View style={styles.cardHeader}>
              <Feather name="file-text" size={20} color={AppColors.primary} />
              <ThemedText type="h4" style={{ color: theme.text, fontWeight: "700" }}>ملاحظات</ThemedText>
            </View>
            <ThemedText type="body" style={{ color: theme.text, lineHeight: 24 }}>
              {order.notes}
            </ThemedText>
          </View>
        ) : null}

        <View style={[styles.card, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
          <View style={styles.cardHeader}>
            <Feather name="clock" size={20} color={AppColors.primary} />
            <ThemedText type="h4" style={{ color: theme.text, fontWeight: "700" }}>معلومات إضافية</ThemedText>
          </View>
          <View style={styles.infoRow}>
            <ThemedText type="body" style={{ color: theme.text }}>
              {order.createdAt ? new Date(order.createdAt).toLocaleDateString("ar-IQ", {
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              }) : "غير محدد"}
            </ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>تاريخ الطلب</ThemedText>
          </View>
          <View style={styles.infoRow}>
            <ThemedText type="body" style={{ color: theme.text }}>{order.items?.length || 0} منتج</ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>عدد المنتجات</ThemedText>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  headerTitle: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  statusBanner: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    alignItems: "center",
  },
  card: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
  },
  cardHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  infoRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  actionButtonsRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  callButton: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "#4CAF50",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  mapButton: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "#2196F3",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  callButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  orderTypeBadge: {
    alignSelf: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: Spacing.md,
  },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: Spacing.sm,
    borderBottomWidth: 2,
    marginBottom: Spacing.xs,
  },
  tableHeaderText: {
    fontWeight: "700",
    fontSize: 12,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    alignItems: "center",
  },
  tableCell: {
    fontSize: 13,
  },
  totalSection: {
    borderTopWidth: 2,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    gap: Spacing.sm,
  },
  totalRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
  },
  grandTotalRow: {
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
    paddingTop: Spacing.md,
    marginTop: Spacing.sm,
  },
});
