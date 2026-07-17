import React, { useState, useMemo } from "react";
import { StyleSheet, View, FlatList, Pressable, TextInput, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { Spacing, AppColors, BorderRadius, Shadows, FontWeight} from "@/constants/theme";
import { Product, Category } from "@/constants/categories";
import { ThemedText } from "@/components/ThemedText";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { useCart } from "@/context/CartContext";
import { formatPrice } from "@/constants/currency";
import { resolveImageUrl } from "@/utils/imageUtils";
import { GradientBackground } from "@/components/GradientBackground";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const { width: SCREEN_WIDTH } = Dimensions.get("window");


export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme, isDark } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const { addToCart } = useCart();

  const [searchQuery, setSearchQuery] = useState("");

  const { data: allProducts = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.trim().toLowerCase();
    return allProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.description?.toLowerCase().includes(query)
    );
  }, [searchQuery, allProducts]);

  const handleAddToCart = (product: Product) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addToCart(product);
  };

  const handleCategoryPress = (category: Category) => {
    navigation.navigate("Products", { categoryId: category.id, categoryName: category.name });
  };

  const renderProduct = ({ item }: { item: Product }) => (
    <View style={[styles.productRow, { backgroundColor: theme.backgroundDefault, borderBottomColor: theme.border }]}>
      <Image
        source={{ uri: resolveImageUrl(item.image) }}
        style={styles.productImage}
        contentFit="cover"
        cachePolicy="disk"
        transition={200}
      />
      <View style={styles.productInfo}>
        <ThemedText type="body" numberOfLines={1} style={styles.productName}>{item.name}</ThemedText>
        <ThemedText type="small" numberOfLines={1} style={[styles.productDesc, { color: theme.textSecondary }]}>
          {item.description}
        </ThemedText>
        <ThemedText type="h4" style={[styles.productPrice, { color: AppColors.primary }]}>
          {formatPrice(item.price)}
        </ThemedText>
      </View>
      <Pressable
        onPress={() => handleAddToCart(item)}
        style={[styles.addBtn, { backgroundColor: AppColors.primary }]}
        accessibilityRole="button"
        accessibilityLabel={`أضف ${item.name} إلى السلة`}
      >
        <Feather name="plus" size={18} color={AppColors.white} />
      </Pressable>
    </View>
  );

  const renderCategoryChip = ({ item }: { item: Category }) => (
    <Pressable
      style={[styles.categoryChip, { backgroundColor: isDark ? theme.backgroundSecondary : AppColors.secondary, borderWidth: 1, borderColor: AppColors.primary + "40" }]}
      onPress={() => handleCategoryPress(item)}
      accessibilityRole="button"
      accessibilityLabel={`قسم ${item.name}`}
    >
      <ThemedText type="small" style={[styles.chipText, { color: AppColors.primary }]}>{item.name}</ThemedText>
    </Pressable>
  );

  return (
    <View style={[styles.container]}>
      <GradientBackground />
      <View style={[styles.searchContainer, { paddingTop: headerHeight + Spacing.sm }]}>
        <View style={[styles.searchBar, { backgroundColor: isDark ? theme.backgroundDefault : AppColors.gray50, borderColor: isDark ? theme.border : AppColors.divider }]}>
          <Feather name="search" size={20} color={AppColors.primary} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="ابحث عن منتجات..."
            placeholderTextColor={AppColors.gray400}
            style={[styles.searchInput, { color: theme.text }]}
            textAlign="right"
            autoFocus
            returnKeyType="search"
          />
          {searchQuery.length > 0 ? (
            <Pressable
              onPress={() => setSearchQuery("")}
              accessibilityRole="button"
              accessibilityLabel="مسح البحث"
              hitSlop={8}
            >
              <Feather name="x" size={18} color={AppColors.gray400} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {searchQuery.trim().length === 0 ? (
        <View style={styles.suggestionsContainer}>
          <ThemedText type="h3" style={styles.sectionTitle}>تصفح الأقسام</ThemedText>
          <FlatList
            data={categories}
            renderItem={renderCategoryChip}
            keyExtractor={(item) => item.id}
            numColumns={3}
            columnWrapperStyle={styles.chipRow}
            contentContainerStyle={{ paddingBottom: tabBarHeight }}
            showsVerticalScrollIndicator={false}
          />
        </View>
      ) : filteredProducts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Feather name="search" size={48} color={AppColors.gray300} />
          <ThemedText type="body" style={[styles.emptyText, { color: theme.textSecondary }]}>
            لا توجد نتائج لـ "{searchQuery}"
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={filteredProducts}
          renderItem={renderProduct}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: tabBarHeight }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingBottom: Spacing.sm,
  },
  searchBar: {
    flexDirection: "row-reverse",
    alignItems: "center",
    borderRadius: 12,
    paddingHorizontal: 15,
    height: 50,
    borderWidth: 1,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16, // ≥16 for readability + prevents iOS auto-zoom on focus
    paddingVertical: 0,
  },
  suggestionsContainer: {
    paddingHorizontal: 16,
    paddingTop: Spacing.md,
  },
  sectionTitle: {
    textAlign: "right",
    marginBottom: Spacing.md,
  },
  chipRow: {
    justifyContent: "flex-end",
    gap: 8,
    marginBottom: 8,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
  },
  chipText: {
    fontWeight: FontWeight.medium,
  },
  productRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  productImage: {
    width: 60,
    height: 60,
    borderRadius: 10,
  },
  productInfo: {
    flex: 1,
    alignItems: "flex-end",
  },
  productName: {
    fontWeight: FontWeight.semiBold,
    textAlign: "right",
  },
  productDesc: {
    textAlign: "right",
    marginTop: 2,
  },
  productPrice: {
    fontWeight: FontWeight.bold,
    marginTop: 4,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  emptyText: {
    textAlign: "center",
  },
});
