import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  StyleSheet,
  SectionList,
  Pressable,
  ScrollView,
  Modal,
  ActivityIndicator,
  Image,
} from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useFocusEffect } from "@react-navigation/native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";
import { getApiUrl } from "@/lib/query-client";
import { resolveImageUrl } from "@/utils/imageUtils";
import { AppColors } from "@/constants/theme";

const ORANGE = AppColors.primary;
const ORANGE_LIGHT = AppColors.secondary;
const ORANGE_BG = AppColors.secondary;

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
  inStock?: boolean;
}

interface SectionData {
  title: string;
  count: number;
  data: Product[];
}

const STATUS_LABELS: Record<string, string> = {
  pending: "قيد المراجعة",
  approved: "معتمد",
  rejected: "مرفوض",
  deleted: "محذوف",
};
const STATUS_COLORS: Record<string, string> = {
  pending: AppColors.warning,
  approved: AppColors.success,
  rejected: AppColors.error,
  deleted: AppColors.gray400,
};

// Map Arabic category names (or categoryId keys) to icon + color
const CATEGORY_CFG: Record<string, { icon: string; color: string; bg: string }> = {
  "مواد غذائية":            { icon: "food-variant",              color: AppColors.warning, bg: AppColors.warningLight },
  "food-supplies":          { icon: "food-variant",              color: AppColors.warning, bg: AppColors.warningLight },
  "مشروبات":                { icon: "cup-water",                 color: AppColors.info, bg: AppColors.infoLight },
  "beverages":              { icon: "cup-water",                 color: AppColors.info, bg: AppColors.infoLight },
  "منظفات":                 { icon: "spray-bottle",              color: AppColors.statusCyan, bg: AppColors.infoLight },
  "cleaning-care":          { icon: "spray-bottle",              color: AppColors.statusCyan, bg: AppColors.infoLight },
  "خضروات وفواكه":          { icon: "food-apple",               color: AppColors.success, bg: AppColors.successLight },
  "fruits-vegetables":      { icon: "food-apple",               color: AppColors.success, bg: AppColors.successLight },
  "لحوم":                   { icon: "food-steak",               color: AppColors.error, bg: AppColors.errorLight },
  "meat-poultry":           { icon: "food-steak",               color: AppColors.error, bg: AppColors.errorLight },
  "ألبان وأجبان":           { icon: "cheese",                   color: AppColors.vendorPurple, bg: AppColors.vendorPurpleLight },
  "dairy-eggs":             { icon: "cheese",                   color: AppColors.vendorPurple, bg: AppColors.vendorPurpleLight },
  "سناكس وحلويات":          { icon: "cookie",                   color: AppColors.primary, bg: AppColors.errorLight },
  "snacks-sweets":          { icon: "cookie",                   color: AppColors.primary, bg: AppColors.errorLight },
  "شاي وقهوة":              { icon: "coffee",                   color: AppColors.gray700, bg: AppColors.gray100 },
  "tea-coffee":             { icon: "coffee",                   color: AppColors.gray700, bg: AppColors.gray100 },
  "مطاعم":                  { icon: "silverware-fork-knife",    color: AppColors.primary, bg: AppColors.secondary },
  "restaurants":            { icon: "silverware-fork-knife",    color: AppColors.primary, bg: AppColors.secondary },
  "أطفال":                  { icon: "baby-carriage",            color: AppColors.error, bg: AppColors.errorLight },
  "baby":                   { icon: "baby-carriage",            color: AppColors.error, bg: AppColors.errorLight },
  "هدايا وورود":            { icon: "flower",                   color: AppColors.error, bg: AppColors.errorLight },
  "flowers":                { icon: "flower",                   color: AppColors.error, bg: AppColors.errorLight },
  "صيدلية":                 { icon: "medical-bag",              color: AppColors.vendorPurple, bg: AppColors.vendorPurpleLight },
  "pharmacy":               { icon: "medical-bag",              color: AppColors.vendorPurple, bg: AppColors.vendorPurpleLight },
  "حقائب":                  { icon: "bag-personal",             color: AppColors.error, bg: AppColors.errorLight },
  "women-bags":             { icon: "bag-personal",             color: AppColors.error, bg: AppColors.errorLight },
};

function getCategoryCfg(name: string) {
  return (
    CATEGORY_CFG[name] ||
    CATEGORY_CFG[name.toLowerCase()] ||
    { icon: "tag-multiple", color: ORANGE, bg: ORANGE_LIGHT }
  );
}

function groupByCategory(products: Product[]): SectionData[] {
  const map: Record<string, Product[]> = {};
  for (const p of products) {
    const cat = p.category || "أخرى";
    if (!map[cat]) map[cat] = [];
    map[cat].push(p);
  }
  return Object.entries(map)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([title, data]) => ({ title, count: data.length, data }));
}

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

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteModal, setBulkDeleteModal] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [resultModal, setResultModal] = useState<{ succeeded: number; failed: number } | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const isPending = vendorProfile?.status === "pending";

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        selectMode ? (
          <Pressable
            onPress={exitSelectMode}
            style={{ marginRight: 16 }}
            testID="button-cancel-select"
          >
            <ThemedText style={styles.headerBtn}>إلغاء</ThemedText>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSelectMode(true);
            }}
            style={{ marginRight: 16 }}
            testID="button-select-mode"
          >
            <ThemedText style={styles.headerBtn}>تحديد</ThemedText>
          </Pressable>
        ),
    });
  }, [navigation, selectMode, exitSelectMode]);

  const load = useCallback(async () => {
    if (!vendorToken) return;
    try {
      const url = new URL("/api/vendor/products", getApiUrl());
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
  }, [vendorToken]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

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

  const confirmBulkDelete = async () => {
    if (!vendorToken || selectedIds.size === 0) return;
    const count = selectedIds.size;
    setBulkDeleting(true);
    try {
      const res = await fetch(
        new URL("/api/vendor/products/bulk-delete", getApiUrl()).toString(),
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${vendorToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ids: Array.from(selectedIds) }),
        }
      );
      const data = await res.json();
      setBulkDeleteModal(false);
      exitSelectMode();
      await load();
      if (!res.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setResultModal({ succeeded: 0, failed: count });
      } else {
        Haptics.notificationAsync(
          (data.failed ?? 0) === 0
            ? Haptics.NotificationFeedbackType.Success
            : Haptics.NotificationFeedbackType.Warning
        );
        setResultModal({ succeeded: data.succeeded ?? 0, failed: data.failed ?? 0 });
      }
    } catch {
      setBulkDeleteModal(false);
      exitSelectMode();
      setResultModal({ succeeded: 0, failed: count });
    } finally {
      setBulkDeleting(false);
    }
  };

  const toggleSelect = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAvailability = useCallback(async (productId: string, currentInStock: boolean) => {
    if (!vendorToken || togglingId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setTogglingId(productId);
    const newValue = !currentInStock;
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, inStock: newValue } : p))
    );
    try {
      await fetch(
        new URL(`/api/vendor/products/${productId}/availability`, getApiUrl()).toString(),
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${vendorToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ inStock: newValue }),
        }
      );
    } catch {
      setProducts((prev) =>
        prev.map((p) => (p.id === productId ? { ...p, inStock: currentInStock } : p))
      );
    } finally {
      setTogglingId(null);
    }
  }, [vendorToken, togglingId]);

  const handleFilterChange = (value: string) => {
    setFilterStatus(value);
    if (selectMode) {
      setSelectedIds(new Set());
    }
  };

  const filteredProducts = filterStatus
    ? products.filter((p) => p.status === filterStatus)
    : products;

  const sections = groupByCategory(filteredProducts);
  const allIds = filteredProducts.map((p) => p.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id));

  const toggleSelectAll = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allIds));
    }
  };

  const renderSectionHeader = ({ section }: { section: SectionData }) => {
    const cfg = getCategoryCfg(section.title);
    return (
      <View style={[styles.sectionHeader, { backgroundColor: cfg.bg, borderLeftColor: cfg.color }]}>
        <View style={styles.sectionHeaderLeft}>
          <View style={[styles.sectionIconBox, { backgroundColor: cfg.color + "22" }]}>
            <MaterialCommunityIcons name={cfg.icon as any} size={18} color={cfg.color} />
          </View>
          <ThemedText style={[styles.sectionTitle, { color: cfg.color }]}>{section.title}</ThemedText>
        </View>
        <View style={[styles.sectionCount, { backgroundColor: cfg.color + "22" }]}>
          <ThemedText style={[styles.sectionCountText, { color: cfg.color }]}>{section.count} منتج</ThemedText>
        </View>
      </View>
    );
  };

  const copyProduct = useCallback(async (product: Product) => {
    if (!vendorToken) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const { id, ...productData } = product;
      const copyData = {
        ...productData,
        name: `${product.name} (نسخة)`,
        status: "pending",
        inStock: true,
      };
      await fetch(new URL("/api/vendor/products", getApiUrl()).toString(), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${vendorToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(copyData),
      });
      await load();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [vendorToken, load]);

  const renderItem = ({ item }: { item: Product }) => (
    <ProductCard
      item={item}
      onDelete={() => setDeleteTarget(item.id)}
      onEdit={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        navigation.navigate("VendorEditProduct", { product: item });
      }}
      onCopy={() => copyProduct(item)}
      selectMode={selectMode}
      selected={selectedIds.has(item.id)}
      onToggleSelect={() => toggleSelect(item.id)}
      onToggleAvailability={() => toggleAvailability(item.id, item.inStock !== false)}
      togglingAvailability={togglingId === item.id}
    />
  );

  const renderEmpty = () => (
    <View style={styles.empty}>
      <MaterialCommunityIcons name="package-variant-closed" size={56} color={AppColors.gray300} />
      <ThemedText style={styles.emptyTitle}>لا توجد منتجات</ThemedText>
      <ThemedText style={styles.emptyDesc}>
        {isPending
          ? "ابدأ بإضافة منتجاتك — ستظهر للزبائن بعد تفعيل حسابك"
          : filterStatus
          ? "لا توجد منتجات بهذا الحالة"
          : "ابدأ بإضافة أول منتج لمتجرك"}
      </ThemedText>
    </View>
  );

  const filterOptions = [
    { label: "الكل", value: "" },
    { label: "قيد المراجعة", value: "pending" },
    { label: "معتمدة", value: "approved" },
    { label: "مرفوضة", value: "rejected" },
  ];

  const bulkDeleteBottom = tabBarHeight + 20;

  return (
    <View style={styles.container}>
      {/* Filter tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.filterRow, { marginTop: headerHeight + 8 }]}
      >
        {filterOptions.map((f) => (
          <Pressable
            key={f.value}
            style={[
              styles.filterChip,
              filterStatus === f.value && styles.filterChipActive,
            ]}
            onPress={() => handleFilterChange(f.value)}
          >
            <ThemedText
              style={[
                styles.filterText,
                filterStatus === f.value && styles.filterTextActive,
              ]}
            >
              {f.label}
            </ThemedText>
          </Pressable>
        ))}
      </ScrollView>

      {/* Select-all bar */}
      {selectMode && filteredProducts.length > 0 ? (
        <View style={styles.selectAllBar}>
          <Pressable
            style={styles.selectAllBtn}
            onPress={toggleSelectAll}
            testID="button-select-all"
          >
            <View style={[styles.checkbox, allSelected && styles.checkboxChecked]}>
              {allSelected ? <Feather name="check" size={12} color={AppColors.white} /> : null}
            </View>
            <ThemedText style={styles.selectAllText}>
              {allSelected ? "إلغاء تحديد الكل" : "تحديد الكل"}
            </ThemedText>
          </Pressable>
          <ThemedText style={styles.selectedCount}>
            {selectedIds.size > 0 ? `${selectedIds.size} محدد` : ""}
          </ThemedText>
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator color={ORANGE} style={{ marginTop: 40 }} />
      ) : sections.length === 0 ? (
        renderEmpty()
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: selectMode
              ? tabBarHeight + 88
              : tabBarHeight + 16,
          }}
          refreshing={refreshing}
          onRefresh={onRefresh}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          SectionSeparatorComponent={() => <View style={{ height: 4 }} />}
        />
      )}

      {/* FAB — hidden in select mode */}
      {!selectMode ? (
        <Pressable
          style={[styles.fab, { bottom: tabBarHeight + 20 }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            navigation.navigate("VendorAddProduct");
          }}
          testID="button-add-product"
        >
          <Feather name="plus" size={24} color={AppColors.white} />
        </Pressable>
      ) : null}

      {/* Bulk delete bar */}
      {selectMode ? (
        <View style={[styles.bulkBar, { bottom: bulkDeleteBottom }]}>
          <Pressable
            style={[
              styles.bulkDeleteBtn,
              selectedIds.size === 0 && styles.bulkDeleteBtnDisabled,
            ]}
            onPress={() => {
              if (selectedIds.size > 0) {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setBulkDeleteModal(true);
              }
            }}
            disabled={selectedIds.size === 0}
            testID="button-bulk-delete"
          >
            <Feather
              name="trash-2"
              size={16}
              color={selectedIds.size > 0 ? AppColors.white : AppColors.gray400}
            />
            <ThemedText
              style={[
                styles.bulkDeleteText,
                selectedIds.size === 0 && styles.bulkDeleteTextDisabled,
              ]}
            >
              {selectedIds.size > 0
                ? `حذف المحددة (${selectedIds.size})`
                : "حدد منتجات للحذف"}
            </ThemedText>
          </Pressable>
        </View>
      ) : null}

      {/* Delete confirm modal (single) */}
      <Modal transparent visible={!!deleteTarget} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.deleteModal}>
            <MaterialCommunityIcons
              name="trash-can-outline"
              size={40}
              color={AppColors.error}
              style={{ marginBottom: 12 }}
            />
            <ThemedText style={styles.deleteTitle}>حذف المنتج</ThemedText>
            <ThemedText style={styles.deleteDesc}>
              هل أنت متأكد من حذف هذا المنتج؟
            </ThemedText>
            <View style={styles.deleteActions}>
              <Pressable
                style={[styles.deleteBtn, styles.deleteBtnConfirm]}
                onPress={confirmDelete}
                disabled={deleting}
              >
                {deleting ? (
                  <ActivityIndicator color={AppColors.white} size="small" />
                ) : (
                  <ThemedText style={styles.deleteBtnText}>نعم، احذف</ThemedText>
                )}
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

      {/* Bulk delete confirm modal */}
      <Modal transparent visible={bulkDeleteModal} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.deleteModal}>
            <MaterialCommunityIcons
              name="trash-can-outline"
              size={40}
              color={AppColors.error}
              style={{ marginBottom: 12 }}
            />
            <ThemedText style={styles.deleteTitle}>حذف المنتجات المحددة</ThemedText>
            <ThemedText style={styles.deleteDesc}>
              {`سيتم حذف ${selectedIds.size} منتج. هذا الإجراء لا يمكن التراجع عنه.`}
            </ThemedText>
            <View style={styles.deleteActions}>
              <Pressable
                style={[styles.deleteBtn, styles.deleteBtnConfirm]}
                onPress={confirmBulkDelete}
                disabled={bulkDeleting}
                testID="button-confirm-bulk-delete"
              >
                {bulkDeleting ? (
                  <ActivityIndicator color={AppColors.white} size="small" />
                ) : (
                  <ThemedText style={styles.deleteBtnText}>نعم، احذف</ThemedText>
                )}
              </Pressable>
              <Pressable
                style={[styles.deleteBtn, styles.deleteBtnCancel]}
                onPress={() => setBulkDeleteModal(false)}
                disabled={bulkDeleting}
              >
                <ThemedText style={styles.deleteCancelText}>إلغاء</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Result modal */}
      <Modal transparent visible={!!resultModal} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.deleteModal}>
            <MaterialCommunityIcons
              name={resultModal?.failed === 0 ? "check-circle-outline" : "alert-circle-outline"}
              size={44}
              color={resultModal?.failed === 0 ? AppColors.success : AppColors.warning}
              style={{ marginBottom: 12 }}
            />
            <ThemedText style={styles.deleteTitle}>
              {resultModal?.failed === 0 ? "تم الحذف بنجاح" : "اكتملت العملية"}
            </ThemedText>
            <ThemedText style={styles.deleteDesc}>
              {resultModal?.failed === 0
                ? `تم حذف ${resultModal?.succeeded} منتج بنجاح`
                : `تم حذف ${resultModal?.succeeded} منتج، وفشل حذف ${resultModal?.failed} منتج`}
            </ThemedText>
            <Pressable
              style={[styles.deleteBtn, styles.deleteBtnConfirm, { width: "100%" }]}
              onPress={() => setResultModal(null)}
              testID="button-result-close"
            >
              <ThemedText style={styles.deleteBtnText}>حسناً</ThemedText>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ProductCard({
  item,
  onDelete,
  onEdit,
  onCopy,
  selectMode,
  selected,
  onToggleSelect,
  onToggleAvailability,
  togglingAvailability,
}: {
  item: Product;
  onDelete: () => void;
  onEdit: () => void;
  onCopy: () => void;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onToggleAvailability: () => void;
  togglingAvailability: boolean;
}) {
  const statusColor = STATUS_COLORS[item.status] || AppColors.gray400;
  const available = item.inStock !== false;

  return (
    <Pressable
      style={[styles.productCard, selected && styles.productCardSelected]}
      onPress={selectMode ? onToggleSelect : undefined}
      testID={`card-product-${item.id}`}
    >
      {item.imageUrl ? (
        <Image
          source={{ uri: resolveImageUrl(item.imageUrl) }}
          style={styles.productImg}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.productImg, styles.productImgPlaceholder]}>
          <MaterialCommunityIcons name="image-off" size={24} color={AppColors.gray300} />
        </View>
      )}
      {selectMode ? (
        <View style={styles.checkboxOverlay}>
          <View style={[styles.checkbox, selected && styles.checkboxChecked]}>
            {selected ? <Feather name="check" size={12} color={AppColors.white} /> : null}
          </View>
        </View>
      ) : null}
      <View style={styles.productInfo}>
        <View style={styles.productRow}>
          <ThemedText style={styles.productName} numberOfLines={1}>
            {item.name}
          </ThemedText>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + "18" }]}>
            <ThemedText style={[styles.statusText, { color: statusColor }]}>
              {STATUS_LABELS[item.status]}
            </ThemedText>
          </View>
        </View>
        <View style={styles.productBottom}>
          <ThemedText style={styles.productPrice}>
            {item.price.toLocaleString("ar-IQ")} د.ع
          </ThemedText>
          {!selectMode ? (
            <View style={styles.cardActions}>
              {/* availability pill toggle */}
              <Pressable
                style={[
                  styles.availabilityPill,
                  available ? styles.availablePill : styles.unavailablePill,
                ]}
                onPress={onToggleAvailability}
                disabled={togglingAvailability}
                testID={`button-availability-${item.id}`}
              >
                {togglingAvailability ? (
                  <ActivityIndicator size={10} color={available ? AppColors.success : AppColors.error} />
                ) : (
                  <View style={[styles.pillDot, { backgroundColor: available ? AppColors.success : AppColors.error }]} />
                )}
                <ThemedText style={[styles.availabilityText, { color: available ? AppColors.success : AppColors.error }]}>
                  {available ? "متوفر" : "نفذ"}
                </ThemedText>
              </Pressable>
              <Pressable
                style={styles.copyIconBtn}
                onPress={onCopy}
                testID={`button-copy-${item.id}`}
              >
                <Feather name="copy" size={15} color={AppColors.statusPurple} />
              </Pressable>
              <Pressable
                style={styles.editIconBtn}
                onPress={onEdit}
                testID={`button-edit-${item.id}`}
              >
                <Feather name="edit-2" size={15} color={ORANGE} />
              </Pressable>
              <Pressable
                style={styles.deleteIconBtn}
                onPress={onDelete}
                testID={`button-delete-${item.id}`}
              >
                <Feather name="trash-2" size={15} color={AppColors.error} />
              </Pressable>
            </View>
          ) : null}
        </View>
        {item.status === "rejected" && item.rejectionReason ? (
          <ThemedText style={styles.rejectionReason} numberOfLines={2}>
            السبب: {item.rejectionReason}
          </ThemedText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: ORANGE_BG },
  headerBtn: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    color: ORANGE,
  },
  filterRow: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 8,
    flexDirection: "row",
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: AppColors.white,
    borderWidth: 1.5,
    borderColor: AppColors.divider,
  },
  filterChipActive: { backgroundColor: ORANGE, borderColor: ORANGE },
  filterText: { fontFamily: "Cairo_700Bold", fontSize: 12, color: AppColors.gray500 },
  filterTextActive: { color: AppColors.white },

  // Select-all bar
  selectAllBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: ORANGE_LIGHT,
  },
  selectAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  selectAllText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    color: ORANGE,
  },
  selectedCount: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    color: ORANGE,
  },

  // Checkbox
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: ORANGE,
    backgroundColor: AppColors.white,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxChecked: {
    backgroundColor: ORANGE,
    borderColor: ORANGE,
  },

  // Checkbox overlay on card image
  checkboxOverlay: {
    position: "absolute",
    top: 8,
    left: 8,
    zIndex: 10,
  },

  // Section header
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 14,
    borderLeftWidth: 4,
  },
  sectionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sectionIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  sectionDot: {
    width: 4,
    height: 18,
    borderRadius: 2,
    backgroundColor: ORANGE,
  },
  sectionTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 15,
    textAlign: "right",
  },
  sectionCount: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  sectionCountText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 12,
  },

  // Product card
  productCard: {
    backgroundColor: AppColors.white,
    borderRadius: 20,
    marginBottom: 12,
    flexDirection: "row",
    overflow: "hidden",
    elevation: 2,
    shadowColor: "#00000018",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  productCardSelected: {
    borderWidth: 2,
    borderColor: ORANGE,
  },
  productImg: { width: 100, height: 100 },
  productImgPlaceholder: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: AppColors.secondary,
  },
  productInfo: { flex: 1, padding: 12 },
  productRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  productName: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    color: AppColors.black,
    flex: 1,
    textAlign: "right",
    marginLeft: 6,
  },
  statusBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, flexShrink: 0 },
  statusText: { fontFamily: "Cairo_700Bold", fontSize: 11 },
  productBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  productPrice: { fontFamily: "Cairo_700Bold", fontSize: 15, color: ORANGE },
  cardActions: { flexDirection: "row", gap: 8, alignItems: "center" },
  availabilityPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  availablePill: {
    backgroundColor: AppColors.successLight,
    borderColor: AppColors.successLight,
  },
  unavailablePill: {
    backgroundColor: AppColors.secondary,
    borderColor: AppColors.errorLight,
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  availabilityText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 11,
  },
  copyIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: AppColors.vendorPurpleLight,
    justifyContent: "center",
    alignItems: "center",
  },
  editIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: ORANGE_LIGHT,
    justifyContent: "center",
    alignItems: "center",
  },
  deleteIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: AppColors.errorLight,
    justifyContent: "center",
    alignItems: "center",
  },
  rejectionReason: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    color: AppColors.error,
    textAlign: "right",
    marginTop: 4,
    lineHeight: 18,
  },

  // FAB
  fab: {
    position: "absolute",
    left: 20,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: ORANGE,
    justifyContent: "center",
    alignItems: "center",
    elevation: 8,
    shadowColor: ORANGE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },

  // Bulk delete bar
  bulkBar: {
    position: "absolute",
    left: 16,
    right: 16,
  },
  bulkDeleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: AppColors.error,
    paddingVertical: 14,
    borderRadius: 16,
    elevation: 6,
  },
  bulkDeleteBtnDisabled: {
    backgroundColor: AppColors.gray100,
  },
  bulkDeleteText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    color: AppColors.white,
  },
  bulkDeleteTextDisabled: {
    color: AppColors.gray400,
  },

  // Empty
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    color: AppColors.gray400,
    textAlign: "center",
    marginTop: 12,
  },
  emptyDesc: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: AppColors.gray300,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 22,
    paddingHorizontal: 20,
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: AppColors.overlay,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  deleteModal: {
    backgroundColor: AppColors.white,
    borderRadius: 20,
    padding: 28,
    width: "100%",
    alignItems: "center",
  },
  deleteTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 18,
    color: AppColors.black,
    marginBottom: 6,
  },
  deleteDesc: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    color: AppColors.gray500,
    textAlign: "center",
    marginBottom: 24,
  },
  deleteActions: { flexDirection: "row", gap: 12, width: "100%" },
  deleteBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center" },
  deleteBtnConfirm: { backgroundColor: AppColors.error },
  deleteBtnCancel: { backgroundColor: AppColors.gray100 },
  deleteBtnText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: AppColors.white },
  deleteCancelText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: AppColors.gray700 },
});
