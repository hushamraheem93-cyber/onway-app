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
import { Feather, FontAwesome } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { GradientBackground } from "@/components/GradientBackground";
import { useCart } from "@/context/CartContext";
import { useFavorites } from "@/context/FavoritesContext";
import { resolveImageUrl } from "@/utils/imageUtils";
import { formatPrice } from "@/constants/currency";
import { AppColors, Spacing, BorderRadius, Shadows, FontWeight} from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import { Product } from "@/constants/categories";
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

  const cartItem = items.find((i) => i.product.id === product.id);
  const quantity = cartItem?.quantity ?? 0;
  const isFav = isFavorite(product.id);
  const isOutOfStock = product.stock <= 0;

  const cartProduct = toCartProduct(product);

  const handleAdd = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addToCart(cartProduct);
  };

  const handleIncrease = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateQuantity(product.id, quantity + 1);
  };

  const handleDecrease = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateQuantity(product.id, quantity - 1);
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
              {formatPrice(product.price)}
            </ThemedText>
            {isOutOfStock ? (
              <View style={styles.outOfStockBadge}>
                <ThemedText style={styles.outOfStockText}>نفذت الكمية</ThemedText>
              </View>
            ) : null}
          </View>
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
              >
                <Feather name="minus" size={20} color={AppColors.white} />
              </Pressable>
            </View>
          ) : (
            <Pressable
              style={[styles.addBtn, { backgroundColor: AppColors.primary }]}
              onPress={handleAdd}
              testID="button-add-to-cart"
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
    width: 40,
    height: 40,
    borderRadius: 20,
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
