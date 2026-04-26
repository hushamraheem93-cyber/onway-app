import React from "react";
import {
  StyleSheet,
  View,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
} from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRoute, RouteProp } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { Spacing, AppColors, BorderRadius, Shadows } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { GradientBackground } from "@/components/GradientBackground";
import { FloatingCartBar } from "@/components/FloatingCartBar";
import { useCart } from "@/context/CartContext";
import { resolveImageUrl } from "@/utils/imageUtils";
import { formatPrice } from "@/constants/currency";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { Product } from "@/constants/categories";
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
  status: string;
}

const BUSINESS_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  restaurant: { label: "مطعم", icon: "food", color: "#E86520" },
  supermarket: { label: "سوبرماركت", icon: "cart", color: "#2E7D32" },
  pharmacy: { label: "صيدلية", icon: "medical-bag", color: "#7B1FA2" },
  bakery: { label: "مخبز", icon: "bread-slice", color: "#F57F17" },
  other: { label: "متجر", icon: "store", color: "#1565C0" },
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
  };
}

function ProductCard({
  product,
  onAdd,
  quantity,
  onIncrease,
  onDecrease,
}: {
  product: VendorProduct;
  onAdd: () => void;
  quantity: number;
  onIncrease: () => void;
  onDecrease: () => void;
}) {
  const { theme } = useTheme();
  const isOutOfStock = product.stock <= 0;
  const imageUri = resolveImageUrl(product.imageUrl);

  return (
    <View
      style={[styles.productCard, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}
      testID={`product-card-${product.id}`}
    >
      <Image
        source={{ uri: imageUri }}
        style={styles.productImage}
        contentFit="cover"
        transition={200}
      />
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
            <View style={[styles.outOfStockBadge, { backgroundColor: "#FFEAEA" }]}>
              <ThemedText type="small" style={{ color: "#E53E3E", fontWeight: "600", fontSize: 11 }}>
                نفذت الكمية
              </ThemedText>
            </View>
          ) : quantity > 0 ? (
            <View style={styles.quantityControl}>
              <Pressable
                onPress={onIncrease}
                style={[styles.qtyBtn, { backgroundColor: AppColors.primary }]}
                testID={`btn-increase-${product.id}`}
              >
                <Feather name="plus" size={14} color="#fff" />
              </Pressable>
              <ThemedText type="body" style={styles.qtyText}>
                {quantity}
              </ThemedText>
              <Pressable
                onPress={onDecrease}
                style={[styles.qtyBtn, { backgroundColor: AppColors.primary }]}
                testID={`btn-decrease-${product.id}`}
              >
                <Feather name="minus" size={14} color="#fff" />
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={onAdd}
              style={styles.addBtn}
              testID={`btn-add-${product.id}`}
            >
              <Feather name="plus" size={16} color="#fff" />
              <ThemedText type="small" style={styles.addBtnText}>
                أضف
              </ThemedText>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

export default function StoreProductsScreen() {
  const route = useRoute<StoreProductsRouteProp>();
  const { storeId } = route.params;
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { items, addToCart, updateQuantity } = useCart();

  const { data, isLoading, isError, refetch, isRefetching } = useQuery<{
    store: VendorStore;
    products: VendorProduct[];
    total: number;
  }>({
    queryKey: [`/api/stores/${storeId}/products`],
  });

  const products = data?.products ?? [];
  const store = data?.store;

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
          <Pressable onPress={() => refetch()} style={styles.retryBtn}>
            <ThemedText type="body" style={{ color: AppColors.primary, fontWeight: "600" }}>
              إعادة المحاولة
            </ThemedText>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingTop: headerHeight,
            paddingBottom: insets.bottom + Spacing.xl + (totalCartItems > 0 ? 80 : 0),
            paddingHorizontal: Spacing.lg,
          }}
          scrollIndicatorInsets={{ bottom: insets.bottom }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={AppColors.primary}
            />
          }
          ListHeaderComponent={
            store ? (
              <StoreProfileHeader store={store} theme={theme} />
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Feather name="inbox" size={64} color={theme.textSecondary} style={{ opacity: 0.4 }} />
              <ThemedText type="h4" style={[styles.emptyTitle, { color: theme.textSecondary }]}>
                لا توجد منتجات متاحة
              </ThemedText>
              <ThemedText type="small" style={[styles.emptyText, { color: theme.textSecondary }]}>
                لم تتم الموافقة على أي منتج من هذا المتجر بعد
              </ThemedText>
            </View>
          }
          renderItem={({ item }) => (
            <ProductCard
              product={item}
              quantity={getQuantity(item.id)}
              onAdd={() => handleAdd(item)}
              onIncrease={() => handleIncrease(item)}
              onDecrease={() => handleDecrease(item)}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.md }} />}
        />
      )}

      <FloatingCartBar bottomOffset={insets.bottom + 16} />
    </View>
  );
}

function StoreProfileHeader({ store, theme }: { store: VendorStore; theme: any }) {
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
    backgroundColor: "#fff",
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
    color: "#fff",
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
  productImage: {
    width: 110,
    height: 110,
  },
  productInfo: {
    flex: 1,
    padding: Spacing.md,
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  productName: {
    textAlign: "right",
    fontWeight: "600",
  },
  productDesc: {
    textAlign: "right",
    fontSize: 11,
    lineHeight: 16,
  },
  productUnit: {
    textAlign: "right",
    fontSize: 11,
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
    color: "#fff",
    fontWeight: "700",
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
    fontWeight: "700",
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
