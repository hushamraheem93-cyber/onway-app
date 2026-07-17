import React, { useRef } from "react";
import { StyleSheet, Pressable, View, Dimensions, I18nManager } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Image } from "expo-image";
import { Feather, FontAwesome } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Shadows, AppColors, Anim, FontWeight} from "@/constants/theme";
import { Product } from "@/constants/categories";
import { useCart } from "@/context/CartContext";
import { useFavorites } from "@/context/FavoritesContext";
import { useCartAnimation } from "@/context/CartAnimationContext";
import { formatPrice } from "@/constants/currency";
import { resolveImageUrl } from "@/utils/imageUtils";

const SCREEN_WIDTH = Dimensions.get("window").width;

interface ProductCardProps {
  product: Product;
  onPress?: () => void;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function ProductCardComponent({ product, onPress }: ProductCardProps) {
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
        const centerX = I18nManager.isRTL
          ? SCREEN_WIDTH - x - width / 2
          : x + width / 2;
        triggerAnimation(resolveImageUrl(product.image), centerX, y + height / 2);
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
    // Bounce animation: shrink -> expand big -> settle
    favoriteScale.value = withSequence(
      withTiming(0.6, { duration: Anim.duration.instant }),
      withSpring(1.4, { damping: 4, stiffness: 300 }),
      withSpring(1, { damping: 8, stiffness: 200 })
    );
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
        animatedStyle,
      ]}
    >
      {product.discount && product.discount > 0 ? (
        <View style={styles.discountBadge}>
          <ThemedText style={styles.discountBadgeText}>-{product.discount}%</ThemedText>
        </View>
      ) : null}
      <View ref={cardRef} style={styles.imageContainer}>
        <AnimatedPressable
          onPress={handleToggleFavorite}
          style={[
            styles.favoriteButton,
            favoriteAnimatedStyle,
            isFav && styles.favoriteButtonActive,
          ]}
        >
          <FontAwesome
            name={isFav ? "heart" : "heart-o"}
            size={18}
            color={isFav ? AppColors.error : AppColors.gray400}
          />
        </AnimatedPressable>
        <Image
          source={{ uri: resolveImageUrl(product.image) }}
          style={styles.image}
          contentFit="contain"
          cachePolicy="disk"
          transition={200}
        />
      </View>
      <View style={styles.content}>
        <ThemedText type="body" numberOfLines={2} style={styles.name}>
          {product.name}
        </ThemedText>
        {product.weight ? (
          <ThemedText type="small" style={styles.weight}>
            {product.weight}
          </ThemedText>
        ) : null}
        <View style={styles.footer}>
          <View style={styles.priceBlock}>
            <ThemedText type="h4" style={[styles.price, { color: AppColors.primary }]}>
              {formatPrice(product.price)}
            </ThemedText>
            {product.originalPrice && product.originalPrice > product.price ? (
              <ThemedText style={styles.originalPrice}>
                {formatPrice(product.originalPrice)}
              </ThemedText>
            ) : null}
          </View>
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
                <Feather name="plus" size={16} color={AppColors.white} />
              </AnimatedPressable>
              <ThemedText type="body" style={styles.quantityText}>
                {cartQuantity}
              </ThemedText>
              <AnimatedPressable
                onPress={handleRemoveFromCart}
                style={[
                  styles.quantityButton,
                  { backgroundColor: AppColors.error },
                  minusButtonAnimatedStyle,
                ]}
              >
                <Feather name="minus" size={16} color={AppColors.white} />
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
              <Feather name="plus" size={22} color={AppColors.white} />
            </AnimatedPressable>
          )}
        </View>
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 160,
    borderRadius: 24,
    marginBottom: Spacing.md,
    shadowColor: AppColors.black,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 4,
    overflow: "hidden",
  },
  imageContainer: {
    position: "relative",
    alignItems: "center",
    paddingTop: 6,
  },
  image: {
    width: "100%",
    height: 128,
  },
  favoriteButton: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.9)",
    zIndex: 1,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: AppColors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  favoriteButtonActive: {
    backgroundColor: AppColors.errorLight,
    shadowColor: AppColors.error,
    shadowOpacity: 0.3,
  },
  content: {
    padding: 12,
    position: "relative",
  },
  name: {
    textAlign: "right",
    fontWeight: FontWeight.bold,
    fontSize: 15,
    minHeight: 36,
  },
  weight: {
    textAlign: "right",
    color: AppColors.gray500,
    fontSize: 12,
    marginTop: 2,
  },
  footer: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.xs,
  },
  discountBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: AppColors.primary,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
    zIndex: 10,
  },
  discountBadgeText: {
    color: AppColors.white,
    fontSize: 11,
    fontWeight: FontWeight.xBold,
  },
  priceBlock: {
    flex: 1,
    alignItems: "flex-end",
  },
  price: {
    fontWeight: FontWeight.bold,
    textAlign: "right",
  },
  originalPrice: {
    fontSize: 11,
    color: AppColors.gray400,
    textAlign: "right",
    textDecorationLine: "line-through",
    marginTop: 1,
  },
  addButton: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  quantityControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  quantityButton: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  quantityText: {
    minWidth: 20,
    textAlign: "center",
    fontWeight: FontWeight.bold,
  },
});

export const ProductCard = React.memo(ProductCardComponent);
