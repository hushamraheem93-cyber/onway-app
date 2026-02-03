import React, { useRef } from "react";
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
import { useFavorites } from "@/context/FavoritesContext";
import { useCartAnimation } from "@/context/CartAnimationContext";
import { formatPrice } from "@/constants/currency";

interface ProductCardProps {
  product: Product;
  onPress?: () => void;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function ProductCard({ product, onPress }: ProductCardProps) {
  const { theme } = useTheme();
  const { addToCart, updateQuantity, items } = useCart();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { triggerAnimation } = useCartAnimation();
  const scale = useSharedValue(1);
  const buttonScale = useSharedValue(1);
  const minusButtonScale = useSharedValue(1);
  const favoriteScale = useSharedValue(1);
  const cardRef = useRef<View>(null);

  const isInCart = items.some((item) => item.product.id === product.id);
  const cartQuantity = items.find((item) => item.product.id === product.id)?.quantity || 0;
  const isFav = isFavorite(product.id);

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
    
    if (cardRef.current) {
      cardRef.current.measureInWindow((x, y, width, height) => {
        triggerAnimation(product.image, x + width / 2, y + height / 2);
      });
    }
    
    addToCart(product);
  };

  const handleRemoveFromCart = () => {
    minusButtonScale.value = withSpring(0.9, { damping: 15, stiffness: 200 });
    setTimeout(() => {
      minusButtonScale.value = withSpring(1, { damping: 15, stiffness: 200 });
    }, 100);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateQuantity(product.id, cartQuantity - 1);
  };

  const minusButtonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: minusButtonScale.value }],
  }));

  const favoriteAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: favoriteScale.value }],
  }));

  const handleToggleFavorite = () => {
    favoriteScale.value = withSpring(0.8, { damping: 15, stiffness: 200 });
    setTimeout(() => {
      favoriteScale.value = withSpring(1, { damping: 15, stiffness: 200 });
    }, 100);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleFavorite(product);
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
      <View ref={cardRef} style={styles.imageContainer}>
        <Image
          source={{ uri: product.image }}
          style={styles.image}
          contentFit="cover"
          transition={200}
        />
        <AnimatedPressable
          onPress={handleToggleFavorite}
          style={[styles.favoriteButton, favoriteAnimatedStyle]}
        >
          <Feather
            name={isFav ? "heart" : "heart"}
            size={18}
            color={isFav ? "#E53935" : "#999999"}
            style={isFav ? { opacity: 1 } : { opacity: 0.7 }}
          />
        </AnimatedPressable>
      </View>
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
            <View style={styles.quantityControls}>
              <AnimatedPressable
                onPress={handleAddToCart}
                style={[
                  styles.quantityButton,
                  { backgroundColor: AppColors.primary },
                  buttonAnimatedStyle,
                ]}
              >
                <Feather name="plus" size={18} color="#FFFFFF" />
              </AnimatedPressable>
              <ThemedText type="h4" style={styles.quantityText}>
                {cartQuantity}
              </ThemedText>
              <AnimatedPressable
                onPress={handleRemoveFromCart}
                style={[
                  styles.quantityButton,
                  { backgroundColor: "#E53935" },
                  minusButtonAnimatedStyle,
                ]}
              >
                <Feather name="minus" size={18} color="#FFFFFF" />
              </AnimatedPressable>
            </View>
          ) : (
            <AnimatedPressable
              onPress={handleAddToCart}
              style={[
                styles.addButton,
                { backgroundColor: AppColors.primary },
                buttonAnimatedStyle,
              ]}
            >
              <Feather name="plus" size={20} color="#FFFFFF" />
            </AnimatedPressable>
          )}
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
  imageContainer: {
    position: "relative",
  },
  image: {
    width: 100,
    height: 100,
  },
  favoriteButton: {
    position: "absolute",
    top: 6,
    left: 6,
    width: 28,
    height: 28,
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
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
  quantityControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  quantityButton: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  quantityText: {
    minWidth: 24,
    textAlign: "center",
    fontWeight: "700",
  },
});
