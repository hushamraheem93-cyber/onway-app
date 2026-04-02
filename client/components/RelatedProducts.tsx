import React from "react";
import { View, StyleSheet, FlatList, Pressable } from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { resolveImageUrl } from "@/utils/imageUtils";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { AppColors } from "@/constants/theme";
import { formatPrice } from "@/constants/currency";
import { Product } from "@/constants/categories";
import { useCart } from "@/context/CartContext";

interface RelatedProductsProps {
  products: Product[];
  title?: string;
  onViewAll?: () => void;
}


export function RelatedProducts({
  products,
  title = "منتجات مترابطة",
  onViewAll,
}: RelatedProductsProps) {
  const { theme } = useTheme();
  const { addToCart } = useCart();

  const handleAddToCart = (product: Product) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    addToCart(product);
  };

  const renderItem = ({ item }: { item: Product }) => (
    <Pressable style={[styles.itemCard, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
      <Image
        source={{ uri: resolveImageUrl(item.image) }}
        style={styles.itemImage}
        contentFit="cover"
        cachePolicy="disk"
      />
      <ThemedText type="body" numberOfLines={1} style={styles.itemName}>
        {item.name}
      </ThemedText>
      <ThemedText type="small" style={styles.itemPrice}>
        {formatPrice(item.price)}
      </ThemedText>
      
      <Pressable 
        style={styles.miniAddBtn}
        onPress={() => handleAddToCart(item)}
      >
        <Feather name="plus" size={18} color="white" />
      </Pressable>
    </Pressable>
  );

  if (products.length === 0) return null;

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundDefault }]}>
      <View style={styles.headerRow}>
        {onViewAll ? (
          <Pressable onPress={onViewAll}>
            <ThemedText type="small" style={styles.viewAll}>عرض الكل</ThemedText>
          </Pressable>
        ) : <View />}
        <ThemedText type="h3" style={styles.title}>{title}</ThemedText>
      </View>

      <FlatList
        data={products}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listPadding}
        inverted={true}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 25,
    paddingBottom: 20,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 15,
  },
  title: {
    fontSize: 14,
    fontWeight: "bold",
  },
  viewAll: {
    color: AppColors.primary,
    fontSize: 14,
  },
  listPadding: {
    paddingHorizontal: 15,
  },
  itemCard: {
    width: 120,
    borderRadius: 12,
    padding: 10,
    marginHorizontal: 8,
    alignItems: "center",
    borderWidth: 1,
  },
  itemImage: {
    width: 70,
    height: 70,
    marginBottom: 8,
    borderRadius: 8,
  },
  itemName: {
    fontSize: 13,
    textAlign: "center",
    fontWeight: "600",
  },
  itemPrice: {
    fontSize: 12,
    color: AppColors.primary,
    marginTop: 4,
    fontWeight: "bold",
  },
  miniAddBtn: {
    position: "absolute",
    top: -5,
    left: -5,
    backgroundColor: AppColors.primary,
    borderRadius: 10,
    width: 24,
    height: 24,
    justifyContent: "center",
    alignItems: "center",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
});
