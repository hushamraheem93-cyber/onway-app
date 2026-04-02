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
import { formatPrice } from "@/constants/currency";
import { resolveImageUrl } from "@/utils/imageUtils";

interface CartItemCardProps {
  item: CartItem;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);


export function CartItemCard({ item }: CartItemCardProps) {
  const { theme, isDark } = useTheme();
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
        animatedStyle,
      ]}
    >
      <Image
        source={{ uri: resolveImageUrl(item.product.image) }}
        style={styles.image}
        contentFit="cover"
        cachePolicy="disk"
        transition={200}
      />
      <View style={styles.content}>
        <ThemedText type="h4" numberOfLines={2} style={styles.name}>
          {item.product.name}
        </ThemedText>
        <ThemedText type="body" style={styles.price}>
          {formatPrice(item.product.price)}
        </ThemedText>
        <View style={[styles.quantityContainer, { backgroundColor: isDark ? theme.backgroundSecondary : "#F5F5F5" }]}>
          <AnimatedPressable onPress={handleIncrease} style={styles.qtyBtn}>
            <Feather name="plus" size={20} color={AppColors.primary} />
          </AnimatedPressable>
          <ThemedText type="body" style={styles.qtyText}>
            {item.quantity}
          </ThemedText>
          <AnimatedPressable onPress={handleDecrease} style={styles.qtyBtn}>
            <Feather name="minus" size={20} color="#666" />
          </AnimatedPressable>
        </View>
      </View>
      <Pressable onPress={handleRemove} style={styles.deleteBtn}>
        <Feather name="trash-2" size={22} color="#FF3B30" />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row-reverse",
    borderRadius: 15,
    padding: 12,
    marginVertical: 8,
    marginHorizontal: 15,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  image: {
    width: 80,
    height: 80,
    borderRadius: 10,
    backgroundColor: "#f9f9f9",
  },
  content: {
    flex: 1,
    marginRight: 15,
    alignItems: "flex-end",
  },
  name: {
    fontSize: 13,
    fontWeight: "bold",
    textAlign: "right",
  },
  price: {
    color: AppColors.primary,
    fontSize: 14,
    marginVertical: 5,
    fontWeight: "600",
  },
  quantityContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 8,
    paddingHorizontal: 5,
  },
  qtyBtn: {
    padding: 5,
  },
  qtyText: {
    fontSize: 13,
    fontWeight: "bold",
    marginHorizontal: 15,
  },
  deleteBtn: {
    padding: 10,
  },
});
