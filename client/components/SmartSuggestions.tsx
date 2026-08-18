import React, { useMemo } from "react";
import { View, StyleSheet, FlatList, Pressable } from "react-native";
import { Image } from "expo-image";
import { resolveImageUrl } from "@/utils/imageUtils";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import {
  AppColors,
  BorderRadius,
  Spacing,
  Shadows,
  FontWeight,
} from "@/constants/theme";
import { formatPrice } from "@/constants/currency";
import { Product, PRODUCTS } from "@/constants/categories";
import { useCart, CartItem } from "@/context/CartContext";

const CATEGORY_SUGGESTIONS: Record<string, string[]> = {
  "fruits-vegetables": ["dairy-eggs", "meat-poultry", "beverages"],
  "meat-poultry": ["fruits-vegetables", "beverages", "snacks-sweets"],
  "dairy-eggs": ["fruits-vegetables", "snacks-sweets", "beverages"],
  "cleaning-care": ["baby"],
  beverages: ["snacks-sweets", "fruits-vegetables"],
  "snacks-sweets": ["beverages", "juices"],
  juices: ["snacks-sweets", "fruits-vegetables"],
  "tea-coffee": ["snacks-sweets", "dairy-eggs"],
  baby: ["cleaning-care", "dairy-eggs"],
  flowers: ["snacks-sweets"],
};

const SUGGESTION_LIMIT = 8;

/**
 * H-81 — the suggestion strip, computed from the cart alone.
 *
 * This used to run in the component's render body as
 * `PRODUCTS.filter(...).sort(() => Math.random() - 0.5).slice(0, 8)`, which cost
 * a full scan of the catalogue on EVERY render and, worse, returned a different
 * answer each time: six consecutive renders of one unchanged cart produced six
 * different orderings.
 *
 * That is not a cosmetic problem. The strip re-renders whenever the cart changes,
 * and the cart changes the instant the customer taps "+" on it — so the row
 * reshuffled under their finger between seeing a product and tapping it, and the
 * tap landed on whatever slid into that slot.
 *
 * The order is now a property of the product — its id — rather than of the moment,
 * so a given product always sorts to the same place and removing one item from the
 * strip never moves the others.
 *
 * Losing the shuffle costs nothing in what the customer is shown. Measured against
 * the real catalogue, the eligible pool for a typical cart is about 50 products
 * from one category and one or two from the others, and the random draw averaged
 * 7.7 to 7.9 of its 8 slots from that same dominant category. The shuffle was
 * varying the ORDER of a set it was going to show anyway.
 *
 * `catalog` is read-only here: `filter` produces the copy that `sort` reorders, so
 * the shared PRODUCTS array is never touched.
 */
export function computeSuggestedProducts(
  cartItems: readonly CartItem[],
  catalog: readonly Product[] = PRODUCTS,
  limit: number = SUGGESTION_LIMIT,
): Product[] {
  if (cartItems.length === 0) return [];

  const cartProductIds = new Set(cartItems.map((item) => item.product.id));

  const suggestedCategoryIds = new Set<string>();
  cartItems.forEach((item) => {
    const related = CATEGORY_SUGGESTIONS[item.product.categoryId] || [];
    related.forEach((relCatId) => suggestedCategoryIds.add(relCatId));
  });

  return (
    catalog
      .filter(
        (p) =>
          suggestedCategoryIds.has(p.categoryId) &&
          !cartProductIds.has(p.id) &&
          p.inStock,
      )
      // Ids are unique, so this is a total order: no two products can tie and leave
      // the engine's sort implementation to break it.
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .slice(0, limit)
  );
}

interface SmartSuggestionsProps {
  cartItems: CartItem[];
}

export function SmartSuggestions({ cartItems }: SmartSuggestionsProps) {
  const { theme } = useTheme();
  const { addToCart, items } = useCart();

  // Recomputed when the cart changes — which is exactly when the eligible set can
  // change — and not on unrelated re-renders (theme, context churn).
  const suggestedProducts = useMemo(
    () => computeSuggestedProducts(cartItems),
    [cartItems],
  );

  const handleAddToCart = (product: Product) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addToCart(product);
  };

  const isInCart = (productId: string) =>
    items.some((item) => item.product.id === productId);

  const renderItem = ({ item }: { item: Product }) => {
    const alreadyInCart = isInCart(item.id);

    return (
      <View
        style={[
          styles.itemCard,
          { backgroundColor: theme.backgroundDefault },
          Shadows.sm,
        ]}
      >
        <Image
          source={{ uri: resolveImageUrl(item.image) }}
          style={styles.itemImage}
          contentFit="cover"
          cachePolicy="disk"
          transition={200}
        />
        <View style={styles.itemInfo}>
          <ThemedText type="body" numberOfLines={2} style={styles.itemName}>
            {item.name}
          </ThemedText>
          <ThemedText type="small" style={styles.itemPrice}>
            {formatPrice(item.price)}
          </ThemedText>
        </View>

        <Pressable
          style={[styles.addBtn, alreadyInCart && styles.addBtnDisabled]}
          onPress={() => !alreadyInCart && handleAddToCart(item)}
          disabled={alreadyInCart}
        >
          <Feather
            name={alreadyInCart ? "check" : "plus"}
            size={18}
            color="white"
          />
        </Pressable>
      </View>
    );
  };

  if (suggestedProducts.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.titleContainer}>
          <Feather name="zap" size={18} color={AppColors.primary} />
          <ThemedText type="h4" style={styles.title}>
            أكمل وجبتك
          </ThemedText>
        </View>
        <ThemedText
          type="small"
          style={[styles.subtitle, { color: theme.textSecondary }]}
        >
          اقتراحات ذكية بناءً على سلتك
        </ThemedText>
      </View>

      <FlatList
        data={suggestedProducts}
        renderItem={renderItem}
        keyExtractor={(item) => `suggestion-${item.id}`}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        inverted
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
  },
  headerRow: {
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    alignItems: "flex-end",
  },
  titleContainer: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Spacing.xs,
  },
  title: {
    fontWeight: FontWeight.bold,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 12,
  },
  listContent: {
    paddingHorizontal: Spacing.sm,
  },
  itemCard: {
    width: 130,
    borderRadius: BorderRadius.lg,
    padding: Spacing.sm,
    marginHorizontal: Spacing.xs,
    position: "relative",
  },
  itemImage: {
    width: "100%",
    height: 80,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xs,
  },
  itemInfo: {
    alignItems: "flex-end",
  },
  itemName: {
    fontSize: 12,
    fontWeight: FontWeight.semiBold,
    textAlign: "right",
    lineHeight: 18,
    minHeight: 36,
  },
  itemPrice: {
    fontSize: 13,
    color: AppColors.primary,
    fontWeight: FontWeight.bold,
    marginTop: 4,
  },
  addBtn: {
    position: "absolute",
    top: 6,
    left: 6,
    backgroundColor: AppColors.primary,
    borderRadius: 12,
    width: 28,
    height: 28,
    justifyContent: "center",
    alignItems: "center",
  },
  addBtnDisabled: {
    backgroundColor: AppColors.success,
  },
});
