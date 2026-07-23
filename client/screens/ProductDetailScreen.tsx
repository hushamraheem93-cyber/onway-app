import React, { useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Dimensions,
} from "react-native";
import { Image } from "expo-image";
import { useHeaderHeight } from "@react-navigation/elements";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRoute, RouteProp } from "@react-navigation/native";
import { Feather, FontAwesome, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { GradientBackground } from "@/components/GradientBackground";
import { useCart, getCartKey } from "@/context/CartContext";
import { useFavorites } from "@/context/FavoritesContext";
import { resolveImageUrl } from "@/utils/imageUtils";
import { formatPrice } from "@/constants/currency";
import { AppColors, Spacing, BorderRadius, Shadows, FontWeight} from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import { Product, ProductVariant, ProductAddon } from "@/constants/categories";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

const { width: SCREEN_W } = Dimensions.get("window");
const GALLERY_H = SCREEN_W * 0.85;

type ProductDetailRouteProp = RouteProp<RootStackParamList, "ProductDetail">;

function toCartProduct(p: {
  id: string;
  name: string;
  price: number;
  imageUrl: string;
  description?: string;
  stock: number;
  storeName?: string;
}): Product {
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

export default function ProductDetailScreen() {
  const route = useRoute<ProductDetailRouteProp>();
  const { product } = route.params;
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { items, addToCart, updateQuantity } = useCart();
  const { isFavorite, toggleFavorite } = useFavorites();

  const imageUrls: string[] = (product.imageUrls && product.imageUrls.length > 0)
    ? product.imageUrls
    : product.imageUrl
      ? [product.imageUrl]
      : [];

  const resolvedImages = imageUrls.map((u) => resolveImageUrl(u));

  const [activeIndex, setActiveIndex] = useState(0);

  // Variant & addon selection
  const productVariants: ProductVariant[] = (product as any).variants ?? [];
  const productAddons: ProductAddon[] = (product as any).addons ?? [];
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | undefined>(
    productVariants.length > 0 ? productVariants[0] : undefined
  );
  const [selectedAddons, setSelectedAddons] = useState<ProductAddon[]>([]);

  const cartProduct = toCartProduct(product);
  const currentCartKey = cartProduct.id + "__" + (selectedVariant?.id || "base");
  const cartItem = items.find((i) => getCartKey(i) === currentCartKey);
  const quantity = cartItem?.quantity ?? 0;
  const isFav = isFavorite(product.id);
  const isOutOfStock = product.stock <= 0;

  // Effective display price: base + variant adjustment + selected addons
  const displayPrice =
    product.price +
    (selectedVariant?.priceAdjustment ?? 0) +
    selectedAddons.reduce((s, a) => s + a.price, 0);

  const handleToggleAddon = (addon: ProductAddon) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedAddons((prev) =>
      prev.some((a) => a.id === addon.id) ? prev.filter((a) => a.id !== addon.id) : [...prev, addon]
    );
  };

  const handleAdd = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addToCart(cartProduct, selectedVariant, selectedAddons.length > 0 ? selectedAddons : undefined);
  };

  const handleIncrease = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateQuantity(currentCartKey, quantity + 1);
  };

  const handleDecrease = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateQuantity(currentCartKey, quantity - 1);
  };

  const handleToggleFavorite = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleFavorite(cartProduct);
  };

  const handleScroll = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / SCREEN_W);
    setActiveIndex(index);
  };

  return (
    <View style={{ flex: 1 }}>
      <GradientBackground />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: headerHeight,
          paddingBottom: insets.bottom + Spacing.xl + 80,
        }}
        showsVerticalScrollIndicator={false}
      >
        {resolvedImages.length > 0 ? (
          <View style={styles.galleryContainer}>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={handleScroll}
              scrollEventThrottle={16}
              style={styles.galleryScroll}
              testID="gallery-scroll"
            >
              {resolvedImages.map((uri, index) => (
                <Image
                  key={index}
                  source={{ uri }}
                  style={styles.galleryImage}
                  contentFit="cover"
                  transition={200}
                  testID={`gallery-image-${index}`}
                />
              ))}
            </ScrollView>

            {resolvedImages.length > 1 ? (
              <View style={styles.dotsRow}>
                {resolvedImages.map((_, index) => (
                  <View
                    key={index}
                    style={[
                      styles.dot,
                      index === activeIndex
                        ? [styles.dotActive, { backgroundColor: AppColors.primary }]
                        : { backgroundColor: AppColors.gray300 },
                    ]}
                  />
                ))}
              </View>
            ) : null}

            <Pressable
              style={[styles.favoriteBtn, { backgroundColor: isFav ? AppColors.errorLight : "rgba(255,255,255,0.92)" }]}
              onPress={handleToggleFavorite}
              testID="button-favorite"
              accessibilityRole="button"
              accessibilityLabel={isFav ? "إزالة من المفضلة" : "إضافة إلى المفضلة"}
              accessibilityState={{ selected: isFav }}
            >
              <FontAwesome
                name={isFav ? "heart" : "heart-o"}
                size={20}
                color={isFav ? AppColors.error : AppColors.gray500}
              />
            </Pressable>

            {resolvedImages.length > 1 ? (
              <View style={styles.imageCountBadge}>
                <Feather name="image" size={11} color={AppColors.white} />
                <ThemedText style={styles.imageCountText}>
                  {activeIndex + 1}/{resolvedImages.length}
                </ThemedText>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={[styles.infoCard, { backgroundColor: theme.backgroundDefault }, Shadows.md]}>
          <View style={styles.infoHeader}>
            <ThemedText type="h2" style={[styles.productName, { color: theme.text }]}>
              {product.name}
            </ThemedText>
            {product.unit ? (
              <View style={styles.unitBadge}>
                <ThemedText style={[styles.unitText, { color: AppColors.primary }]}>
                  {product.unit}
                </ThemedText>
              </View>
            ) : null}
          </View>

          {product.category ? (
            <View style={styles.categoryRow}>
              <Feather name="tag" size={12} color={theme.textSecondary} />
              <ThemedText type="small" style={[styles.categoryText, { color: theme.textSecondary }]}>
                {product.category}
              </ThemedText>
            </View>
          ) : null}

          {product.storeName ? (
            <View style={styles.storeRow}>
              <Feather name="shopping-bag" size={12} color={theme.textSecondary} />
              <ThemedText type="small" style={[styles.storeText, { color: theme.textSecondary }]}>
                {product.storeName}
              </ThemedText>
            </View>
          ) : null}

          {product.description ? (
            <ThemedText type="body" style={[styles.description, { color: theme.textSecondary }]}>
              {product.description}
            </ThemedText>
          ) : null}

          <View style={styles.priceRow}>
            <ThemedText type="h2" style={[styles.price, { color: AppColors.primary }]}>
              {formatPrice(displayPrice)}
            </ThemedText>
            {isOutOfStock ? (
              <View style={styles.outOfStockBadge}>
                <ThemedText style={styles.outOfStockText}>نفذت الكمية</ThemedText>
              </View>
            ) : null}
          </View>

          {/* Variant Selector */}
          {productVariants.length > 0 ? (
            <View style={styles.variantsSection}>
              <ThemedText style={[styles.optionLabel, { color: theme.textSecondary }]}>الحجم:</ThemedText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.variantRow}>
                {productVariants.map((v) => {
                  const isSelected = selectedVariant?.id === v.id;
                  return (
                    <Pressable
                      key={v.id}
                      onPress={() => { setSelectedVariant(v); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                      style={[
                        styles.variantChip,
                        {
                          backgroundColor: isSelected ? AppColors.primary : theme.backgroundRoot,
                          borderColor: isSelected ? AppColors.primary : (theme.border ?? AppColors.divider),
                        },
                      ]}
                    >
                      <ThemedText style={[styles.variantChipName, { color: isSelected ? AppColors.white : theme.text }]}>
                        {v.name}
                      </ThemedText>
                      {v.priceAdjustment !== 0 ? (
                        <ThemedText style={[styles.variantChipPrice, { color: isSelected ? AppColors.white + "cc" : theme.textSecondary }]}>
                          {v.priceAdjustment > 0 ? "+" : ""}{formatPrice(v.priceAdjustment)}
                        </ThemedText>
                      ) : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}

          {/* Addon Selector */}
          {productAddons.length > 0 ? (
            <View style={styles.addonsSection}>
              <ThemedText style={[styles.optionLabel, { color: theme.textSecondary }]}>الإضافات:</ThemedText>
              {productAddons.map((addon) => {
                const isSelected = selectedAddons.some((a) => a.id === addon.id);
                return (
                  <Pressable
                    key={addon.id}
                    onPress={() => handleToggleAddon(addon)}
                    style={[
                      styles.addonRow,
                      {
                        backgroundColor: isSelected ? AppColors.primary + "10" : theme.backgroundRoot,
                        borderColor: isSelected ? AppColors.primary + "50" : (theme.border ?? AppColors.divider),
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={isSelected ? "checkbox-marked-circle" : "checkbox-blank-circle-outline"}
                      size={20}
                      color={isSelected ? AppColors.primary : theme.textSecondary}
                    />
                    <ThemedText style={[styles.addonName, { color: theme.text }]}>{addon.name}</ThemedText>
                    <ThemedText style={[styles.addonPrice, { color: AppColors.primary }]}>
                      +{formatPrice(addon.price)}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
      </ScrollView>

      {!isOutOfStock ? (
        <View style={[styles.cartBar, { backgroundColor: theme.backgroundDefault, paddingBottom: insets.bottom + Spacing.md }]}>
          {quantity > 0 ? (
            <View style={styles.quantityControl}>
              <Pressable
                style={[styles.qtyBtn, { backgroundColor: AppColors.primary }]}
                onPress={handleIncrease}
                testID="button-increase"
                accessibilityRole="button"
                accessibilityLabel="زيادة الكمية"
              >
                <Feather name="plus" size={20} color={AppColors.white} />
              </Pressable>
              <ThemedText type="h3" style={[styles.qtyText, { color: theme.text }]}>
                {quantity}
              </ThemedText>
              <Pressable
                style={[styles.qtyBtn, { backgroundColor: AppColors.error }]}
                onPress={handleDecrease}
                testID="button-decrease"
                accessibilityRole="button"
                accessibilityLabel="إنقاص الكمية"
              >
                <Feather name="minus" size={20} color={AppColors.white} />
              </Pressable>
            </View>
          ) : (
            <Pressable
              style={[styles.addBtn, { backgroundColor: AppColors.primary }]}
              onPress={handleAdd}
              testID="button-add-to-cart"
              accessibilityRole="button"
              accessibilityLabel="أضف إلى السلة"
            >
              <Feather name="shopping-cart" size={18} color={AppColors.white} />
              <ThemedText style={styles.addBtnText}>أضف إلى السلة</ThemedText>
            </Pressable>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  galleryContainer: {
    position: "relative",
    height: GALLERY_H,
    backgroundColor: AppColors.vendorPurpleLight,
  },
  galleryScroll: {
    height: GALLERY_H,
  },
  galleryImage: {
    width: SCREEN_W,
    height: GALLERY_H,
  },
  dotsRow: {
    position: "absolute",
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    width: 18,
    height: 6,
    borderRadius: 3,
  },
  favoriteBtn: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: AppColors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  imageCountBadge: {
    position: "absolute",
    bottom: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: AppColors.overlay,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  imageCountText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 11,
    color: AppColors.white,
  },
  infoCard: {
    margin: Spacing.lg,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  infoHeader: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  productName: {
    flex: 1,
    textAlign: "right",
    fontWeight: FontWeight.bold,
  },
  unitBadge: {
    backgroundColor: AppColors.primary + "18",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  unitText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 12,
  },
  categoryRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
  },
  categoryText: { textAlign: "right" },
  storeRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
  },
  storeText: { textAlign: "right" },
  description: {
    textAlign: "right",
    lineHeight: 22,
    marginTop: Spacing.xs,
  },
  priceRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.sm,
  },
  price: {
    fontWeight: FontWeight.bold,
  },
  outOfStockBadge: {
    backgroundColor: AppColors.errorLight,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  outOfStockText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 12,
    color: AppColors.error,
  },
  variantsSection: { marginTop: Spacing.md },
  optionLabel: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 13,
    textAlign: "right",
    marginBottom: 8,
  },
  variantRow: { flexDirection: "row-reverse", gap: 8, paddingVertical: 2 },
  variantChip: {
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    alignItems: "center",
    gap: 2,
  },
  variantChipName: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 13,
  },
  variantChipPrice: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
  },
  addonsSection: { marginTop: Spacing.md },
  addonRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    marginBottom: 6,
  },
  addonName: {
    flex: 1,
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    textAlign: "right",
  },
  addonPrice: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
  },
  cartBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.08)",
    shadowColor: AppColors.black,
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 8,
  },
  addBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    borderRadius: BorderRadius.lg,
    paddingVertical: 14,
  },
  addBtnText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    color: AppColors.white,
  },
  quantityControl: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xl,
  },
  qtyBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyText: {
    fontWeight: FontWeight.bold,
    minWidth: 32,
    textAlign: "center",
    fontSize: 22,
  },
});
