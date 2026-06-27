import React from "react";
import { StyleSheet, FlatList, View, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { Spacing, AppColors } from "@/constants/theme";
import { useCart, CartItem } from "@/context/CartContext";
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
  const { items, getTotal, clearCart } = useCart();

  const subtotal = getTotal();

  const handleCheckout = () => {
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
            <TouchableOpacity onPress={handleClearCart} style={styles.clearButton}>
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
          <View style={[styles.summaryRow, styles.totalRow]}>
            <ThemedText type="h3" style={styles.totalValue}>
              {formatPrice(subtotal)}
            </ThemedText>
            <ThemedText type="h4" style={styles.totalLabel}>
              المجموع الكلي
            </ThemedText>
          </View>

          <TouchableOpacity style={styles.checkoutBtn} onPress={handleCheckout}>
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
    marginBottom: Spacing.md,
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
  totalLabel: {
    fontWeight: "bold",
    color: AppColors.gray700,
  },
  totalValue: {
    fontWeight: "bold",
    color: AppColors.primary,
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
  checkoutText: {
    color: AppColors.white,
    fontWeight: "bold",
    marginRight: 10,
  },
  btnIcon: {
    backgroundColor: AppColors.white,
    borderRadius: 10,
    padding: 5,
  },
});
