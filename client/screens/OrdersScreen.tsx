import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  StyleSheet,
  FlatList,
  RefreshControl,
  View,
  TextInput,
  Pressable,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";

import { useTheme } from "@/hooks/useTheme";
import {
  Spacing,
  AppColors,
  BorderRadius,
  Shadows,
  FontWeight,
} from "@/constants/theme";
import { useOrders, Order } from "@/context/OrderContext";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { OrderCard } from "@/components/OrderCard";
import { EmptyState } from "@/components/EmptyState";
import { ThemedText } from "@/components/ThemedText";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { GradientBackground } from "@/components/GradientBackground";
import { getApiUrl } from "@/lib/query-client";
import { planReorder, EXCLUSION_TEXT, type LiveProduct } from "@/lib/reorder";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

// Module scope so the array identity never changes across renders.
const REFRESH_COLORS = [AppColors.primary];

export default function OrdersScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const { orders, isLoading, refreshOrders } = useOrders();
  const { customerToken } = useAuth();
  const { replaceCart } = useCart();

  const [searchQuery, setSearchQuery] = useState("");

  /**
   * H-82: every handler this screen hands to a row is wrapped, because OrderCard
   * is `React.memo` and its default comparison is `Object.is` per prop. A handler
   * rebuilt on each render is a changed prop, and a changed prop means the card
   * re-renders — for every row on screen, twice per ten-second poll.
   *
   * The deps are the real ones. Nothing here is stabilised by hiding a value in a
   * ref: when `customerToken` changes, this callback MUST change, or the next
   * rating would be sent with the old token.
   */
  const handleRate = useCallback(
    async (
      orderId: string,
      rating: number,
      comment?: string,
      image?: string,
      driverRating?: number,
    ) => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (customerToken) headers["Authorization"] = `Bearer ${customerToken}`;
      const body: any = { rating, comment: comment ?? "", image: image ?? "" };
      if (driverRating !== undefined) body.driverRating = driverRating;
      const res = await fetch(
        new URL(`/api/orders/${orderId}/rate`, getApiUrl()).toString(),
        {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "فشل تقديم التقييم");
      }
      refreshOrders();
    },
    [customerToken, refreshOrders],
  );

  /**
   * H-53: this used to rebuild the cart from the order document alone — the price
   * paid last time, `inStock: true` asserted rather than checked, and the line's
   * variant/addons dropped. The server re-prices every line against the live
   * product and rejects a mismatch, so a reorder of anything whose price had moved
   * failed in the cart with "أسعار بعض المنتجات تغيّرت" and no way to see which
   * product or what to do. Now the live products are fetched first, each line is
   * rebuilt from the current one, and anything that cannot be reordered is named
   * before the cart is touched.
   */
  const [isReordering, setIsReordering] = useState<string | null>(null);

  const fetchCurrentProducts = useCallback(
    async (order: Order): Promise<LiveProduct[]> => {
      // Vendor orders resolve through the store's own catalogue; legacy orders with
      // no vendor come from the admin catalogue. Both are the same sources normal
      // browsing uses, so availability and price mean the same thing here as there.
      const url = order.vendorId
        ? new URL(`/api/stores/${order.vendorId}/products`, getApiUrl())
        : new URL("/api/products", getApiUrl());
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("تعذّر تحميل منتجات المتجر");
      const data = await res.json();
      return Array.isArray(data) ? data : (data?.products ?? []);
    },
    [],
  );

  const handleReorder = useCallback(
    async (order: Order) => {
      if (isReordering) return;
      setIsReordering(order.id);
      let plan;
      try {
        plan = planReorder(order, await fetchCurrentProducts(order));
      } catch {
        setIsReordering(null);
        Alert.alert(
          "تعذّر إعادة الطلب",
          "تعذّر تحميل المنتجات، تحقّق من الاتصال وحاول مجدداً.",
        );
        return;
      }
      setIsReordering(null);

      const excludedText = plan.excluded
        .map((e) => `• ${e.name} — ${EXCLUSION_TEXT[e.reason]}`)
        .join("\n");

      if (plan.items.length === 0) {
        // Nothing survived: leave the existing cart exactly as it was.
        Alert.alert(
          "تعذّر إعادة الطلب",
          excludedText
            ? `لا يمكن إعادة أي منتج من هذا الطلب:\n\n${excludedText}`
            : "لا توجد منتجات في هذا الطلب.",
        );
        return;
      }

      const priceText = plan.priceChanges
        .map((c) => `• ${c.name}: ${c.was} ← ${c.now} د.ع`)
        .join("\n");

      const apply = () => {
        replaceCart(plan!.items);
        navigation.navigate("Cart" as any);
      };

      if (plan.excluded.length === 0 && plan.priceChanges.length === 0) {
        apply();
        return;
      }

      // Something changed — say exactly what, and let the customer decide before the
      // cart is replaced.
      const parts: string[] = [];
      if (excludedText) parts.push(`لم تتم إضافة:\n${excludedText}`);
      if (priceText) parts.push(`تغيّرت الأسعار:\n${priceText}`);
      Alert.alert("مراجعة الطلب", parts.join("\n\n"), [
        { text: "إلغاء", style: "cancel" },
        { text: "متابعة", onPress: apply },
      ]);
    },
    // `isReordering` is a real dependency: it is the in-flight guard on the first
    // line, so a callback that captured a stale value would let a second reorder
    // start. It flips twice per reorder — an explicit tap — never on a poll.
    [isReordering, fetchCurrentProducts, replaceCart, navigation],
  );

  /**
   * H-82: the row's two navigation handlers. They used to be arrows built inside
   * renderItem, one pair per card per render. Taking the order as an argument —
   * the way onRate and onReorder already did — means one handler serves the whole
   * list, and it always acts on the order the customer actually tapped.
   */
  const handleOpenOrder = useCallback(
    (order: Order) => {
      navigation.navigate("OrderTracking", { orderId: order.id });
    },
    [navigation],
  );

  const handleStorePress = useCallback(
    (order: Order) => {
      const storeName =
        order.vendorName ||
        order.items.find((i) => i.restaurant)?.restaurant ||
        "المتجر";
      navigation.navigate("StoreProducts", {
        storeId: order.vendorId!,
        storeName,
      });
    },
    [navigation],
  );

  useEffect(() => {
    refreshOrders();
  }, []);

  // FlatList's `data`: a fresh array on every render re-renders every cell, so the
  // filtered list is built only when the orders or the query actually move. With
  // no query this stays the `orders` array itself, exactly as before.
  const filteredOrders: Order[] = useMemo(
    () =>
      searchQuery.trim().length > 0
        ? orders.filter((o) => {
            const q = searchQuery.trim().toLowerCase();
            const shortId = (o.id?.slice(-8) || "").toLowerCase();
            const fullId = (o.id || "").toLowerCase();
            return shortId.includes(q) || fullId.includes(q);
          })
        : orders,
    [orders, searchQuery],
  );

  const isSearching = searchQuery.trim().length > 0;

  const renderItem = useCallback(
    ({ item }: { item: Order }) => (
      <OrderCard
        order={item}
        onPress={handleOpenOrder}
        onStorePress={item.vendorId ? handleStorePress : undefined}
        onRate={handleRate}
        onReorder={item.status === "delivered" ? handleReorder : undefined}
      />
    ),
    [handleOpenOrder, handleStorePress, handleRate, handleReorder],
  );

  const renderEmpty = useCallback(() => {
    if (isSearching) {
      return (
        <View style={styles.noResults}>
          <View
            style={[
              styles.noResultsIcon,
              { backgroundColor: AppColors.primary + "15" },
            ]}
          >
            <Feather name="search" size={32} color={AppColors.primary} />
          </View>
          <ThemedText
            type="h4"
            style={{ textAlign: "center", marginBottom: Spacing.sm }}
          >
            لم يُعثر على الطلب
          </ThemedText>
          <ThemedText
            type="body"
            style={{
              textAlign: "center",
              color: theme.textSecondary,
              marginBottom: Spacing.xl,
            }}
          >
            لا يوجد طلب يطابق "{searchQuery.trim()}" في سجلاتك
          </ThemedText>
          <Pressable
            onPress={() => setSearchQuery("")}
            style={[
              styles.resetBtn,
              { backgroundColor: AppColors.primary + "15" },
            ]}
            accessibilityRole="button"
            accessibilityLabel="عرض جميع الطلبات"
          >
            <ThemedText
              type="small"
              style={{ color: AppColors.primary, fontWeight: FontWeight.bold }}
            >
              عرض جميع الطلبات
            </ThemedText>
          </Pressable>
        </View>
      );
    }
    return (
      <EmptyState
        icon="receipt-outline"
        title="لا توجد طلبات"
        subtitle="لم تقم بأي طلبات بعد"
        buttonText="ابدأ التسوق"
        buttonIcon="storefront-outline"
        onButtonPress={() =>
          navigation.navigate("MainTabs", { screen: "HomeTab" })
        }
      />
    );
    // ListEmptyComponent is used by React as a component TYPE. A new function on
    // every render is a new type, which unmounts and remounts the empty state.
  }, [isSearching, searchQuery, theme.textSecondary, navigation]);

  // Style and element props of the list itself. Fresh objects here re-render the
  // list on every parent render, and the list re-invokes renderItem for its cells.
  const listContentStyle = useMemo(
    () => ({
      paddingTop: Spacing.md,
      paddingBottom: insets.bottom + Spacing.xl,
      paddingHorizontal: Spacing.lg,
      flexGrow: 1,
    }),
    [insets.bottom],
  );

  const scrollInsets = useMemo(
    () => ({ bottom: insets.bottom }),
    [insets.bottom],
  );

  const refreshControl = useMemo(
    () => (
      <RefreshControl
        refreshing={isLoading}
        onRefresh={refreshOrders}
        tintColor={AppColors.primary}
        colors={REFRESH_COLORS}
      />
    ),
    [isLoading, refreshOrders],
  );

  return (
    <View style={styles.screen}>
      <GradientBackground />
      {/* Fixed Search Bar */}
      <View
        style={[
          styles.searchArea,
          {
            paddingTop: headerHeight + Spacing.sm,
            backgroundColor: "transparent",
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
              accessibilityRole="button"
              accessibilityLabel="مسح البحث"
              hitSlop={8}
            >
              <View
                style={[
                  styles.clearIcon,
                  { backgroundColor: theme.textSecondary + "25" },
                ]}
              >
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
        style={styles.list}
        contentContainerStyle={listContentStyle}
        scrollIndicatorInsets={scrollInsets}
        data={filteredOrders}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        initialNumToRender={8}
        windowSize={5}
        maxToRenderPerBatch={6}
        removeClippedSubviews={true}
        ListEmptyComponent={renderEmpty}
        refreshControl={refreshControl}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
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
    fontSize: 16, // ≥16 for readability + prevents iOS auto-zoom on focus
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
    fontWeight: FontWeight.semiBold,
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
