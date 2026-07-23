import React from "react";
import { StyleSheet, FlatList, View, TouchableOpacity, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";

import { useTheme } from "@/hooks/useTheme";
import { Spacing, AppColors, FontWeight} from "@/constants/theme";
import { useCart, CartItem } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import { formatPrice } from "@/constants/currency";
import { CartItemCard } from "@/components/CartItemCard";
import { EmptyState } from "@/components/EmptyState";
import { SmartSuggestions } from "@/components/SmartSuggestions";
import { ThemedText } from "@/components/ThemedText";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { GradientBackground } from "@/components/GradientBackground";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function CartScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const { items, getTotal, clearCart, cartVendorId } = useCart();
  const { isGuest, exitGuestMode } = useAuth();

  const subtotal = getTotal();

  // Fetch store list to look up minOrder for the current cart vendor (cached, no extra network call usually)
  const { data: storesData } = useQuery<{ stores: any[] }>({
    queryKey: ["/api/stores"],
    staleTime: 5 * 60 * 1000,
  });
  const allStores: any[] = storesData?.stores ?? [];
  const vendorMinOrder: number = cartVendorId
    ? (allStores.find((s: any) => s.id === cartVendorId)?.minOrder ?? 0)
    : 0;
  const isBelowMinOrder = vendorMinOrder > 0 && subtotal < vendorMinOrder;

  const handleCheckout = () => {
    if (isGuest) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert(
        "إنشاء حساب مطلوب",
        "لإتمام الطلب، الرجاء إنشاء حساب داخل التطبيق",
        [
          { text: "إلغاء", style: "cancel" },
          {
            text: "إنشاء حساب",
            style: "default",
            onPress: () => exitGuestMode(),
          },
        ],
        { cancelable: true }
      );
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate("Checkout");
  };

  const handleClearCart = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    clearCart();
  };

  const handleStartShopping = () => {
    navigation.navigate("Main", { screen: "HomeTab" } as any);
  };

  const renderItem = ({ item }: { item: CartItem }) => (
    <CartItemCard item={item} />
  );

  const renderEmpty = () => (
    <EmptyState
      icon="cart"
      title="سلتك فارغة حالياً"
      subtitle="ابدأ بإضافة المنتجات والوجبات التي تحبها"
      buttonText="ابدأ التسوق الآن"
      buttonIcon="storefront-outline"
      onButtonPress={handleStartShopping}
    />
  );

  return (
    <View style={[styles.container]}>
      <GradientBackground />
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.md,
          paddingBottom: items.length > 0 ? 280 + tabBarHeight : tabBarHeight + Spacing.xl,
          paddingHorizontal: Spacing.md,
          flexGrow: 1,
        }}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        data={items}
        renderItem={renderItem}
        keyExtractor={(item) => item.product.id}
        showsVerticalScrollIndicator={false}
        initialNumToRender={10}
        windowSize={5}
        maxToRenderPerBatch={8}
        removeClippedSubviews={true}
        ListEmptyComponent={renderEmpty}
        ListHeaderComponent={
          items.length > 0 ? (
            <TouchableOpacity
              onPress={handleClearCart}
              style={styles.clearButton}
              accessibilityRole="button"
              accessibilityLabel="مسح كل المنتجات من السلة"
            >
              <Ionicons name="trash-outline" size={20} color={AppColors.primary} />
              <ThemedText type="small" style={styles.clearText}>مسح الكل</ThemedText>
            </TouchableOpacity>
          ) : null
        }
        ListFooterComponent={
          items.length > 0 ? (
            <SmartSuggestions cartItems={items} />
          ) : null
        }
      />

      {items.length > 0 ? (
        <View
          style={[
            styles.footer,
            {
              backgroundColor: theme.backgroundDefault,
              paddingBottom: tabBarHeight + Spacing.lg,
            },
          ]}
        >
          {/* Min-order warning banner */}
          {isBelowMinOrder ? (
            <View style={styles.minOrderBanner}>
              <Ionicons name="warning-outline" size={16} color={AppColors.warning} />
              <ThemedText style={styles.minOrderText}>
                الحد الأدنى للطلب {formatPrice(vendorMinOrder)} — أضف منتجات بقيمة {formatPrice(vendorMinOrder - subtotal)} إضافية
              </ThemedText>
            </View>
          ) : null}
          <View style={[styles.summaryRow, styles.totalRow]}>
            <ThemedText type="h2" style={styles.totalValue}>
              {formatPrice(subtotal)}
            </ThemedText>
            <View style={styles.totalLabelRow}>
              <View style={styles.totalAccent} />
              <ThemedText type="h4" style={styles.totalLabel}>
                المجموع الكلي
              </ThemedText>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.checkoutBtn, isBelowMinOrder && styles.checkoutBtnDisabled]}
            onPress={isBelowMinOrder ? undefined : handleCheckout}
            accessibilityRole="button"
            accessibilityLabel="إتمام الطلب والانتقال للدفع"
          >
            <ThemedText type="h4" style={styles.checkoutText}>
              إتمام الطلب
            </ThemedText>
            <View style={styles.btnIcon}>
              <Ionicons name="arrow-back" size={20} color={AppColors.primary} />
            </View>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  clearButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginBottom: Spacing.sm,
    paddingVertical: 8,
    paddingHorizontal: 4,
    minHeight: 44,
    gap: 6,
  },
  clearText: {
    color: AppColors.primary,
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.lg,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    shadowColor: AppColors.black,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 10,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  totalRow: {
    marginBottom: 0,
  },
  totalLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  // Signature brand accent bar, consistent with Home/Checkout section rhythm.
  totalAccent: {
    width: 4,
    height: 18,
    borderRadius: 2,
    backgroundColor: AppColors.primary,
  },
  totalLabel: {
    fontWeight: FontWeight.bold,
    color: AppColors.gray700,
  },
  totalValue: {
    fontWeight: FontWeight.bold,
    color: AppColors.primary,
  },
  minOrderBanner: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    backgroundColor: AppColors.warning + "18",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppColors.warning + "55",
    padding: 10,
    marginBottom: 10,
  },
  minOrderText: {
    flex: 1,
    fontFamily: "Cairo_600SemiBold",
    fontSize: 12,
    color: AppColors.warning,
    textAlign: "right",
  },
  checkoutBtn: {
    backgroundColor: AppColors.primary,
    flexDirection: "row",
    height: 60,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
  },
  checkoutBtnDisabled: {
    opacity: 0.45,
  },
  checkoutText: {
    color: AppColors.white,
    fontWeight: FontWeight.bold,
    marginRight: 10,
  },
  btnIcon: {
    backgroundColor: AppColors.white,
    borderRadius: 10,
    padding: 5,
  },
});
