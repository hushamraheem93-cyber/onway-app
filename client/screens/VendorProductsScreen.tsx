import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  SectionList,
  Pressable,
  ScrollView,
  Modal,
  ActivityIndicator,
  Image,
  Animated,
} from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useFocusEffect } from "@react-navigation/native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";
import { getApiUrl } from "@/lib/query-client";
import { resolveImageUrl, getProductThumb } from "@/utils/imageUtils";
import { AppColors, FontFamily, Shadows, BorderRadius } from "@/constants/theme";
import { MAIN_CATEGORIES } from "@/constants/categories";

const ORANGE = AppColors.primary;

// ─── Interfaces (unchanged) ────────────────────────────────────────────────────

interface Product {
  imageThumbs?: string[];
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

// ─── Status config ─────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  pending:  { label: "قيد المراجعة", color: AppColors.warning, bg: AppColors.warningLight,  icon: "clock-outline"      },
  approved: { label: "معتمد",         color: AppColors.success, bg: AppColors.successLight,  icon: "check-circle-outline"},
  rejected: { label: "مرفوض",         color: AppColors.error,   bg: AppColors.errorLight,    icon: "close-circle-outline"},
  deleted:  { label: "محذوف",         color: AppColors.gray400, bg: AppColors.gray100,       icon: "delete-outline"      },
};

// ─── Category config ───────────────────────────────────────────────────────────

const CATEGORY_CFG: Record<string, { icon: string; color: string; bg: string }> = {
  "مواد غذائية":   { icon: "food-variant",           color: AppColors.warning,      bg: AppColors.warningLight   },
  "food-supplies": { icon: "food-variant",           color: AppColors.warning,      bg: AppColors.warningLight   },
  "مشروبات":       { icon: "cup-water",              color: AppColors.info,         bg: AppColors.infoLight      },
  "beverages":     { icon: "cup-water",              color: AppColors.info,         bg: AppColors.infoLight      },
  "منظفات":        { icon: "spray-bottle",           color: AppColors.statusCyan,   bg: AppColors.infoLight      },
  "cleaning-care": { icon: "spray-bottle",           color: AppColors.statusCyan,   bg: AppColors.infoLight      },
  "خضروات وفواكه": { icon: "food-apple",             color: AppColors.success,      bg: AppColors.successLight   },
  "fruits-vegetables": { icon: "food-apple",         color: AppColors.success,      bg: AppColors.successLight   },
  "لحوم":          { icon: "food-steak",             color: AppColors.error,        bg: AppColors.errorLight     },
  "meat-poultry":  { icon: "food-steak",             color: AppColors.error,        bg: AppColors.errorLight     },
  "ألبان وأجبان":  { icon: "cheese",                 color: AppColors.primary,      bg: AppColors.secondary      },
  "dairy-eggs":    { icon: "cheese",                 color: AppColors.primary,      bg: AppColors.secondary      },
  "سناكس وحلويات": { icon: "cookie",                 color: AppColors.primary,      bg: AppColors.secondary      },
  "snacks-sweets": { icon: "cookie",                 color: AppColors.primary,      bg: AppColors.secondary      },
  "شاي وقهوة":     { icon: "coffee",                 color: AppColors.gray700,      bg: AppColors.gray100        },
  "tea-coffee":    { icon: "coffee",                 color: AppColors.gray700,      bg: AppColors.gray100        },
  "مطاعم":         { icon: "silverware-fork-knife",  color: ORANGE,                 bg: AppColors.secondary      },
  "restaurants":   { icon: "silverware-fork-knife",  color: ORANGE,                 bg: AppColors.secondary      },
  "أطفال":         { icon: "baby-carriage",          color: AppColors.error,        bg: AppColors.errorLight     },
  "baby":          { icon: "baby-carriage",          color: AppColors.error,        bg: AppColors.errorLight     },
  "هدايا وورود":   { icon: "flower",                 color: AppColors.error,        bg: AppColors.errorLight     },
  "flowers":       { icon: "flower",                 color: AppColors.error,        bg: AppColors.errorLight     },
  "صيدلية":        { icon: "medical-bag",            color: AppColors.primary,      bg: AppColors.secondary      },
  "pharmacy":      { icon: "medical-bag",            color: AppColors.primary,      bg: AppColors.secondary      },
  "حقائب":         { icon: "bag-personal",           color: AppColors.error,        bg: AppColors.errorLight     },
  "women-bags":    { icon: "bag-personal",           color: AppColors.error,        bg: AppColors.errorLight     },
};

function getCategoryCfg(name: string) {
  return CATEGORY_CFG[name] || CATEGORY_CFG[name.toLowerCase()] || { icon: "tag-multiple", color: ORANGE, bg: AppColors.secondary };
}

function categoryLabel(cat: string): string {
  const match = MAIN_CATEGORIES.find((c) => c.id === cat);
  return match ? match.name : cat;
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

// ─── Skeleton card ─────────────────────────────────────────────────────────────

const SkeletonCard = React.memo(() => {
  const anim = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1,   duration: 800, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <Animated.View style={[sk.card, { opacity: anim }]}>
      <View style={sk.img} />
      <View style={sk.info}>
        <View style={sk.line} />
        <View style={[sk.line, { width: "50%", marginTop: 8 }]} />
        <View style={sk.actions}>
          <View style={sk.pill} />
          <View style={sk.btn} />
          <View style={sk.btn} />
          <View style={sk.btn} />
        </View>
      </View>
    </Animated.View>
  );
});

const sk = StyleSheet.create({
  card:    { backgroundColor: AppColors.white, borderRadius: 20, flexDirection: "row", overflow: "hidden", marginBottom: 12, height: 100 },
  img:     { width: 100, backgroundColor: AppColors.gray100 },
  info:    { flex: 1, padding: 12, justifyContent: "space-between" },
  line:    { height: 14, borderRadius: 7, backgroundColor: AppColors.gray100, width: "80%" },
  actions: { flexDirection: "row", gap: 8, alignItems: "center" },
  pill:    { height: 24, width: 60, borderRadius: 12, backgroundColor: AppColors.gray100 },
  btn:     { width: 32, height: 32, borderRadius: 8, backgroundColor: AppColors.gray100 },
});

// ─── Product card ──────────────────────────────────────────────────────────────

const ProductCard = React.memo(({
  item, onDelete, onEdit, onCopy,
  selectMode, selected, onToggleSelect,
  onToggleAvailability, togglingAvailability,
}: {
  item: Product;
  onDelete: () => void; onEdit: () => void; onCopy: () => void;
  selectMode: boolean; selected: boolean; onToggleSelect: () => void;
  onToggleAvailability: () => void; togglingAvailability: boolean;
}) => {
  const cfg = STATUS_CFG[item.status] ?? STATUS_CFG.pending;
  const available = item.inStock !== false;

  return (
    <Pressable
      style={[pc.card, selected && { borderWidth: 2, borderColor: ORANGE }]}
      onPress={selectMode ? onToggleSelect : undefined}
      testID={`card-product-${item.id}`}
    >
      {/* Image */}
      {(() => {
        const thumb = getProductThumb(item);
        const resolved = thumb ? resolveImageUrl(thumb) : "";
        return resolved ? (
          <Image
            source={{ uri: resolved }}
            style={pc.img}
            resizeMode="cover"
          />
        ) : (
          <View style={[pc.img, { backgroundColor: AppColors.secondary, justifyContent: "center", alignItems: "center" }]}>
            <MaterialCommunityIcons name="image-off" size={24} color={AppColors.gray300} />
          </View>
        );
      })()}

      {/* Select checkbox overlay */}
      {selectMode && (
        <View style={pc.checkOverlay}>
          <View style={[pc.checkbox, selected && { backgroundColor: ORANGE, borderColor: ORANGE }]}>
            {selected && <Feather name="check" size={12} color={AppColors.white} />}
          </View>
        </View>
      )}

      {/* Info */}
      <View style={pc.info}>
        {/* Name + status */}
        <View style={pc.topRow}>
          <ThemedText style={pc.name} numberOfLines={2}>{item.name}</ThemedText>
          <View style={[pc.statusChip, { backgroundColor: cfg.bg }]}>
            <MaterialCommunityIcons name={cfg.icon as any} size={11} color={cfg.color} />
            <ThemedText style={[pc.statusText, { color: cfg.color }]}>{cfg.label}</ThemedText>
          </View>
        </View>

        {/* Price + actions */}
        <View style={pc.bottomRow}>
          <ThemedText style={pc.price}>{item.price.toLocaleString("ar-IQ")} <ThemedText style={pc.priceUnit}>د.ع</ThemedText></ThemedText>
          {!selectMode && (
            <View style={pc.actions}>
              {/* Availability pill */}
              <Pressable
                style={[pc.availPill, { backgroundColor: available ? AppColors.successLight : AppColors.errorLight }]}
                onPress={onToggleAvailability}
                disabled={togglingAvailability}
                testID={`button-availability-${item.id}`}
              >
                {togglingAvailability ? (
                  <ActivityIndicator size={10} color={available ? AppColors.success : AppColors.error} />
                ) : (
                  <View style={[pc.dot, { backgroundColor: available ? AppColors.success : AppColors.error }]} />
                )}
                <ThemedText style={[pc.availText, { color: available ? AppColors.success : AppColors.error }]}>
                  {available ? "متوفر" : "نفذ"}
                </ThemedText>
              </Pressable>

              <Pressable style={[pc.iconBtn, { backgroundColor: AppColors.secondary }]} onPress={onCopy} testID={`button-copy-${item.id}`}>
                <Feather name="copy" size={14} color={ORANGE} />
              </Pressable>
              <Pressable style={[pc.iconBtn, { backgroundColor: AppColors.secondary }]} onPress={onEdit} testID={`button-edit-${item.id}`}>
                <Feather name="edit-2" size={14} color={ORANGE} />
              </Pressable>
              <Pressable style={[pc.iconBtn, { backgroundColor: AppColors.errorLight }]} onPress={onDelete} testID={`button-delete-${item.id}`}>
                <Feather name="trash-2" size={14} color={AppColors.error} />
              </Pressable>
            </View>
          )}
        </View>

        {/* Rejection reason */}
        {item.status === "rejected" && item.rejectionReason ? (
          <View style={[pc.rejectionBox, { backgroundColor: AppColors.errorLight }]}>
            <MaterialCommunityIcons name="alert-circle-outline" size={12} color={AppColors.error} />
            <ThemedText style={pc.rejectionText} numberOfLines={2}>{item.rejectionReason}</ThemedText>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
});

const pc = StyleSheet.create({
  card:        { backgroundColor: AppColors.white, borderRadius: 20, marginBottom: 10, flexDirection: "row", overflow: "hidden", ...Shadows.sm },
  img:         { width: 96, height: "100%" as any },
  checkOverlay:{ position: "absolute", top: 8, left: 8, zIndex: 10 },
  checkbox:    { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: ORANGE, backgroundColor: AppColors.white, justifyContent: "center", alignItems: "center" },
  info:        { flex: 1, padding: 12, gap: 8, justifyContent: "center" },
  topRow:      { flexDirection: "row-reverse", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  name:        { fontFamily: FontFamily.cairoBold, fontSize: 14, color: AppColors.gray800, flex: 1, textAlign: "right", lineHeight: 20 },
  statusChip:  { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, flexShrink: 0 },
  statusText:  { fontFamily: FontFamily.cairoBold, fontSize: 10 },
  bottomRow:   { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  price:       { fontFamily: FontFamily.cairoBold, fontSize: 15, color: ORANGE },
  priceUnit:   { fontFamily: FontFamily.tajawal, fontSize: 11, color: AppColors.gray500 },
  actions:     { flexDirection: "row", gap: 6, alignItems: "center" },
  availPill:   { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  dot:         { width: 6, height: 6, borderRadius: 3 },
  availText:   { fontFamily: FontFamily.cairoBold, fontSize: 10 },
  iconBtn:     { width: 30, height: 30, borderRadius: 8, justifyContent: "center", alignItems: "center" },
  rejectionBox:{ flexDirection: "row-reverse", alignItems: "center", gap: 6, padding: 8, borderRadius: 10 },
  rejectionText:{ fontFamily: FontFamily.tajawal, fontSize: 11, color: AppColors.error, flex: 1, textAlign: "right" },
});

// ─── Confirm Modal (reusable) ──────────────────────────────────────────────────

const ConfirmModal = React.memo(({
  visible, icon, iconColor, iconBg,
  title, desc, onConfirm, onCancel, confirming, confirmLabel, confirmColor,
}: {
  visible: boolean; icon: string; iconColor: string; iconBg: string;
  title: string; desc: string; onConfirm: () => void; onCancel: () => void;
  confirming: boolean; confirmLabel: string; confirmColor: string;
}) => (
  <Modal transparent visible={visible} animationType="fade">
    <View style={cm.overlay}>
      <View style={cm.box}>
        <View style={[cm.iconCircle, { backgroundColor: iconBg }]}>
          <MaterialCommunityIcons name={icon as any} size={32} color={iconColor} />
        </View>
        <ThemedText style={cm.title}>{title}</ThemedText>
        <ThemedText style={cm.desc}>{desc}</ThemedText>
        <View style={cm.btns}>
          <Pressable style={[cm.btn, { backgroundColor: confirmColor }]} onPress={onConfirm} disabled={confirming}>
            {confirming ? <ActivityIndicator color={AppColors.white} size="small" /> : <ThemedText style={cm.btnText}>{confirmLabel}</ThemedText>}
          </Pressable>
          <Pressable style={[cm.btn, { backgroundColor: AppColors.gray100 }]} onPress={onCancel} disabled={confirming}>
            <ThemedText style={[cm.btnText, { color: AppColors.gray700 }]}>إلغاء</ThemedText>
          </Pressable>
        </View>
      </View>
    </View>
  </Modal>
));

// Result modal
const ResultModal = React.memo(({ result, onClose }: { result: { succeeded: number; failed: number } | null; onClose: () => void }) => (
  <Modal transparent visible={!!result} animationType="fade">
    <View style={cm.overlay}>
      <View style={cm.box}>
        <View style={[cm.iconCircle, { backgroundColor: result?.failed === 0 ? AppColors.successLight : AppColors.warningLight }]}>
          <MaterialCommunityIcons
            name={result?.failed === 0 ? "check-circle-outline" : "alert-circle-outline"}
            size={32}
            color={result?.failed === 0 ? AppColors.success : AppColors.warning}
          />
        </View>
        <ThemedText style={cm.title}>{result?.failed === 0 ? "تم الحذف بنجاح" : "اكتملت العملية"}</ThemedText>
        <ThemedText style={cm.desc}>
          {result?.failed === 0
            ? `تم حذف ${result?.succeeded} منتج بنجاح`
            : `تم حذف ${result?.succeeded} منتج، وفشل حذف ${result?.failed} منتج`}
        </ThemedText>
        <Pressable style={[cm.btn, { backgroundColor: ORANGE, width: "100%" }]} onPress={onClose} testID="button-result-close">
          <ThemedText style={cm.btnText}>حسناً</ThemedText>
        </Pressable>
      </View>
    </View>
  </Modal>
));

const cm = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: AppColors.overlay, justifyContent: "center", alignItems: "center", padding: 24 },
  box:        { backgroundColor: AppColors.white, borderRadius: 24, padding: 28, width: "100%", alignItems: "center", gap: 12 },
  iconCircle: { width: 64, height: 64, borderRadius: 32, justifyContent: "center", alignItems: "center" },
  title:      { fontFamily: FontFamily.cairoBold, fontSize: 18, color: AppColors.gray800, textAlign: "center" },
  desc:       { fontFamily: FontFamily.tajawal, fontSize: 14, color: AppColors.gray500, textAlign: "center", lineHeight: 22 },
  btns:       { flexDirection: "row-reverse", gap: 10, width: "100%", marginTop: 4 },
  btn:        { flex: 1, borderRadius: 14, paddingVertical: 13, alignItems: "center" },
  btnText:    { fontFamily: FontFamily.cairoBold, fontSize: 14, color: AppColors.white },
});

// ─── Main Screen ───────────────────────────────────────────────────────────────

export default function VendorProductsScreen({ navigation }: any) {
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { vendorToken, vendorProfile } = useAuth();

  const [products, setProducts]         = useState<Product[]>([]);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting]         = useState(false);

  const [selectMode, setSelectMode]         = useState(false);
  const [selectedIds, setSelectedIds]       = useState<Set<string>>(new Set());
  const [bulkDeleteModal, setBulkDeleteModal] = useState(false);
  const [bulkDeleting, setBulkDeleting]     = useState(false);
  const [resultModal, setResultModal]       = useState<{ succeeded: number; failed: number } | null>(null);
  const [togglingId, setTogglingId]         = useState<string | null>(null);

  const isPending = vendorProfile?.status === "pending";

  const exitSelectMode = useCallback(() => { setSelectMode(false); setSelectedIds(new Set()); }, []);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            if (selectMode) exitSelectMode(); else setSelectMode(true);
          }}
          style={{ marginRight: 16 }}
          testID={selectMode ? "button-cancel-select" : "button-select-mode"}
        >
          <ThemedText style={{ fontFamily: FontFamily.cairoBold, fontSize: 14, color: ORANGE }}>
            {selectMode ? "إلغاء" : "تحديد"}
          </ThemedText>
        </Pressable>
      ),
    });
  }, [navigation, selectMode, exitSelectMode]);

  const load = useCallback(async () => {
    if (!vendorToken) return;
    try {
      const res = await fetch(new URL("/api/vendor/products", getApiUrl()).toString(), {
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

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(() => { setRefreshing(true); load(); }, [load]);

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
    } catch {} finally { setDeleting(false); }
  };

  const confirmBulkDelete = async () => {
    if (!vendorToken || selectedIds.size === 0) return;
    const count = selectedIds.size;
    setBulkDeleting(true);
    try {
      const res = await fetch(new URL("/api/vendor/products/bulk-delete", getApiUrl()).toString(), {
        method: "POST",
        headers: { Authorization: `Bearer ${vendorToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      const data = await res.json();
      setBulkDeleteModal(false);
      exitSelectMode();
      await load();
      if (!res.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setResultModal({ succeeded: 0, failed: count });
      } else {
        Haptics.notificationAsync((data.failed ?? 0) === 0 ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning);
        setResultModal({ succeeded: data.succeeded ?? 0, failed: data.failed ?? 0 });
      }
    } catch {
      setBulkDeleteModal(false);
      exitSelectMode();
      setResultModal({ succeeded: 0, failed: count });
    } finally { setBulkDeleting(false); }
  };

  const toggleSelect = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const toggleAvailability = useCallback(async (productId: string, currentInStock: boolean) => {
    if (!vendorToken || togglingId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setTogglingId(productId);
    const newValue = !currentInStock;
    setProducts((prev) => prev.map((p) => (p.id === productId ? { ...p, inStock: newValue } : p)));
    try {
      await fetch(new URL(`/api/vendor/products/${productId}/availability`, getApiUrl()).toString(), {
        method: "PATCH",
        headers: { Authorization: `Bearer ${vendorToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ inStock: newValue }),
      });
    } catch {
      setProducts((prev) => prev.map((p) => (p.id === productId ? { ...p, inStock: currentInStock } : p)));
    } finally { setTogglingId(null); }
  }, [vendorToken, togglingId]);

  const handleFilterChange = (value: string) => {
    setFilterStatus(value);
    if (selectMode) setSelectedIds(new Set());
  };

  const copyProduct = useCallback(async (product: Product) => {
    if (!vendorToken) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const { id, ...productData } = product;
      await fetch(new URL("/api/vendor/products", getApiUrl()).toString(), {
        method: "POST",
        headers: { Authorization: `Bearer ${vendorToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...productData, name: `${product.name} (نسخة)`, status: "pending", inStock: true }),
      });
      await load();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); }
  }, [vendorToken, load]);

  const filteredProducts = filterStatus ? products.filter((p) => p.status === filterStatus) : products;
  const sections         = groupByCategory(filteredProducts);
  const allIds           = filteredProducts.map((p) => p.id);
  const allSelected      = allIds.length > 0 && allIds.every((id) => selectedIds.has(id));

  const toggleSelectAll = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedIds(allSelected ? new Set() : new Set(allIds));
  };

  const filterOptions = [
    { label: "الكل", value: "", icon: "apps", color: AppColors.gray500 },
    { label: "مراجعة", value: "pending",  icon: "clock-outline",       color: AppColors.warning },
    { label: "معتمدة", value: "approved", icon: "check-circle-outline", color: AppColors.success },
    { label: "مرفوضة", value: "rejected", icon: "close-circle-outline", color: AppColors.error   },
  ];

  const renderSectionHeader = ({ section }: { section: SectionData }) => {
    const cfg = getCategoryCfg(section.title);
    return (
      <View style={[sh.wrap, { backgroundColor: cfg.bg, borderRightColor: cfg.color }]}>
        <View style={sh.left}>
          <View style={[sh.iconBox, { backgroundColor: cfg.color + "22" }]}>
            <MaterialCommunityIcons name={cfg.icon as any} size={16} color={cfg.color} />
          </View>
          <ThemedText style={[sh.title, { color: cfg.color }]}>{categoryLabel(section.title)}</ThemedText>
        </View>
        <View style={[sh.badge, { backgroundColor: cfg.color + "22" }]}>
          <ThemedText style={[sh.badgeText, { color: cfg.color }]}>{section.count} منتج</ThemedText>
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: AppColors.background }}>

      {/* Filter bar */}
      <View style={[fb.bar, { paddingTop: headerHeight }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={fb.row}>
          {filterOptions.map((f) => {
            const active = filterStatus === f.value;
            return (
              <Pressable
                key={f.value}
                style={[fb.chip, active && { backgroundColor: f.color, borderColor: f.color }]}
                onPress={() => handleFilterChange(f.value)}
              >
                <MaterialCommunityIcons name={f.icon as any} size={13} color={active ? AppColors.white : AppColors.gray500} />
                <ThemedText style={[fb.chipText, active && { color: AppColors.white }]}>{f.label}</ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Select-all bar */}
        {selectMode && filteredProducts.length > 0 && (
          <View style={fb.selectBar}>
            <Pressable style={fb.selectAllBtn} onPress={toggleSelectAll} testID="button-select-all">
              <View style={[fb.checkbox, allSelected && { backgroundColor: ORANGE, borderColor: ORANGE }]}>
                {allSelected && <Feather name="check" size={12} color={AppColors.white} />}
              </View>
              <ThemedText style={[fb.selectAllText, { color: ORANGE }]}>
                {allSelected ? "إلغاء تحديد الكل" : "تحديد الكل"}
              </ThemedText>
            </Pressable>
            {selectedIds.size > 0 && (
              <View style={[fb.countBadge, { backgroundColor: ORANGE }]}>
                <ThemedText style={fb.countText}>{selectedIds.size} محدد</ThemedText>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Content */}
      {loading ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, gap: 10 }}>
          <SkeletonCard /><SkeletonCard /><SkeletonCard />
        </ScrollView>
      ) : sections.length === 0 ? (
        <View style={empty.wrap}>
          <View style={[empty.circle, { backgroundColor: ORANGE + "12" }]}>
            <MaterialCommunityIcons name="package-variant-closed" size={40} color={ORANGE} style={{ opacity: 0.5 }} />
          </View>
          <ThemedText style={empty.title}>لا توجد منتجات</ThemedText>
          <ThemedText style={empty.desc}>
            {isPending ? "ابدأ بإضافة منتجاتك — ستظهر للزبائن بعد تفعيل حسابك"
              : filterStatus ? "لا توجد منتجات بهذه الحالة"
              : "ابدأ بإضافة أول منتج لمتجرك"}
          </ThemedText>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ProductCard
              item={item}
              onDelete={() => setDeleteTarget(item.id)}
              onEdit={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); navigation.navigate("VendorEditProduct", { product: item }); }}
              onCopy={() => copyProduct(item)}
              selectMode={selectMode}
              selected={selectedIds.has(item.id)}
              onToggleSelect={() => toggleSelect(item.id)}
              onToggleAvailability={() => toggleAvailability(item.id, item.inStock !== false)}
              togglingAvailability={togglingId === item.id}
            />
          )}
          renderSectionHeader={renderSectionHeader}
          contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: selectMode ? tabBarHeight + 88 : tabBarHeight + 16, flexGrow: 1 }}
          refreshing={refreshing}
          onRefresh={onRefresh}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          SectionSeparatorComponent={() => <View style={{ height: 4 }} />}
        />
      )}

      {/* FAB */}
      {!selectMode && (
        <Pressable
          style={[fab.btn, { bottom: tabBarHeight + 20 }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); navigation.navigate("VendorAddProduct"); }}
          testID="button-add-product"
        >
          <Feather name="plus" size={26} color={AppColors.white} />
        </Pressable>
      )}

      {/* Bulk delete bar */}
      {selectMode && (
        <View style={[bulk.bar, { bottom: tabBarHeight + 16 }]}>
          <Pressable
            style={[bulk.btn, selectedIds.size === 0 && bulk.btnDisabled]}
            onPress={() => { if (selectedIds.size > 0) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setBulkDeleteModal(true); } }}
            disabled={selectedIds.size === 0}
            testID="button-bulk-delete"
          >
            <Feather name="trash-2" size={16} color={selectedIds.size > 0 ? AppColors.white : AppColors.gray400} />
            <ThemedText style={[bulk.text, selectedIds.size === 0 && { color: AppColors.gray400 }]}>
              {selectedIds.size > 0 ? `حذف المحددة (${selectedIds.size})` : "حدد منتجات للحذف"}
            </ThemedText>
          </Pressable>
        </View>
      )}

      {/* Modals */}
      <ConfirmModal
        visible={!!deleteTarget}
        icon="trash-can-outline" iconColor={AppColors.error} iconBg={AppColors.errorLight}
        title="حذف المنتج" desc="هل أنت متأكد من حذف هذا المنتج؟"
        onConfirm={confirmDelete} onCancel={() => setDeleteTarget(null)}
        confirming={deleting} confirmLabel="نعم، احذف" confirmColor={AppColors.error}
      />
      <ConfirmModal
        visible={bulkDeleteModal}
        icon="trash-can-outline" iconColor={AppColors.error} iconBg={AppColors.errorLight}
        title="حذف المنتجات المحددة" desc={`سيتم حذف ${selectedIds.size} منتج. هذا الإجراء لا يمكن التراجع عنه.`}
        onConfirm={confirmBulkDelete} onCancel={() => setBulkDeleteModal(false)}
        confirming={bulkDeleting} confirmLabel="نعم، احذف" confirmColor={AppColors.error}
      />
      <ResultModal result={resultModal} onClose={() => setResultModal(null)} />
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────────

const fb = StyleSheet.create({
  bar:          { backgroundColor: AppColors.white, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: AppColors.divider, ...Shadows.xs },
  row:          { flexDirection: "row", paddingHorizontal: 14, paddingTop: 10, paddingBottom: 2, gap: 8 },
  chip:         { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: AppColors.white, borderWidth: 1.5, borderColor: AppColors.divider },
  chipText:     { fontFamily: FontFamily.cairoBold, fontSize: 12, color: AppColors.gray500 },
  selectBar:    { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 8, backgroundColor: AppColors.secondary },
  selectAllBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  checkbox:     { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: ORANGE, backgroundColor: AppColors.white, justifyContent: "center", alignItems: "center" },
  selectAllText:{ fontFamily: FontFamily.cairoBold, fontSize: 13, color: ORANGE },
  countBadge:   { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 },
  countText:    { fontFamily: FontFamily.cairoBold, fontSize: 12, color: AppColors.white },
});

const sh = StyleSheet.create({
  wrap:     { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, paddingHorizontal: 14, marginTop: 10, marginBottom: 6, borderRadius: 14, borderRightWidth: 4 },
  left:     { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  iconBox:  { width: 32, height: 32, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  title:    { fontFamily: FontFamily.cairoBold, fontSize: 14, textAlign: "right" },
  badge:    { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText:{ fontFamily: FontFamily.cairoBold, fontSize: 11 },
});

const fab = StyleSheet.create({
  btn: { position: "absolute", left: 20, width: 60, height: 60, borderRadius: 30, backgroundColor: ORANGE, justifyContent: "center", alignItems: "center", ...Shadows.lg },
});

const bulk = StyleSheet.create({
  bar:        { position: "absolute", left: 14, right: 14 },
  btn:        { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: AppColors.error, paddingVertical: 14, borderRadius: 16, ...Shadows.md },
  btnDisabled:{ backgroundColor: AppColors.gray100 },
  text:       { fontFamily: FontFamily.cairoBold, fontSize: 14, color: AppColors.white },
});

const empty = StyleSheet.create({
  wrap:  { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingTop: 80 },
  circle:{ width: 88, height: 88, borderRadius: 44, justifyContent: "center", alignItems: "center" },
  title: { fontFamily: FontFamily.cairoBold, fontSize: 17, color: AppColors.gray700, textAlign: "center" },
  desc:  { fontFamily: FontFamily.tajawal, fontSize: 13, color: AppColors.gray400, textAlign: "center", lineHeight: 22, paddingHorizontal: 32 },
});
