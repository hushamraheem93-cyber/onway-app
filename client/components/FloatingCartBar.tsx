import React, { useRef, useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Animated,
  ScrollView,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useNavigation } from "@react-navigation/native";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { useCart } from "@/context/CartContext";
import { AppColors, BorderRadius } from "@/constants/theme";
import { formatPrice } from "@/constants/currency";
import { resolveImageUrl } from "@/utils/imageUtils";

const PANEL_MAX_HEIGHT = 320;

interface FloatingCartBarProps {
  bottomOffset: number;
}

function FloatingCartBarComponent({ bottomOffset }: FloatingCartBarProps) {
  const { items, updateQuantity, getTotal } = useCart();
  const navigation = useNavigation<any>();
  const [expanded, setExpanded] = useState(false);
  const animHeight = useRef(new Animated.Value(0)).current;
  const animOpacity = useRef(new Animated.Value(0)).current;

  const total = getTotal();
  const itemCount = items.reduce((s, i) => s + i.quantity, 0);

  const toggle = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const toExpand = !expanded;
    setExpanded(toExpand);
    Animated.parallel([
      Animated.spring(animHeight, {
        toValue: toExpand ? PANEL_MAX_HEIGHT : 0,
        useNativeDriver: false,
        damping: 20,
        stiffness: 180,
      }),
      Animated.timing(animOpacity, {
        toValue: toExpand ? 1 : 0,
        duration: 200,
        useNativeDriver: false,
      }),
    ]).start();
  }, [expanded, animHeight, animOpacity]);

  const handleCheckout = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setExpanded(false);
    Animated.parallel([
      Animated.spring(animHeight, { toValue: 0, useNativeDriver: false, damping: 20, stiffness: 180 }),
      Animated.timing(animOpacity, { toValue: 0, duration: 150, useNativeDriver: false }),
    ]).start();
    navigation.navigate("Main", { screen: "CartTab" });
  };

  const increase = (id: string, qty: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateQuantity(id, qty + 1);
  };

  const decrease = (id: string, qty: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateQuantity(id, qty - 1);
  };

  if (items.length === 0) return null;

  return (
    <View style={[styles.wrapper, { bottom: bottomOffset }]}>
      <Animated.View style={[styles.panel, { height: animHeight, opacity: animOpacity }]}>
        <ScrollView
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {items.map((cartItem) => (
            <View key={cartItem.product.id} style={styles.cartRow}>
              <View style={styles.rowLeft}>
                <View style={styles.qtyRow}>
                  <Pressable
                    style={styles.qtyBtn}
                    onPress={() => increase(cartItem.product.id, cartItem.quantity)}
                    testID={`float-increase-${cartItem.product.id}`}
                  >
                    <Feather name="plus" size={14} color={AppColors.white} />
                  </Pressable>
                  <ThemedText style={styles.qtyNum}>{cartItem.quantity}</ThemedText>
                  <Pressable
                    style={[styles.qtyBtn, styles.qtyBtnMinus]}
                    onPress={() => decrease(cartItem.product.id, cartItem.quantity)}
                    testID={`float-decrease-${cartItem.product.id}`}
                  >
                    <Feather name={cartItem.quantity === 1 ? "trash-2" : "minus"} size={14} color={cartItem.quantity === 1 ? AppColors.error : AppColors.primary} />
                  </Pressable>
                </View>
                <View style={styles.itemInfo}>
                  <ThemedText style={styles.itemName} numberOfLines={1}>
                    {cartItem.product.name}
                  </ThemedText>
                  <ThemedText style={styles.itemPrice}>
                    {formatPrice(cartItem.product.price * cartItem.quantity)}
                  </ThemedText>
                </View>
              </View>
              <Image
                source={{ uri: resolveImageUrl(cartItem.product.image) }}
                style={styles.itemImg}
                contentFit="cover"
                cachePolicy="disk"
              />
            </View>
          ))}
        </ScrollView>
      </Animated.View>

      <Pressable style={styles.bar} onPress={toggle} testID="floating-cart-bar">
        <View style={styles.barRight}>
          <View style={styles.countBadge}>
            <ThemedText style={styles.countText}>{itemCount}</ThemedText>
          </View>
          <ThemedText style={styles.barLabel}>عرض السلة</ThemedText>
          <Feather
            name={expanded ? "chevron-down" : "chevron-up"}
            size={18}
            color={AppColors.white}
          />
        </View>
        <View style={styles.barLeft}>
          <ThemedText style={styles.totalLabel}>المجموع</ThemedText>
          <ThemedText style={styles.totalAmount}>{formatPrice(total)}</ThemedText>
        </View>
      </Pressable>

      {expanded ? (
        <Pressable style={styles.checkoutBtn} onPress={handleCheckout} testID="float-checkout-btn">
          <Feather name="shopping-cart" size={16} color={AppColors.white} />
          <ThemedText style={styles.checkoutText}>إتمام الطلب</ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

export const FloatingCartBar = React.memo(FloatingCartBarComponent);
const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 12,
    right: 12,
    zIndex: 999,
  },
  panel: {
    backgroundColor: AppColors.white,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    marginBottom: 6,
    borderWidth: 1,
    borderColor: AppColors.gray100,
  },
  listContent: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 8,
  },
  cartRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.gray100,
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 10,
  },
  itemImg: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: AppColors.gray100,
  },
  itemInfo: {
    flex: 1,
    alignItems: "flex-end",
  },
  itemName: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 12,
    color: AppColors.black,
    textAlign: "right",
  },
  itemPrice: {
    fontFamily: "Cairo_700Bold",
    fontSize: 11,
    color: AppColors.primary,
    marginTop: 2,
  },
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  qtyBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: AppColors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyBtnMinus: {
    backgroundColor: AppColors.secondary,
  },
  qtyNum: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    color: AppColors.black,
    minWidth: 20,
    textAlign: "center",
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: AppColors.primary,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  barRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  countBadge: {
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 12,
    minWidth: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  countText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 12,
    color: AppColors.white,
  },
  barLabel: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    color: AppColors.white,
  },
  barLeft: {
    alignItems: "flex-end",
  },
  totalLabel: {
    fontFamily: "Cairo_400Regular",
    fontSize: 10,
    color: AppColors.textOnBrandMuted,
  },
  totalAmount: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    color: AppColors.white,
  },
  checkoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: AppColors.black,
    borderRadius: BorderRadius.lg,
    paddingVertical: 12,
    marginTop: 6,
  },
  checkoutText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    color: AppColors.white,
  },
});
