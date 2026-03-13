import React, { useEffect, useState, useCallback } from "react";
import {
  StyleSheet,
  FlatList,
  RefreshControl,
  View,
  TextInput,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";

import { useTheme } from "@/hooks/useTheme";
import { Spacing, AppColors, BorderRadius, Shadows } from "@/constants/theme";
import { useOrders, Order } from "@/context/OrderContext";
import { OrderCard } from "@/components/OrderCard";
import { EmptyState } from "@/components/EmptyState";
import { ThemedText } from "@/components/ThemedText";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function OrdersScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const { orders, isLoading, refreshOrders } = useOrders();

  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    refreshOrders();
  }, []);

  const handleStartShopping = () => {
    navigation.navigate("Main", { screen: "HomeTab" } as any);
  };

  const filteredOrders = searchQuery.trim().length > 0
    ? orders.filter((o) => {
        const q = searchQuery.trim().toLowerCase();
        const shortId = (o.id?.slice(-8) || "").toLowerCase();
        const fullId = (o.id || "").toLowerCase();
        return shortId.includes(q) || fullId.includes(q);
      })
    : orders;

  const handleClearSearch = () => setSearchQuery("");

  const renderHeader = () => (
    <View style={styles.searchWrapper}>
      <View style={[styles.searchContainer, { backgroundColor: theme.backgroundDefault, borderColor: searchQuery ? AppColors.primary : theme.border }, Shadows.sm]}>
        <Feather name="search" size={18} color={searchQuery ? AppColors.primary : theme.textSecondary} />
        <TextInput
          testID="input-order-search"
          style={[styles.searchInput, { color: theme.text }]}
          placeholder="ابحث برقم الطلب..."
          placeholderTextColor={theme.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
          textAlign="right"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {searchQuery.length > 0 ? (
          <Pressable onPress={handleClearSearch} style={styles.clearBtn} testID="button-clear-search">
            <View style={[styles.clearIcon, { backgroundColor: theme.textSecondary + "30" }]}>
              <Feather name="x" size={12} color={theme.textSecondary} />
            </View>
          </Pressable>
        ) : null}
      </View>

      {searchQuery.trim().length > 0 ? (
        <View style={styles.resultsBanner}>
          <Feather name="filter" size={14} color={AppColors.primary} />
          <ThemedText type="small" style={styles.resultsBannerText}>
            {filteredOrders.length > 0
              ? `${filteredOrders.length} نتيجة للبحث عن "${searchQuery.trim().slice(-8)}"`
              : `لا توجد نتائج لـ "${searchQuery.trim()}"`}
          </ThemedText>
        </View>
      ) : null}
    </View>
  );

  const renderItem = ({ item }: { item: Order }) => (
    <OrderCard
      order={item}
      onPress={() => navigation.navigate("OrderTracking", { orderId: item.id })}
    />
  );

  const renderEmpty = () => {
    if (searchQuery.trim().length > 0) {
      return (
        <View style={styles.noResults}>
          <View style={[styles.noResultsIcon, { backgroundColor: AppColors.primary + "15" }]}>
            <Feather name="search" size={32} color={AppColors.primary} />
          </View>
          <ThemedText type="h4" style={[styles.noResultsTitle, { color: theme.text }]}>
            لم يُعثر على الطلب
          </ThemedText>
          <ThemedText type="body" style={[styles.noResultsDesc, { color: theme.textSecondary }]}>
            لا يوجد طلب برقم "{searchQuery.trim()}" في سجلاتك
          </ThemedText>
          <Pressable onPress={handleClearSearch} style={[styles.resetBtn, { backgroundColor: AppColors.primary + "15" }]}>
            <ThemedText type="small" style={{ color: AppColors.primary, fontWeight: "700" }}>
              عرض جميع الطلبات
            </ThemedText>
          </Pressable>
        </View>
      );
    }
    return (
      <EmptyState
        title="لا توجد طلبات"
        subtitle="لم تقم بأي طلبات بعد"
        buttonText="ابدأ التسوق"
        onButtonPress={handleStartShopping}
      />
    );
  };

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.md,
        paddingBottom: insets.bottom + Spacing.xl,
        paddingHorizontal: Spacing.lg,
        flexGrow: 1,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
      data={filteredOrders}
      renderItem={renderItem}
      keyExtractor={(item) => item.id}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={renderHeader}
      ListEmptyComponent={renderEmpty}
      refreshControl={
        <RefreshControl
          refreshing={isLoading}
          onRefresh={refreshOrders}
          tintColor={AppColors.primary}
          colors={[AppColors.primary]}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  searchWrapper: {
    marginBottom: Spacing.md,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Cairo_400Regular",
    paddingVertical: 0,
  },
  clearBtn: {
    padding: 2,
  },
  clearIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  resultsBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  resultsBannerText: {
    color: AppColors.primary,
    fontWeight: "600",
  },
  noResults: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing["3xl"],
    paddingHorizontal: Spacing.xl,
  },
  noResultsIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  noResultsTitle: {
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  noResultsDesc: {
    textAlign: "center",
    lineHeight: 22,
    marginBottom: Spacing.xl,
  },
  resetBtn: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
});
