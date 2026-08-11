import React, { useCallback, useRef } from "react";
import {
  StyleSheet,
  Pressable,
  View,
  Dimensions,
  I18nManager,
} from "react-native";
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
import { Spacing, AppColors, Anim, FontWeight } from "@/constants/theme";
import { Product } from "@/constants/categories";
import { useCart, getCartKey } from "@/context/CartContext";
import { useFavorites } from "@/context/FavoritesContext";
import { useCartAnimation } from "@/context/CartAnimationContext";
import { formatPrice } from "@/constants/currency";
import { resolveImageUrl } from "@/utils/imageUtils";

const SCREEN_WIDTH = Dimensions.get("window").width;

interface ProductCardProps {
  product: Product;
  onPress?: () => void;
  // Optional explicit card width. Horizontal lists keep the default fixed 160px;
  // the 2-column grid passes a responsive half-width so cards never overflow on
  // small (~320pt) devices (B, #17).
  width?: number;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Everything the card DRAWS, with none of the context it draws from (H-41).
 *
 * This layer owns the Reanimated shared values, the animated styles and the
 * cardRef that measureInWindow() reads, because all three must survive across
 * renders and belong with the JSX that uses them. It subscribes to nothing except
 * the theme, so a cart or favourites change cannot reach it except through props.
 *
 * Every prop is either a primitive or a permanently stable identity, which is what
 * lets React.memo below actually bail out. See the note on ProductCardView's memo.
 */
interface ProductCardViewProps {
  product: Product;
  onPress?: () => void;
  width?: number;
  isInCart: boolean;
  cartQuantity: number;
  isFav: boolean;
  onAdd: () => void;
  onRemove: () => void;
  onToggleFavorite: () => void;
  onFlyToCart: (centerX: number, centerY: number) => void;
}

function ProductCardViewComponent({
  product,
  onPress,
  width,
  isInCart,
  cartQuantity,
  isFav,
  onAdd,
  onRemove,
  onToggleFavorite,
  onFlyToCart,
}: ProductCardViewProps) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);
  const buttonScale = useSharedValue(1);
  const minusButtonScale = useSharedValue(1);
  const favoriteScale = useSharedValue(1);
  const cardRef = useRef<View>(null);

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

    // Unchanged: the fly-to-cart animation is still driven from this ref, still
    // guarded on the ref being attached, and still uses the same RTL mirroring.
    // Only the destination of the measurement moved — onFlyToCart is the parent's
    // triggerAnimation with the product's image already resolved.
    if (cardRef.current) {
      cardRef.current.measureInWindow((x, y, width, height) => {
        const centerX = I18nManager.isRTL
          ? SCREEN_WIDTH - x - width / 2
          : x + width / 2;
        onFlyToCart(centerX, y + height / 2);
      });
    }

    // Still called unconditionally and outside the measure callback, exactly as
    // before: the item is added whether or not the ref was ready to animate.
    onAdd();
  };

  const handleRemoveFromCart = () => {
    minusButtonScale.value = withSpring(0.9, { damping: 15, stiffness: 200 });
    setTimeout(() => {
      minusButtonScale.value = withSpring(1, { damping: 15, stiffness: 200 });
    }, 100);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onRemove();
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
      withSpring(1, { damping: 8, stiffness: 200 }),
    );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToggleFavorite();
  };

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        styles.card,
        { backgroundColor: theme.backgroundDefault },
        width != null ? { width } : null,
        animatedStyle,
      ]}
    >
      {product.discount && product.discount > 0 ? (
        <View style={styles.discountBadge}>
          <ThemedText style={styles.discountBadgeText}>
            -{product.discount}%
          </ThemedText>
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
            <ThemedText
              type="h4"
              style={[styles.price, { color: AppColors.primary }]}
            >
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

/**
 * The presentational card. Nothing here reads the cart, so a cart change can only
 * reach it through the props below — and those are compared by this memo.
 *
 * For a grid of N cards, one "+" press changes isInCart/cartQuantity on exactly
 * ONE of them. The other N-1 receive byte-identical props and bail out here,
 * skipping the whole subtree: the image, the texts, and the re-registration of
 * four useAnimatedStyle worklets.
 */
const ProductCardView = React.memo(ProductCardViewComponent);

/**
 * The cart-connected shell (H-41).
 *
 * It subscribes to the cart, favourites and cart-animation contexts, so it still
 * re-renders on every cart change — that is unavoidable, because computing
 * isInCart/cartQuantity is exactly what it is for, and it is cheap: this function
 * does one array scan and returns an element.
 *
 * The expensive half is behind ProductCardView's memo, which only holds if every
 * prop keeps its identity. Two of the context callbacks do NOT: CartContext builds
 * addToCart with useCallback(..., [items]), and FavoritesContext builds
 * toggleFavorite from isFavorite, which is keyed on [favorites]. Both therefore
 * change identity on precisely the events we are trying to absorb, and forwarding
 * them directly would defeat the memo for every card.
 *
 * So the handlers below read through a ref that is refreshed on every render. Their
 * own identities are created once ([] deps) and never change, while the work they
 * do always uses the newest context functions, the newest product and the newest
 * quantity. That is deliberately NOT a useCallback dependency list: a list built
 * from these values would be unstable by construction, and one built from fewer
 * would go stale. Assigning to the ref during render is safe here because it is
 * idempotent — a double render under StrictMode writes the same values — and the
 * handlers can only fire from user interaction, which is after commit.
 */
function ProductCardComponent({ product, onPress, width }: ProductCardProps) {
  const { addToCart, updateQuantity, items } = useCart();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { triggerAnimation } = useCartAnimation();

  // H-41: one traversal, not two. `some()` followed by `find()` walked the cart
  // twice for two answers the same line already carries.
  //
  // C-18: the match used to be `item.product.id === product.id`, which binds this
  // card to the FIRST line of the product whatever variant it carries — and the
  // "−" handler then passed the bare product id, which CartContext's dual-key
  // branch applies to EVERY line of that product. Cart holding
  // "pizza/large × 3" and "pizza/small × 1" showed 3 here, and one press set both
  // to 2: the customer was billed for a small pizza they never added.
  //
  // This card has no variant selector — its "+" calls addToCart(product), which
  // creates the plain line — so the plain line's key is its identity. Reads and
  // writes now agree on exactly one line, and variant lines are edited where they
  // are actually shown (CartItemCard, FloatingCartBar), which already key correctly.
  const cartKey = getCartKey({ product });
  const cartLine = items.find((item) => getCartKey(item) === cartKey);
  const isInCart = cartLine !== undefined;
  const cartQuantity = cartLine?.quantity || 0;
  const isFav = isFavorite(product.id);

  const latest = useRef({
    addToCart,
    updateQuantity,
    toggleFavorite,
    triggerAnimation,
    product,
    cartQuantity,
    cartKey,
  });
  latest.current = {
    addToCart,
    updateQuantity,
    toggleFavorite,
    triggerAnimation,
    product,
    cartQuantity,
    cartKey,
  };

  const onAdd = useCallback(() => {
    latest.current.addToCart(latest.current.product);
  }, []);

  const onRemove = useCallback(() => {
    const l = latest.current;
    // C-18: the cart key, not the bare product id — see the cartLine comment above.
    l.updateQuantity(l.cartKey, l.cartQuantity - 1);
  }, []);

  const onToggleFavorite = useCallback(() => {
    latest.current.toggleFavorite(latest.current.product);
  }, []);

  const onFlyToCart = useCallback((centerX: number, centerY: number) => {
    const l = latest.current;
    l.triggerAnimation(resolveImageUrl(l.product.image), centerX, centerY);
  }, []);

  return (
    <ProductCardView
      product={product}
      onPress={onPress}
      width={width}
      isInCart={isInCart}
      cartQuantity={cartQuantity}
      isFav={isFav}
      onAdd={onAdd}
      onRemove={onRemove}
      onToggleFavorite={onToggleFavorite}
      onFlyToCart={onFlyToCart}
    />
  );
}

export const ProductCard = React.memo(ProductCardComponent);
