import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  ScrollView,
  Modal,
  ActivityIndicator,
  Image,
  Alert,
} from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";
import { getApiUrl } from "@/lib/query-client";

const PURPLE = "#673AB7";

const CATEGORIES = [
  "وجبات رئيسية", "مقبلات وسلطات", "شاورما وسندويشات", "برجر وبيتزا",
  "مشروبات ساخنة", "مشروبات باردة", "حلويات وآيس كريم",
  "مواد غذائية", "خضار وفواكه", "منتجات الألبان والبيض",
  "أطعمة معلبة", "حبوب وبقوليات", "أطعمة مجمدة",
  "منظفات ومواد تنظيف", "منتجات العناية الشخصية",
  "أدوية عامة", "فيتامينات ومكملات", "مستلزمات طبية",
  "خبز وأرغفة", "معجنات وفطاير", "كعك وتورتات",
  "وجبات خفيفة وشيبس", "منتجات الأطفال", "أخرى",
];

const UNITS = ["قطعة", "كيلو", "لتر", "علبة", "كرتون"];

interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  category: string;
  stock: number;
  unit: string;
  imageUrl: string;
  status: "pending" | "approved" | "rejected" | "deleted";
  rejectionReason?: string;
  createdAt: string;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "قيد المراجعة",
  approved: "معتمد",
  rejected: "مرفوض",
  deleted: "محذوف",
};
const STATUS_COLORS: Record<string, string> = {
  pending: "#F59E0B",
  approved: "#10B981",
  rejected: "#EF4444",
  deleted: "#9CA3AF",
};

export default function VendorProductsScreen({ navigation }: any) {
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { vendorToken, vendorProfile } = useAuth();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const isPending = vendorProfile?.status === "pending";

  const load = useCallback(async () => {
    if (!vendorToken) return;
    try {
      const url = new URL("/api/vendor/products", getApiUrl());
      if (filterStatus) url.searchParams.set("status", filterStatus);
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${vendorToken}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setProducts((data.products || []).filter((p: Product) => p.status !== "deleted"));
    } catch {} finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [vendorToken, filterStatus]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const confirmDelete = async () => {
    if (!deleteTarget || !vendorToken) return;
    setDeleting(true);
    try {
      await fetch(new URL(`/api/vendor/products/${deleteTarget}`, getApiUrl()).toString(), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${vendorToken}` },
      });
      setDeleteTarget(null);
      await load();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {} finally {
      setDeleting(false);
    }
  };

  const renderEmpty = () => (
    <View style={styles.empty}>
      <MaterialCommunityIcons name="package-variant-closed" size={56} color="#DDD" />
      <ThemedText style={styles.emptyTitle}>لا توجد منتجات</ThemedText>
      <ThemedText style={styles.emptyDesc}>
        {isPending
          ? "ابدأ بإضافة منتجاتك الآن — ستظهر للزبائن بعد تفعيل حسابك"
          : "ابدأ بإضافة أول منتج لمتجرك"}
      </ThemedText>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Filter tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.filterRow, { marginTop: headerHeight + 8 }]}
      >
        {[{ label: "الكل", value: "" }, { label: "قيد المراجعة", value: "pending" }, { label: "معتمدة", value: "approved" }, { label: "مرفوضة", value: "rejected" }].map((f) => (
          <Pressable
            key={f.value}
            style={[styles.filterChip, filterStatus === f.value && styles.filterChipActive]}
            onPress={() => setFilterStatus(f.value)}
          >
            <ThemedText style={[styles.filterText, filterStatus === f.value && styles.filterTextActive]}>
              {f.label}
            </ThemedText>
          </Pressable>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={PURPLE} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ProductCard
              item={item}
              onDelete={() => setDeleteTarget(item.id)}
            />
          )}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: tabBarHeight + 16,
            flexGrow: 1,
          }}
          refreshing={refreshing}
          onRefresh={onRefresh}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Add button — always visible */}
      <Pressable
        style={[styles.fab, { bottom: tabBarHeight + 20 }]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          navigation.navigate("VendorAddProduct");
        }}
        testID="button-add-product"
      >
        <Feather name="plus" size={24} color="#fff" />
      </Pressable>

      {/* Delete confirm modal */}
      <Modal transparent visible={!!deleteTarget} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.deleteModal}>
            <MaterialCommunityIcons name="trash-can-outline" size={40} color="#EF4444" style={{ marginBottom: 12 }} />
            <ThemedText style={styles.deleteTitle}>حذف المنتج</ThemedText>
            <ThemedText style={styles.deleteDesc}>هل أنت متأكد من حذف هذا المنتج؟</ThemedText>
            <View style={styles.deleteActions}>
              <Pressable
                style={[styles.deleteBtn, styles.deleteBtnConfirm]}
                onPress={confirmDelete}
                disabled={deleting}
              >
                {deleting ? <ActivityIndicator color="#fff" size="small" /> : <ThemedText style={styles.deleteBtnText}>نعم، احذف</ThemedText>}
              </Pressable>
              <Pressable
                style={[styles.deleteBtn, styles.deleteBtnCancel]}
                onPress={() => setDeleteTarget(null)}
              >
                <ThemedText style={styles.deleteCancelText}>إلغاء</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ProductCard({ item, onDelete }: { item: Product; onDelete: () => void }) {
  const statusColor = STATUS_COLORS[item.status] || "#999";
  return (
    <View style={styles.productCard}>
      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={styles.productImg} resizeMode="cover" />
      ) : (
        <View style={[styles.productImg, styles.productImgPlaceholder]}>
          <MaterialCommunityIcons name="image-off" size={24} color="#ccc" />
        </View>
      )}
      <View style={styles.productInfo}>
        <View style={styles.productRow}>
          <ThemedText style={styles.productName} numberOfLines={1}>{item.name}</ThemedText>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + "18" }]}>
            <ThemedText style={[styles.statusText, { color: statusColor }]}>
              {STATUS_LABELS[item.status]}
            </ThemedText>
          </View>
        </View>
        <ThemedText style={styles.productCategory}>{item.category}</ThemedText>
        <View style={styles.productBottom}>
          <ThemedText style={styles.productPrice}>{item.price.toLocaleString("ar-IQ")} د.ع</ThemedText>
          <Pressable style={styles.deleteIconBtn} onPress={onDelete} testID={`button-delete-${item.id}`}>
            <Feather name="trash-2" size={16} color="#EF4444" />
          </Pressable>
        </View>
        {item.status === "rejected" && item.rejectionReason ? (
          <ThemedText style={styles.rejectionReason} numberOfLines={2}>
            السبب: {item.rejectionReason}
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8F7FF" },
  filterRow: {
    paddingHorizontal: 16, paddingBottom: 10, gap: 8, flexDirection: "row",
  },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20, backgroundColor: "#fff",
    borderWidth: 1.5, borderColor: "#E5E7EB",
  },
  filterChipActive: { backgroundColor: PURPLE, borderColor: PURPLE },
  filterText: { fontFamily: "Cairo_700Bold", fontSize: 12, color: "#666" },
  filterTextActive: { color: "#fff" },
  productCard: {
    backgroundColor: "#fff", borderRadius: 16, marginBottom: 12,
    flexDirection: "row", overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  productImg: { width: 90, height: 90 },
  productImgPlaceholder: { justifyContent: "center", alignItems: "center", backgroundColor: "#F5F5F5" },
  productInfo: { flex: 1, padding: 12 },
  productRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 2 },
  productName: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#222", flex: 1, textAlign: "right", marginLeft: 6 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, flexShrink: 0 },
  statusText: { fontFamily: "Cairo_700Bold", fontSize: 10 },
  productCategory: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "#999", textAlign: "right", marginBottom: 4 },
  productBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  productPrice: { fontFamily: "Cairo_700Bold", fontSize: 14, color: PURPLE },
  deleteIconBtn: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: "#FEF2F2", justifyContent: "center", alignItems: "center",
  },
  rejectionReason: {
    fontFamily: "Cairo_400Regular", fontSize: 11, color: "#EF4444",
    textAlign: "right", marginTop: 4, lineHeight: 18,
  },
  fab: {
    position: "absolute", left: 20,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: PURPLE,
    justifyContent: "center", alignItems: "center",
    shadowColor: PURPLE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60 },
  emptyTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#aaa", textAlign: "center", marginTop: 12 },
  emptyDesc: { fontFamily: "Cairo_400Regular", fontSize: 13, color: "#ccc", textAlign: "center", marginTop: 6, lineHeight: 22, paddingHorizontal: 20 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 24 },
  deleteModal: {
    backgroundColor: "#fff", borderRadius: 20, padding: 28, width: "100%", alignItems: "center",
  },
  deleteTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: "#222", marginBottom: 6 },
  deleteDesc: { fontFamily: "Cairo_400Regular", fontSize: 14, color: "#666", textAlign: "center", marginBottom: 24 },
  deleteActions: { flexDirection: "row", gap: 12, width: "100%" },
  deleteBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center" },
  deleteBtnConfirm: { backgroundColor: "#EF4444" },
  deleteBtnCancel: { backgroundColor: "#F3F4F6" },
  deleteBtnText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },
  deleteCancelText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#444" },
});
