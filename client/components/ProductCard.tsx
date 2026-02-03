import React from "react";
import { StyleSheet, Pressable, View } from "react-native";
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
import { Product } from "@/constants/categories";
import { useCart } from "@/context/CartContext";
import { formatPrice } from "@/constants/currency";

interface ProductCardProps {
  product: Product;
  onPress?: () => void;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function ProductCard({ product, onPress }: ProductCardProps) {
  const { theme } = useTheme();
  const { addToCart, items } = useCart();
  const scale = useSharedValue(1);
  const buttonScale = useSharedValue(1);

  const isInCart = items.some((item) => item.product.id === product.id);
  const cartQuantity = items.find((item) => item.product.id === product.id)?.quantity || 0;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.98, { damping: 15, stiffness: 150 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 150 });
  };

  const handleAddToCart = () => {
    buttonScale.value = withSpring(0.9, { damping: 15, stiffness: 200 });
    setTimeout(() => {
      buttonScale.value = withSpring(1, { damping: 15, stiffness: 200 });
    }, 100);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addToCart(product);
  };

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        styles.card,
        { backgroundColor: theme.backgroundDefault },
        Shadows.md,
        animatedStyle,
      ]}
    >
      <Image
        source={{ uri: product.image }}
        style={styles.image}
        contentFit="cover"
        transition={200}
      />
      <View style={styles.content}>
        <ThemedText type="h4" numberOfLines={1} style={styles.name}>
          {product.name}
        </ThemedText>
        <ThemedText
          type="small"
          numberOfLines={2}
          style={[styles.description, { color: theme.textSecondary }]}
        >
          {product.description}
        </ThemedText>
        <View style={styles.footer}>
          <ThemedText type="h3" style={[styles.price, { color: AppColors.primary }]}>
            {formatPrice(product.price)}
          </ThemedText>
          {isInCart ? (
            <View style={[styles.inCartBadge, { backgroundColor: "#4CAF50" }]}>
              <Feather name="check" size={16} color="#FFFFFF" />
              <ThemedText type="small" style={styles.cartQuantity}>
                {cartQuantity}
              </ThemedText>
            </View>
          ) : null}
          <AnimatedPressable
            onPress={handleAddToCart}
            style={[
              styles.addButton,
              { backgroundColor: isInCart ? "#4CAF50" : AppColors.primary },
              buttonAnimatedStyle,
            ]}
          >
            <Feather name="plus" size={20} color="#FFFFFF" />
          </AnimatedPressable>
        </View>
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row-reverse",
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    marginBottom: Spacing.md,
  },
  image: {
    width: 100,
    height: 100,
  },
  content: {
    flex: 1,
    padding: Spacing.md,
    justifyContent: "space-between",
  },
  name: {
    textAlign: "right",
  },
  description: {
    textAlign: "right",
    marginTop: Spacing.xs,
  },
  footer: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.sm,
  },
  price: {
    fontWeight: "700",
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  inCartBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    marginLeft: Spacing.sm,
  },
  cartQuantity: {
    color: "#FFFFFF",
    fontWeight: "700",
    marginRight: Spacing.xs,
  },
});
