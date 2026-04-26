import React from "react";
import {
  StyleSheet,
  View,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRoute, RouteProp } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
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

interface VendorStore {
  id: string;
  storeName: string;
  businessType: string;
  ownerName: string;
  address?: string;
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
            paddingTop: headerHeight + Spacing.lg,
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
              <View style={styles.storeHeader}>
                <View style={[styles.storeIconBox, { backgroundColor: AppColors.secondary }]}>
                  <Feather name="package" size={28} color={AppColors.primary} />
                </View>
                <View style={styles.storeInfo}>
                  <ThemedText type="h3" style={styles.storeTitle}>
                    {store.storeName}
                  </ThemedText>
                  {store.address ? (
                    <View style={styles.storeAddressRow}>
                      <Feather name="map-pin" size={12} color={theme.textSecondary} />
                      <ThemedText type="small" style={[{ color: theme.textSecondary }, styles.storeAddress]}>
                        {store.address}
                      </ThemedText>
                    </View>
                  ) : null}
                </View>
              </View>
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

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
  },
  storeHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.xl,
    padding: Spacing.lg,
    backgroundColor: "rgba(232, 101, 32, 0.06)",
    borderRadius: BorderRadius.xl,
  },
  storeIconBox: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  storeInfo: {
    flex: 1,
    alignItems: "flex-end",
    gap: 4,
  },
  storeTitle: {
    textAlign: "right",
  },
  storeAddressRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
  },
  storeAddress: {
    textAlign: "right",
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
