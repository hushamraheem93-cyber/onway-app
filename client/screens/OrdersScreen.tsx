import React, { useEffect, useState } from "react";
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
import { useAuth } from "@/context/AuthContext";
import { OrderCard } from "@/components/OrderCard";
import { EmptyState } from "@/components/EmptyState";
import { ThemedText } from "@/components/ThemedText";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { GradientBackground } from "@/components/GradientBackground";
import { getApiUrl } from "@/lib/query-client";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function OrdersScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const { orders, isLoading, refreshOrders } = useOrders();
  const { phoneNumber: authPhone, customerToken } = useAuth();

  const [searchQuery, setSearchQuery] = useState("");

  const handleRate = async (orderId: string, rating: number) => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (customerToken) headers["Authorization"] = `Bearer ${customerToken}`;
    const res = await fetch(new URL(`/api/orders/${orderId}/rate`, getApiUrl()).toString(), {
      method: "POST",
      headers,
      body: JSON.stringify({ rating, phoneNumber: authPhone || "" }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "فشل تقديم التقييم");
    }
    refreshOrders();
  };

  useEffect(() => {
    refreshOrders();
  }, []);

  const filteredOrders: Order[] = searchQuery.trim().length > 0
    ? orders.filter((o) => {
        const q = searchQuery.trim().toLowerCase();
        const shortId = (o.id?.slice(-8) || "").toLowerCase();
        const fullId = (o.id || "").toLowerCase();
        return shortId.includes(q) || fullId.includes(q);
      })
    : orders;

  const isSearching = searchQuery.trim().length > 0;

  const renderItem = ({ item }: { item: Order }) => (
    <OrderCard
      order={item}
      onPress={() => navigation.navigate("OrderTracking", { orderId: item.id })}
      onStorePress={item.vendorId
        ? () => {
            const storeName = item.vendorName || item.items.find(i => i.restaurant)?.restaurant || "المتجر";
            navigation.navigate("StoreProducts", { storeId: item.vendorId!, storeName });
          }
        : undefined}
      onRate={handleRate}
    />
  );

  const renderEmpty = () => {
    if (isSearching) {
      return (
        <View style={styles.noResults}>
          <View style={[styles.noResultsIcon, { backgroundColor: AppColors.primary + "15" }]}>
            <Feather name="search" size={32} color={AppColors.primary} />
          </View>
          <ThemedText type="h4" style={{ textAlign: "center", marginBottom: Spacing.sm }}>
            لم يُعثر على الطلب
          </ThemedText>
          <ThemedText type="body" style={{ textAlign: "center", color: theme.textSecondary, marginBottom: Spacing.xl }}>
            لا يوجد طلب يطابق "{searchQuery.trim()}" في سجلاتك
          </ThemedText>
          <Pressable
            onPress={() => setSearchQuery("")}
            style={[styles.resetBtn, { backgroundColor: AppColors.primary + "15" }]}
          >
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
        onButtonPress={() => navigation.navigate("Main", { screen: "HomeTab" } as any)}
      />
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <GradientBackground />
      {/* Fixed Search Bar */}
      <View
        style={[
          styles.searchArea,
          {
            paddingTop: headerHeight + Spacing.sm,
            backgroundColor: theme.backgroundRoot,
            borderBottomColor: theme.border,
          },
        ]}
      >
        <View
          style={[
            styles.searchContainer,
            {
              backgroundColor: theme.backgroundDefault,
              borderColor: isSearching ? AppColors.primary : theme.border,
            },
            Shadows.sm,
          ]}
        >
          <Feather
            name="search"
            size={18}
            color={isSearching ? AppColors.primary : theme.textSecondary}
          />
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
          {isSearching ? (
            <Pressable
              onPress={() => setSearchQuery("")}
              style={styles.clearBtn}
              testID="button-clear-search"
            >
              <View style={[styles.clearIcon, { backgroundColor: theme.textSecondary + "25" }]}>
                <Feather name="x" size={12} color={theme.textSecondary} />
              </View>
            </Pressable>
          ) : null}
        </View>

        {isSearching ? (
          <View style={styles.resultsBanner}>
            <Feather name="filter" size={13} color={AppColors.primary} />
            <ThemedText type="small" style={styles.resultsBannerText}>
              {filteredOrders.length > 0
                ? `${filteredOrders.length} نتيجة للبحث عن "${searchQuery.trim()}"`
                : `لا توجد نتائج`}
            </ThemedText>
          </View>
        ) : null}
      </View>

      {/* Orders List */}
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: Spacing.md,
          paddingBottom: insets.bottom + Spacing.xl,
          paddingHorizontal: Spacing.lg,
          flexGrow: 1,
        }}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        data={filteredOrders}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
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
    </View>
  );
}

const styles = StyleSheet.create({
  searchArea: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
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
    fontSize: 12,
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
    marginTop: Spacing.xs + 2,
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
  resetBtn: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
});
