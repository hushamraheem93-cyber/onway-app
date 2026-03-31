import React from "react";
import { View, StyleSheet, FlatList, Pressable } from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { AppColors, BorderRadius, Spacing, Shadows } from "@/constants/theme";
import { formatPrice } from "@/constants/currency";
import { Product, PRODUCTS } from "@/constants/categories";
import { useCart, CartItem } from "@/context/CartContext";

const CATEGORY_SUGGESTIONS: Record<string, string[]> = {
  "fruits-vegetables": ["dairy-eggs", "meat-poultry", "beverages"],
  "meat-poultry": ["fruits-vegetables", "beverages", "snacks-sweets"],
  "dairy-eggs": ["fruits-vegetables", "snacks-sweets", "beverages"],
  "cleaning-care": ["baby"],
  "beverages": ["snacks-sweets", "fruits-vegetables"],
  "snacks-sweets": ["beverages", "juices"],
  "juices": ["snacks-sweets", "fruits-vegetables"],
  "tea-coffee": ["snacks-sweets", "dairy-eggs"],
  "baby": ["cleaning-care", "dairy-eggs"],
  "flowers": ["snacks-sweets"],
};

interface SmartSuggestionsProps {
  cartItems: CartItem[];
}

export function SmartSuggestions({ cartItems }: SmartSuggestionsProps) {
  const { theme } = useTheme();
  const { addToCart, items } = useCart();

  const getSuggestedProducts = (): Product[] => {
    if (cartItems.length === 0) return [];

    const cartProductIds = new Set(cartItems.map((item) => item.product.id));
    const cartCategoryIds = [...new Set(cartItems.map((item) => item.product.categoryId))];

    const suggestedCategoryIds = new Set<string>();
    cartCategoryIds.forEach((catId) => {
      const related = CATEGORY_SUGGESTIONS[catId] || [];
      related.forEach((relCatId) => suggestedCategoryIds.add(relCatId));
    });

    const suggestions = PRODUCTS.filter(
      (p) =>
        suggestedCategoryIds.has(p.categoryId) &&
        !cartProductIds.has(p.id) &&
        p.inStock
    );

    const shuffled = suggestions.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 8);
  };

  const suggestedProducts = getSuggestedProducts();

  const handleAddToCart = (product: Product) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addToCart(product);
  };

  const isInCart = (productId: string) => items.some((item) => item.product.id === productId);

  const renderItem = ({ item }: { item: Product }) => {
    const alreadyInCart = isInCart(item.id);
    
    return (
      <View style={[styles.itemCard, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
        <Image
          source={{ uri: item.image }}
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
          style={[
            styles.addBtn,
            alreadyInCart && styles.addBtnDisabled,
          ]}
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
          <ThemedText type="h4" style={styles.title}>أكمل وجبتك</ThemedText>
        </View>
        <ThemedText type="small" style={[styles.subtitle, { color: theme.textSecondary }]}>
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
    fontWeight: "bold",
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
    fontWeight: "600",
    textAlign: "right",
    lineHeight: 18,
    minHeight: 36,
  },
  itemPrice: {
    fontSize: 13,
    color: AppColors.primary,
    fontWeight: "bold",
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
    backgroundColor: "#4CAF50",
  },
});
