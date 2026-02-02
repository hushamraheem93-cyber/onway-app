import React from "react";
import { StyleSheet, View, Pressable } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Shadows, AppColors } from "@/constants/theme";
import { CartItem } from "@/context/CartContext";
import { useCart } from "@/context/CartContext";

interface CartItemCardProps {
  item: CartItem;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function CartItemCard({ item }: CartItemCardProps) {
  const { theme } = useTheme();
  const { updateQuantity, removeFromCart } = useCart();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handleIncrease = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateQuantity(item.product.id, item.quantity + 1);
  };

  const handleDecrease = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (item.quantity === 1) {
      removeFromCart(item.product.id);
    } else {
      updateQuantity(item.product.id, item.quantity - 1);
    }
  };

  const handleRemove = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    removeFromCart(item.product.id);
  };

  return (
    <Animated.View
      style={[
        styles.card,
        { backgroundColor: theme.backgroundDefault },
        Shadows.sm,
        animatedStyle,
      ]}
    >
      <Image
        source={{ uri: item.product.image }}
        style={styles.image}
        contentFit="cover"
        transition={200}
      />
      <View style={styles.content}>
        <View style={styles.header}>
          <ThemedText type="h4" numberOfLines={1} style={styles.name}>
            {item.product.name}
          </ThemedText>
          <Pressable onPress={handleRemove} style={styles.removeButton}>
            <Feather name="trash-2" size={18} color={theme.error} />
          </Pressable>
        </View>
        <ThemedText type="body" style={[styles.price, { color: AppColors.primary }]}>
          {item.product.price.toFixed(2)} ر.س
        </ThemedText>
        <View style={styles.quantityContainer}>
          <AnimatedPressable
            onPress={handleDecrease}
            style={[styles.quantityButton, { backgroundColor: theme.backgroundSecondary }]}
          >
            <Feather name="minus" size={16} color={theme.text} />
          </AnimatedPressable>
          <ThemedText type="h4" style={styles.quantity}>
            {item.quantity}
          </ThemedText>
          <AnimatedPressable
            onPress={handleIncrease}
            style={[styles.quantityButton, { backgroundColor: AppColors.primary }]}
          >
            <Feather name="plus" size={16} color="#FFFFFF" />
          </AnimatedPressable>
        </View>
      </View>
      <ThemedText type="h4" style={[styles.total, { color: theme.text }]}>
        {(item.product.price * item.quantity).toFixed(2)} ر.س
      </ThemedText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row-reverse",
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    marginBottom: Spacing.md,
    padding: Spacing.md,
  },
  image: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.md,
  },
  content: {
    flex: 1,
    marginRight: Spacing.md,
  },
  header: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  name: {
    flex: 1,
    textAlign: "right",
  },
  removeButton: {
    padding: Spacing.xs,
  },
  price: {
    textAlign: "right",
    marginTop: Spacing.xs,
  },
  quantityContainer: {
    flexDirection: "row-reverse",
    alignItems: "center",
    marginTop: Spacing.sm,
  },
  quantityButton: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  quantity: {
    marginHorizontal: Spacing.md,
    minWidth: 24,
    textAlign: "center",
  },
  total: {
    position: "absolute",
    bottom: Spacing.md,
    left: Spacing.md,
    fontWeight: "700",
  },
});
