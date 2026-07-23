import React, { useState, useEffect, useCallback } from "react";
import { StyleSheet, View, FlatList, Pressable, TextInput, Dimensions } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
import { getApiUrl } from "@/lib/query-client";

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
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchHistory, setSearchHistory] = useState<string[]>([]);

  const SEARCH_HISTORY_KEY = "@onway_search_history";
  const MAX_HISTORY = 8;

  useEffect(() => {
    AsyncStorage.getItem(SEARCH_HISTORY_KEY)
      .then((raw) => { if (raw) setSearchHistory(JSON.parse(raw)); })
      .catch(() => {});
  }, []);

  const saveToHistory = useCallback((query: string) => {
    if (query.length < 2) return;
    setSearchHistory((prev) => {
      const next = [query, ...prev.filter((h) => h !== query)].slice(0, MAX_HISTORY);
      AsyncStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const clearHistory = () => {
    AsyncStorage.removeItem(SEARCH_HISTORY_KEY).catch(() => {});
    setSearchHistory([]);
  };

  // Debounce so we hit the server once the user pauses, not on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  // Server-side search: the server filters `/api/products?search=` and returns
  // only the matches, instead of shipping the whole catalog to the device and
  // filtering it in-memory here.
  const { data: filteredProducts = [], isFetching } = useQuery<Product[]>({
    queryKey: ["/api/products", "search", debouncedQuery],
    queryFn: async () => {
      const url = new URL("/api/products", getApiUrl());
      url.searchParams.set("search", debouncedQuery);
      const res = await fetch(url.toString());
      if (!res.ok) return [];
      return (await res.json()) as Product[];
    },
    enabled: debouncedQuery.length > 0,
    staleTime: 60 * 1000,
  });

  // Save to history when results arrive (declared after filteredProducts)
  useEffect(() => {
    if (debouncedQuery.length >= 2 && filteredProducts.length > 0) {
      saveToHistory(debouncedQuery);
    }
  }, [debouncedQuery, filteredProducts.length, saveToHistory]);

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
          {/* Search History */}
          {searchHistory.length > 0 ? (
            <View style={styles.historySection}>
              <View style={styles.historyHeader}>
                <Pressable onPress={clearHistory} hitSlop={8}>
                  <ThemedText type="small" style={[styles.clearHistoryText, { color: AppColors.primary }]}>مسح</ThemedText>
                </Pressable>
                <ThemedText type="h4" style={[styles.sectionTitle, { marginBottom: 0 }]}>البحث الأخير</ThemedText>
              </View>
              {searchHistory.map((query) => (
                <Pressable
                  key={query}
                  onPress={() => { setSearchQuery(query); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  style={[styles.historyItem, { borderBottomColor: theme.border }]}
                >
                  <Feather name="clock" size={15} color={theme.textSecondary} />
                  <ThemedText type="body" style={[styles.historyText, { color: theme.text }]}>{query}</ThemedText>
                  <Feather name="arrow-up-left" size={14} color={theme.textSecondary} />
                </Pressable>
              ))}
            </View>
          ) : null}

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
      ) : isFetching || debouncedQuery !== searchQuery.trim() ? (
        <View style={styles.emptyContainer}>
          <Feather name="search" size={48} color={AppColors.gray300} />
          <ThemedText type="body" style={[styles.emptyText, { color: theme.textSecondary }]}>
            جارٍ البحث…
          </ThemedText>
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
  historySection: { marginBottom: 16 },
  historyHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  clearHistoryText: { fontFamily: "Cairo_600SemiBold", fontSize: 13 },
  historyItem: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  historyText: { flex: 1, textAlign: "right", fontFamily: "Cairo_400Regular" },
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
