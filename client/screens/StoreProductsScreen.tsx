import React, { useState, useMemo, useEffect } from "react";
import {
  StyleSheet,
  View,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  TextInput,
  ScrollView,
} from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRoute, RouteProp, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { Spacing, AppColors, BorderRadius, Shadows, FontWeight} from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { GradientBackground } from "@/components/GradientBackground";
import { FloatingCartBar } from "@/components/FloatingCartBar";
import { useCart } from "@/context/CartContext";
import { resolveImageUrl } from "@/utils/imageUtils";
import { formatPrice } from "@/constants/currency";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { Product, MAIN_CATEGORIES } from "@/constants/categories";
import { getApiUrl } from "@/lib/query-client";

const SCREEN_W = Dimensions.get("window").width;
const COVER_H = 160;
const AVATAR_SIZE = 72;

type StoreProductsRouteProp = RouteProp<RootStackParamList, "StoreProducts">;

interface VendorProduct {
  id: string;
  vendorId: string;
  storeName: string;
  name: string;
  description?: string;
  price: number;
  category: string;
  stock: number;
  unit?: string;
  imageUrl: string;
  imageUrls?: string[];
  status: string;
}

const BUSINESS_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  restaurant: { label: "مطعم", icon: "food", color: AppColors.primary },
  supermarket: { label: "سوبرماركت", icon: "cart", color: AppColors.success },
  pharmacy: { label: "صيدلية", icon: "medical-bag", color: AppColors.vendorPurple },
  bakery: { label: "مخبز", icon: "bread-slice", color: AppColors.warning },
  other: { label: "متجر", icon: "store", color: AppColors.driverBlue },
};

function resolveUrl(path?: string): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  try { return new URL(path, getApiUrl()).toString(); } catch { return null; }
}

interface VendorStore {
  id: string;
  storeName: string;
  businessType: string;
  ownerName?: string;
  address?: string;
  bio?: string;
  profileImageUrl?: string;
  coverImageUrl?: string;
  rating?: number | null;
  ratingCount?: number;
}

function toCartProduct(p: VendorProduct): Product {
  return {
    id: p.id,
    categoryId: "vendor-market",
    name: p.name,
    price: p.price,
    image: p.imageUrl,
    description: p.description || "",
    inStock: p.stock > 0,
    restaurant: p.storeName,
    vendorId: p.vendorId,
  };
}

function ProductCard({
  product,
  onAdd,
  quantity,
  onIncrease,
  onDecrease,
  onPress,
}: {
  product: VendorProduct;
  onAdd: () => void;
  quantity: number;
  onIncrease: () => void;
  onDecrease: () => void;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const isOutOfStock = product.stock <= 0;
  const imageUri = resolveImageUrl(product.imageUrl);
  const hasMultipleImages = product.imageUrls && product.imageUrls.length > 1;

  return (
    <Pressable
      onPress={onPress}
      style={[styles.productCard, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}
      testID={`product-card-${product.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${product.name}، ${formatPrice(product.price)}${isOutOfStock ? "، نفذت الكمية" : ""}`}
    >
      <View style={styles.productImageWrap}>
        <Image
          source={{ uri: imageUri }}
          style={styles.productImage}
          contentFit="cover"
          transition={200}
        />
        {hasMultipleImages ? (
          <View style={styles.multiImageBadge}>
            <Feather name="image" size={10} color={AppColors.white} />
            <ThemedText style={styles.multiImageCount}>
              {product.imageUrls!.length}
            </ThemedText>
          </View>
        ) : null}
      </View>
      <View style={styles.productInfo}>
        <ThemedText type="body" style={styles.productName} numberOfLines={2}>
          {product.name}
        </ThemedText>
        {product.description ? (
          <ThemedText type="small" style={[styles.productDesc, { color: theme.textSecondary }]} numberOfLines={2}>
            {product.description}
          </ThemedText>
        ) : null}
        {product.unit ? (
          <ThemedText type="small" style={[styles.productUnit, { color: theme.textSecondary }]}>
            {product.unit}
          </ThemedText>
        ) : null}
        <View style={styles.productFooter}>
          <ThemedText type="h4" style={[styles.productPrice, { color: AppColors.primary }]}>
            {formatPrice(product.price)}
          </ThemedText>
          {isOutOfStock ? (
            <View style={[styles.outOfStockBadge, { backgroundColor: AppColors.errorLight }]}>
              <ThemedText type="small" style={{ color: AppColors.error, fontWeight: FontWeight.semiBold, fontSize: 11 }}>
                نفذت الكمية
              </ThemedText>
            </View>
          ) : quantity > 0 ? (
            <View style={styles.quantityControl}>
              <Pressable
                onPress={onIncrease}
                style={[styles.qtyBtn, { backgroundColor: AppColors.primary }]}
                testID={`btn-increase-${product.id}`}
                accessibilityRole="button"
                accessibilityLabel="زيادة الكمية"
              >
                <Feather name="plus" size={14} color={AppColors.white} />
              </Pressable>
              <ThemedText type="body" style={styles.qtyText}>
                {quantity}
              </ThemedText>
              <Pressable
                onPress={onDecrease}
                style={[styles.qtyBtn, { backgroundColor: AppColors.primary }]}
                testID={`btn-decrease-${product.id}`}
                accessibilityRole="button"
                accessibilityLabel="إنقاص الكمية"
              >
                <Feather name="minus" size={14} color={AppColors.white} />
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={onAdd}
              style={styles.addBtn}
              testID={`btn-add-${product.id}`}
              accessibilityRole="button"
              accessibilityLabel={`أضف ${product.name} إلى السلة`}
            >
              <Feather name="plus" size={16} color={AppColors.white} />
              <ThemedText type="small" style={styles.addBtnText}>
                أضف
              </ThemedText>
            </Pressable>
          )}
        </View>
      </View>
    </Pressable>
  );
}

// Show a human Arabic label for a category id/slug instead of the raw stored
// value (e.g. "fruits-vegetables" → "الخضروات والفواكه").
function categoryLabel(cat: string): string {
  const match = MAIN_CATEGORIES.find((c) => c.id === cat);
  return match ? match.name : cat;
}

function SearchFilterBar({
  searchQuery,
  onSearchChange,
  categories,
  selectedCategory,
  onCategorySelect,
  theme,
}: {
  searchQuery: string;
  onSearchChange: (text: string) => void;
  categories: string[];
  selectedCategory: string | null;
  onCategorySelect: (cat: string | null) => void;
  theme: any;
}) {
  return (
    <View style={sfStyles.container}>
      <View style={[sfStyles.searchRow, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
        <Feather name="search" size={16} color={theme.textSecondary} style={sfStyles.searchIcon} />
        <TextInput
          value={searchQuery}
          onChangeText={onSearchChange}
          placeholder="ابحث في المنتجات..."
          placeholderTextColor={theme.textSecondary}
          style={[sfStyles.searchInput, { color: theme.textPrimary }]}
          textAlign="right"
          returnKeyType="search"
          testID="input-product-search"
        />
        {searchQuery.length > 0 ? (
          <Pressable
            onPress={() => onSearchChange("")}
            testID="btn-clear-search"
            accessibilityRole="button"
            accessibilityLabel="مسح البحث"
            hitSlop={8}
          >
            <Feather name="x" size={16} color={theme.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      {categories.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={sfStyles.chipsRow}
        >
          <Pressable
            onPress={() => onCategorySelect(null)}
            style={[
              sfStyles.chip,
              {
                backgroundColor: selectedCategory === null ? AppColors.primary : theme.backgroundDefault,
                borderColor: selectedCategory === null ? AppColors.primary : theme.border,
              },
            ]}
            testID="chip-category-all"
            accessibilityRole="button"
            accessibilityLabel="كل الفئات"
            accessibilityState={{ selected: selectedCategory === null }}
          >
            <ThemedText
              type="small"
              style={[
                sfStyles.chipText,
                { color: selectedCategory === null ? AppColors.white : theme.textSecondary },
              ]}
            >
              الكل
            </ThemedText>
          </Pressable>

          {categories.map((cat) => {
            const active = selectedCategory === cat;
            return (
              <Pressable
                key={cat}
                onPress={() => onCategorySelect(active ? null : cat)}
                style={[
                  sfStyles.chip,
                  {
                    backgroundColor: active ? AppColors.primary : theme.backgroundDefault,
                    borderColor: active ? AppColors.primary : theme.border,
                  },
                ]}
                testID={`chip-category-${cat.replace(/\s+/g, "-")}`}
                accessibilityRole="button"
                accessibilityLabel={categoryLabel(cat)}
                accessibilityState={{ selected: active }}
              >
                <ThemedText
                  type="small"
                  style={[sfStyles.chipText, { color: active ? AppColors.white : theme.textSecondary }]}
                >
                  {categoryLabel(cat)}
                </ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}

export default function StoreProductsScreen() {
  const route = useRoute<StoreProductsRouteProp>();
  const { storeId, initialCategoryFilter } = route.params;
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { items, addToCart, updateQuantity } = useCart();

  const handleProductPress = (product: VendorProduct) => {
    navigation.navigate("ProductDetail", { product });
  };

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const { data, isLoading, isError, refetch, isRefetching } = useQuery<{
    store: VendorStore;
    products: VendorProduct[];
    total: number;
  }>({
    queryKey: [`/api/stores/${storeId}/products`],
  });

  const products = data?.products ?? [];
  const store = data?.store;

  // Auto-apply initialCategoryFilter once products load
  useEffect(() => {
    if (!initialCategoryFilter || products.length === 0) return;
    const match = products.find((p) => p.category === initialCategoryFilter);
    if (match) setSelectedCategory(initialCategoryFilter);
  }, [products, initialCategoryFilter]);

  const categories = useMemo(() => {
    const seen = new Set<string>();
    products.forEach((p) => {
      if (p.category) seen.add(p.category);
    });
    return Array.from(seen);
  }, [products]);

  const filteredProducts = useMemo(() => {
    let result = products;
    if (selectedCategory) {
      result = result.filter((p) => p.category === selectedCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((p) => p.name.toLowerCase().includes(q));
    }
    return result;
  }, [products, selectedCategory, searchQuery]);

  const getQuantity = (productId: string) => {
    const item = items.find((i) => i.product.id === productId);
    return item?.quantity ?? 0;
  };

  const handleAdd = (product: VendorProduct) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    addToCart(toCartProduct(product));
  };

  const handleIncrease = (product: VendorProduct) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const qty = getQuantity(product.id);
    updateQuantity(product.id, qty + 1);
  };

  const handleDecrease = (product: VendorProduct) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const qty = getQuantity(product.id);
    updateQuantity(product.id, qty - 1);
  };

  const totalCartItems = items.reduce((sum, i) => sum + i.quantity, 0);

  const isFiltering = searchQuery.trim().length > 0 || selectedCategory !== null;

  return (
    <View style={{ flex: 1 }}>
      <GradientBackground />
      {isLoading ? (
        <View style={[styles.center, { paddingTop: headerHeight }]}>
          <ActivityIndicator size="large" color={AppColors.primary} />
        </View>
      ) : isError ? (
        <View style={[styles.center, { paddingTop: headerHeight }]}>
          <Feather name="wifi-off" size={48} color={theme.textSecondary} />
          <ThemedText type="body" style={[styles.emptyText, { color: theme.textSecondary }]}>
            تعذّر تحميل المنتجات
          </ThemedText>
          <Pressable
            onPress={() => refetch()}
            style={styles.retryBtn}
            accessibilityRole="button"
            accessibilityLabel="إعادة المحاولة"
          >
            <ThemedText type="body" style={{ color: AppColors.primary, fontWeight: FontWeight.semiBold }}>
              إعادة المحاولة
            </ThemedText>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filteredProducts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingTop: headerHeight,
            paddingBottom: insets.bottom + Spacing.xl + (totalCartItems > 0 ? 80 : 0),
            paddingHorizontal: Spacing.lg,
          }}
          scrollIndicatorInsets={{ bottom: insets.bottom }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={AppColors.primary}
            />
          }
          ListHeaderComponent={
            <>
              {store ? (
                <StoreProfileHeader
                  store={store}
                  theme={theme}
                  onRatingsPress={() => navigation.navigate("StoreRatings", { storeId, storeName: store.storeName })}
                />
              ) : null}
              <SearchFilterBar
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                categories={categories}
                selectedCategory={selectedCategory}
                onCategorySelect={setSelectedCategory}
                theme={theme}
              />
            </>
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Feather
                name={isFiltering ? "search" : "inbox"}
                size={64}
                color={theme.textSecondary}
                style={{ opacity: 0.4 }}
              />
              <ThemedText type="h4" style={[styles.emptyTitle, { color: theme.textSecondary }]}>
                {isFiltering ? "لا توجد نتائج" : "لا توجد منتجات متاحة"}
              </ThemedText>
              <ThemedText type="small" style={[styles.emptyText, { color: theme.textSecondary }]}>
                {isFiltering
                  ? "جرّب تغيير كلمة البحث أو الفئة"
                  : "لم تتم الموافقة على أي منتج من هذا المتجر بعد"}
              </ThemedText>
              {isFiltering ? (
                <Pressable
                  onPress={() => { setSearchQuery(""); setSelectedCategory(null); }}
                  style={styles.retryBtn}
                  testID="btn-clear-filters"
                  accessibilityRole="button"
                  accessibilityLabel="مسح الفلاتر"
                >
                  <ThemedText type="body" style={{ color: AppColors.primary, fontWeight: FontWeight.semiBold }}>
                    مسح الفلاتر
                  </ThemedText>
                </Pressable>
              ) : null}
            </View>
          }
          renderItem={({ item }) => (
            <ProductCard
              product={item}
              quantity={getQuantity(item.id)}
              onAdd={() => handleAdd(item)}
              onIncrease={() => handleIncrease(item)}
              onDecrease={() => handleDecrease(item)}
              onPress={() => handleProductPress(item)}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.md }} />}
        />
      )}

      <FloatingCartBar bottomOffset={insets.bottom + 16} />
    </View>
  );
}

function StoreProfileHeader({ store, theme, onRatingsPress }: { store: VendorStore; theme: any; onRatingsPress?: () => void }) {
  const cfg = BUSINESS_CONFIG[store.businessType] || BUSINESS_CONFIG.other;
  const avatarUrl = resolveUrl(store.profileImageUrl);
  const coverUrl = resolveUrl(store.coverImageUrl);

  return (
    <View style={hStyles.wrapper}>
      {/* Cover */}
      <View style={[hStyles.cover, { backgroundColor: cfg.color + "22" }]}>
        {coverUrl ? (
          <Image
            source={{ uri: coverUrl }}
            style={StyleSheet.absoluteFillObject}
            contentFit="cover"
          />
        ) : null}
        {coverUrl ? <View style={hStyles.coverOverlay} /> : null}
      </View>

      {/* Avatar + info */}
      <View style={hStyles.infoRow}>
        <View style={[hStyles.avatarWrap, { borderColor: theme.backgroundDefault }]}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={hStyles.avatar} contentFit="cover" />
          ) : (
            <View style={[hStyles.avatarFallback, { backgroundColor: cfg.color }]}>
              <ThemedText style={hStyles.avatarLetter}>
                {store.storeName?.[0] || "م"}
              </ThemedText>
            </View>
          )}
        </View>

        <View style={hStyles.textBlock}>
          <View style={[hStyles.typeBadge, { backgroundColor: cfg.color + "18" }]}>
            <MaterialCommunityIcons name={cfg.icon as any} size={12} color={cfg.color} />
            <ThemedText style={[hStyles.typeLabel, { color: cfg.color }]}>
              {cfg.label}
            </ThemedText>
          </View>
          <ThemedText type="h3" style={[hStyles.storeName, { color: theme.textPrimary }]}>
            {store.storeName}
          </ThemedText>
          {store.bio ? (
            <ThemedText type="small" style={[hStyles.bio, { color: theme.textSecondary }]} numberOfLines={2}>
              {store.bio}
            </ThemedText>
          ) : null}
          {store.address ? (
            <View style={hStyles.addressRow}>
              <Feather name="map-pin" size={11} color={theme.textSecondary} />
              <ThemedText type="small" style={[hStyles.addressText, { color: theme.textSecondary }]}>
                {store.address}
              </ThemedText>
            </View>
          ) : null}

          {/* Rating row */}
          {store.rating != null ? (
            <Pressable
              onPress={onRatingsPress}
              style={hStyles.ratingRow}
              accessibilityRole="button"
              accessibilityLabel="عرض تقييمات المتجر"
            >
              <View style={hStyles.ratingBadge}>
                <Feather name="star" size={12} color={AppColors.white} />
                <ThemedText type="small" style={hStyles.ratingBadgeText}>
                  {(store.rating as number).toFixed(1)}
                </ThemedText>
              </View>
              <ThemedText type="small" style={[hStyles.ratingCount, { color: theme.textSecondary }]}>
                ({store.ratingCount ?? 0} تقييم)
              </ThemedText>
              {onRatingsPress ? (
                <ThemedText type="small" style={[hStyles.ratingLink, { color: AppColors.primary }]}>
                  عرض التقييمات
                </ThemedText>
              ) : null}
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const hStyles = StyleSheet.create({
  wrapper: { marginBottom: Spacing.lg, marginHorizontal: -Spacing.lg },
  cover: { height: COVER_H, overflow: "hidden" },
  coverOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  infoRow: {
    flexDirection: "row-reverse",
    alignItems: "flex-end",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    marginTop: -(AVATAR_SIZE / 2),
    gap: Spacing.md,
  },
  avatarWrap: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 3,
    overflow: "hidden",
    elevation: 4,
    backgroundColor: AppColors.white,
  },
  avatar: { width: "100%", height: "100%" },
  avatarFallback: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarLetter: {
    fontFamily: "Cairo_700Bold",
    fontSize: 28,
    color: AppColors.white,
    lineHeight: 34,
  },
  textBlock: { flex: 1, alignItems: "flex-end", gap: 3 },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    alignSelf: "flex-end",
  },
  typeLabel: { fontFamily: "Cairo_700Bold", fontSize: 11 },
  storeName: { textAlign: "right" },
  bio: { textAlign: "right", fontStyle: "italic" },
  addressRow: { flexDirection: "row-reverse", alignItems: "center", gap: 4 },
  addressText: { textAlign: "right" },
  ratingRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" as const },
  ratingBadge: { flexDirection: "row-reverse", alignItems: "center", gap: 4, backgroundColor: AppColors.success, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  ratingBadgeText: { fontFamily: "Cairo_700Bold", color: AppColors.white, includeFontPadding: false },
  ratingText: { fontFamily: "Cairo_700Bold" },
  ratingCount: { fontFamily: "Cairo_400Regular" },
  ratingLink: { fontFamily: "Cairo_700Bold", marginRight: 4, textDecorationLine: "underline" as const },
});

const sfStyles = StyleSheet.create({
  container: {
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  searchRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  searchIcon: {
    marginLeft: Spacing.xs,
  },
  searchInput: {
    flex: 1,
    fontSize: 16, // ≥16 for readability + prevents iOS auto-zoom on focus
    fontFamily: "Cairo_400Regular",
    paddingVertical: 0,
  },
  chipsRow: {
    flexDirection: "row-reverse",
    gap: Spacing.sm,
    paddingBottom: 2,
  },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full ?? 999,
    borderWidth: 1,
  },
  chipText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 12,
  },
});

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
  },
  productCard: {
    borderRadius: BorderRadius.xl,
    overflow: "hidden",
    flexDirection: "row-reverse",
  },
  productImageWrap: {
    position: "relative",
    width: 110,
    height: 110,
  },
  productImage: {
    width: 110,
    height: 110,
  },
  multiImageBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: AppColors.overlay,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  multiImageCount: {
    fontFamily: "Cairo_700Bold",
    fontSize: 10,
    color: AppColors.white,
  },
  productInfo: {
    flex: 1,
    padding: Spacing.md,
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  productName: {
    textAlign: "right",
    fontWeight: FontWeight.semiBold,
  },
  productDesc: {
    textAlign: "right",
    fontSize: 12,
    lineHeight: 17,
  },
  productUnit: {
    textAlign: "right",
    fontSize: 12,
  },
  productFooter: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginTop: Spacing.sm,
  },
  productPrice: {
    textAlign: "right",
  },
  addBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: AppColors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    gap: 4,
  },
  addBtnText: {
    color: AppColors.white,
    fontWeight: FontWeight.bold,
  },
  quantityControl: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Spacing.sm,
  },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyText: {
    fontWeight: FontWeight.bold,
    minWidth: 24,
    textAlign: "center",
  },
  outOfStockBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  emptyContainer: {
    alignItems: "center",
    paddingTop: 60,
    gap: Spacing.md,
  },
  emptyTitle: {
    textAlign: "center",
  },
  emptyText: {
    textAlign: "center",
  },
  retryBtn: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
});
