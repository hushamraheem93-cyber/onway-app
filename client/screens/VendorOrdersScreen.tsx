import React, { useCallback, useState } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useFocusEffect } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";
import { getApiUrl } from "@/lib/query-client";

const PURPLE = "#673AB7";

interface OrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
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
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending:    { label: "قيد الانتظار",  color: "#D97706", bg: "#FFFBEB" },
  confirmed:  { label: "مؤكد",          color: "#2563EB", bg: "#EFF6FF" },
  preparing:  { label: "قيد التحضير",   color: "#7C3AED", bg: "#F5F3FF" },
  ready:      { label: "جاهز",          color: "#059669", bg: "#ECFDF5" },
  picked_up:  { label: "تم الاستلام",   color: "#0891B2", bg: "#ECFEFF" },
  delivering: { label: "في الطريق",     color: "#0284C7", bg: "#F0F9FF" },
  delivered:  { label: "تم التوصيل",    color: "#16A34A", bg: "#F0FDF4" },
  cancelled:  { label: "ملغي",          color: "#DC2626", bg: "#FFF5F5" },
};

function formatDate(iso: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("ar-IQ", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: "#6B7280", bg: "#F3F4F6" };
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <ThemedText style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</ThemedText>
    </View>
  );
}

function OrderCard({ order }: { order: VendorOrder }) {
  const vendorTotal = order.vendorSubtotal ?? order.restaurantSubtotal ?? order.total;
  const displayName = order.customerName || order.customerPhone || order.phoneNumber || "عميل";

  return (
    <View style={styles.card} testID={`card-order-${order.id}`}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <ThemedText style={styles.orderId} numberOfLines={1}>
            #{order.id.slice(-8).toUpperCase()}
          </ThemedText>
          <ThemedText style={styles.orderDate}>{formatDate(order.createdAt)}</ThemedText>
        </View>
        <StatusBadge status={order.status} />
      </View>

      <View style={styles.divider} />

      <View style={styles.customerRow}>
        <MaterialCommunityIcons name="account-outline" size={16} color="#6B7280" />
        <ThemedText style={styles.customerName} numberOfLines={1}>{displayName}</ThemedText>
      </View>

      {order.address ? (
        <View style={styles.customerRow}>
          <MaterialCommunityIcons name="map-marker-outline" size={16} color="#6B7280" />
          <ThemedText style={styles.addressText} numberOfLines={2}>{order.address}</ThemedText>
        </View>
      ) : null}

      <View style={styles.divider} />

      <ThemedText style={styles.itemsLabel}>المنتجات المطلوبة</ThemedText>
      {Array.isArray(order.items) && order.items.length > 0 ? (
        order.items.map((item, idx) => (
          <View key={idx} style={styles.itemRow}>
            <ThemedText style={styles.itemQty}>{item.quantity}×</ThemedText>
            <ThemedText style={styles.itemName} numberOfLines={1}>{item.name}</ThemedText>
            <ThemedText style={styles.itemPrice}>
              {((item.price || 0) * (item.quantity || 1)).toLocaleString("ar-IQ")} د.ع
            </ThemedText>
          </View>
        ))
      ) : null}

      <View style={styles.divider} />

      <View style={styles.totalRow}>
        <ThemedText style={styles.totalLabel}>إجمالي المتجر</ThemedText>
        <ThemedText style={styles.totalAmount}>
          {vendorTotal.toLocaleString("ar-IQ")} د.ع
        </ThemedText>
      </View>
    </View>
  );
}

function EmptyState() {
  return (
    <View style={styles.empty}>
      <MaterialCommunityIcons name="clipboard-list-outline" size={64} color="#D1D5DB" />
      <ThemedText style={styles.emptyTitle}>لا توجد طلبات بعد</ThemedText>
      <ThemedText style={styles.emptySubtitle}>
        ستظهر هنا طلبات العملاء التي تحتوي منتجاتك
      </ThemedText>
    </View>
  );
}

export default function VendorOrdersScreen() {
  const { vendorToken } = useAuth();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();

  const [orders, setOrders] = useState<VendorOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const url = new URL("/api/vendor/orders", getApiUrl());
        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${vendorToken}` },
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "فشل تحميل الطلبات");
        }
        const data = await res.json();
        setOrders(data.orders || []);
      } catch (e: any) {
        setError(e.message || "حدث خطأ");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [vendorToken]
  );

  useFocusEffect(
    useCallback(() => {
      fetchOrders();
    }, [fetchOrders])
  );

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: headerHeight }]}>
        <ActivityIndicator size="large" color={PURPLE} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.center, { paddingTop: headerHeight }]}>
        <MaterialCommunityIcons name="alert-circle-outline" size={48} color="#DC2626" />
        <ThemedText style={styles.errorText}>{error}</ThemedText>
      </View>
    );
  }

  return (
    <FlatList
      data={orders}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <OrderCard order={item} />}
      ListEmptyComponent={<EmptyState />}
      contentContainerStyle={[
        styles.listContent,
        { paddingTop: headerHeight + 12, paddingBottom: tabBarHeight + 16 },
      ]}
      scrollIndicatorInsets={{ bottom: tabBarHeight }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => fetchOrders(true)}
          tintColor={PURPLE}
          progressViewOffset={headerHeight}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  errorText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    color: "#DC2626",
    textAlign: "center",
    paddingHorizontal: 24,
  },
  listContent: {
    paddingHorizontal: 16,
    flexGrow: 1,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    marginBottom: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  cardHeaderLeft: {
    flex: 1,
    marginEnd: 8,
  },
  orderId: {
    fontFamily: "Cairo_700Bold",
    fontSize: 15,
    color: PURPLE,
  },
  orderDate: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 2,
  },
  badge: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 11,
  },
  divider: {
    height: 1,
    backgroundColor: "#F3F4F6",
    marginVertical: 10,
  },
  customerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginBottom: 4,
  },
  customerName: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    color: "#374151",
    flex: 1,
  },
  addressText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: "#6B7280",
    flex: 1,
  },
  itemsLabel: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    color: "#374151",
    marginBottom: 6,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  itemQty: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    color: PURPLE,
    minWidth: 28,
    textAlign: "right",
  },
  itemName: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: "#374151",
    flex: 1,
  },
  itemPrice: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    color: "#6B7280",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalLabel: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    color: "#6B7280",
  },
  totalAmount: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    color: "#111827",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 12,
  },
  emptyTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 18,
    color: "#374151",
    textAlign: "center",
  },
  emptySubtitle: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
    paddingHorizontal: 32,
  },
});
