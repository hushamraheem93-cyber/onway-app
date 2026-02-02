import React from "react";
import { StyleSheet, FlatList, View, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Shadows, AppColors } from "@/constants/theme";
import { useCart, CartItem } from "@/context/CartContext";
import { CartItemCard } from "@/components/CartItemCard";
import { EmptyState } from "@/components/EmptyState";
import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function CartScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const { items, getTotal, clearCart } = useCart();

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
      image={require("../../assets/images/empty-cart.png")}
      title="سلتك فارغة"
      subtitle="أضف منتجات إلى سلتك للبدء بالتسوق"
      buttonText="ابدأ التسوق"
      onButtonPress={handleStartShopping}
    />
  );

  const total = getTotal();

  return (
    <View style={{ flex: 1, backgroundColor: theme.backgroundRoot }}>
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.lg,
          paddingBottom: items.length > 0 ? 120 + tabBarHeight : tabBarHeight + Spacing.xl,
          paddingHorizontal: Spacing.lg,
          flexGrow: 1,
        }}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        data={items}
        renderItem={renderItem}
        keyExtractor={(item) => item.product.id}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={renderEmpty}
      />

      {items.length > 0 ? (
        <View
          style={[
            styles.footer,
            {
              backgroundColor: theme.backgroundDefault,
              paddingBottom: tabBarHeight + Spacing.lg,
            },
            Shadows.lg,
          ]}
        >
          <View style={styles.totalRow}>
            <ThemedText type="body" style={{ color: theme.textSecondary }}>
              المجموع الكلي
            </ThemedText>
            <ThemedText type="h2" style={{ color: AppColors.primary }}>
              {total.toFixed(2)} ر.س
            </ThemedText>
          </View>
          <Button onPress={handleCheckout} style={styles.checkoutButton}>
            إتمام الطلب
          </Button>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.lg,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
  },
  totalRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  checkoutButton: {
    width: "100%",
  },
});
