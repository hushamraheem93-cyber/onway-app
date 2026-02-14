import React, { useRef, useEffect } from "react";
import {
  StyleSheet,
  View,
  Pressable,
  Animated,
  Easing,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { AppColors, Spacing, BorderRadius, Shadows } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export default function UserTypeScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { setUserType } = useAuth();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const cardAnim1 = useRef(new Animated.Value(0)).current;
  const cardAnim2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
      Animated.stagger(150, [
        Animated.spring(cardAnim1, { toValue: 1, friction: 6, useNativeDriver: true }),
        Animated.spring(cardAnim2, { toValue: 1, friction: 6, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  const handleSelect = (type: "customer" | "driver") => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setUserType(type);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot, paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
      <Animated.View style={[styles.header, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <View style={styles.brandRow}>
          <ThemedText type="h1" style={styles.brandOn}>On</ThemedText>
          <ThemedText type="h1" style={styles.brandWay}>way</ThemedText>
        </View>
        <ThemedText type="h2" style={styles.title}>
          كيف تود استخدام التطبيق؟
        </ThemedText>
        <ThemedText type="body" style={[styles.subtitle, { color: theme.textSecondary }]}>
          اختر نوع حسابك للمتابعة
        </ThemedText>
      </Animated.View>

      <View style={styles.cardsContainer}>
        <Animated.View style={{ opacity: cardAnim1, transform: [{ scale: cardAnim1 }] }}>
          <Pressable
            style={[styles.typeCard, { backgroundColor: theme.backgroundDefault }, Shadows.md]}
            onPress={() => handleSelect("customer")}
            testID="button-customer"
          >
            <View style={[styles.iconCircle, { backgroundColor: `${AppColors.primary}15` }]}>
              <Feather name="shopping-bag" size={36} color={AppColors.primary} />
            </View>
            <ThemedText type="h3" style={styles.cardTitle}>
              زبون
            </ThemedText>
            <ThemedText type="body" style={[styles.cardDesc, { color: theme.textSecondary }]}>
              تصفح المنتجات واطلب التوصيل لباب منزلك
            </ThemedText>
            <View style={styles.arrowRow}>
              <Feather name="arrow-left" size={20} color={AppColors.primary} />
            </View>
          </Pressable>
        </Animated.View>

        <Animated.View style={{ opacity: cardAnim2, transform: [{ scale: cardAnim2 }] }}>
          <Pressable
            style={[styles.typeCard, { backgroundColor: theme.backgroundDefault }, Shadows.md]}
            onPress={() => handleSelect("driver")}
            testID="button-driver"
          >
            <View style={[styles.iconCircle, { backgroundColor: "#E8F5E915" }]}>
              <Feather name="truck" size={36} color="#4CAF50" />
            </View>
            <ThemedText type="h3" style={styles.cardTitle}>
              سائق توصيل
            </ThemedText>
            <ThemedText type="body" style={[styles.cardDesc, { color: theme.textSecondary }]}>
              انضم لفريق التوصيل واكسب المال بتوصيل الطلبات
            </ThemedText>
            <View style={styles.arrowRow}>
              <Feather name="arrow-left" size={20} color="#4CAF50" />
            </View>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
  },
  header: {
    alignItems: "center",
    marginBottom: 40,
    paddingTop: 30,
  },
  brandRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  brandOn: {
    fontSize: 32,
    fontWeight: "800",
    color: "#2D2D2D",
  },
  brandWay: {
    fontSize: 32,
    fontWeight: "800",
    color: AppColors.primary,
  },
  title: {
    textAlign: "center",
    fontWeight: "700",
    marginBottom: Spacing.sm,
  },
  subtitle: {
    textAlign: "center",
    fontSize: 15,
  },
  cardsContainer: {
    gap: 20,
  },
  typeCard: {
    borderRadius: BorderRadius.xl,
    padding: 24,
    alignItems: "center",
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  cardTitle: {
    fontWeight: "700",
    fontSize: 22,
    marginBottom: Spacing.xs,
    textAlign: "center",
  },
  cardDesc: {
    textAlign: "center",
    fontSize: 14,
    lineHeight: 22,
    marginBottom: Spacing.md,
  },
  arrowRow: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F5F5F5",
    justifyContent: "center",
    alignItems: "center",
  },
});
