import React, { useRef, useEffect } from "react";
import {
  StyleSheet,
  View,
  Pressable,
  Animated,
  Easing,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";

const BRAND_ORANGE = "#FF7622";
const BRAND_DARK = "#E5691E";

export default function UserTypeScreen() {
  const insets = useSafeAreaInsets();
  const { setUserType } = useAuth();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const headerScale = useRef(new Animated.Value(0.8)).current;
  const cardSlide = useRef(new Animated.Value(50)).current;
  const card1Anim = useRef(new Animated.Value(0)).current;
  const card2Anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(headerScale, { toValue: 1, friction: 7, tension: 60, useNativeDriver: true }),
        Animated.timing(cardSlide, { toValue: 0, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
      Animated.stagger(120, [
        Animated.spring(card1Anim, { toValue: 1, friction: 6, useNativeDriver: true }),
        Animated.spring(card2Anim, { toValue: 1, friction: 6, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  const handleSelect = (type: "customer" | "driver") => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setUserType(type);
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[BRAND_ORANGE, BRAND_DARK]}
        style={[styles.topSection, { paddingTop: insets.top + 20 }]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.decorCircle1} />
        <View style={styles.decorCircle2} />

        <Animated.View
          style={[
            styles.headerContent,
            { opacity: fadeAnim, transform: [{ scale: headerScale }] },
          ]}
        >
          <View style={styles.logoWrap}>
            <ThemedText style={styles.logoText}>OnWay</ThemedText>
          </View>
          <ThemedText style={styles.headerTitle}>كيف تود استخدام التطبيق؟</ThemedText>
          <ThemedText style={styles.headerSub}>اختر نوع حسابك للمتابعة</ThemedText>
        </Animated.View>
      </LinearGradient>

      <Animated.View
        style={[
          styles.card,
          {
            opacity: fadeAnim,
            transform: [{ translateY: cardSlide }],
            paddingBottom: insets.bottom + 20,
          },
        ]}
      >
        <View style={styles.handleBar} />

        <Animated.View style={{ opacity: card1Anim, transform: [{ scale: card1Anim }] }}>
          <Pressable
            style={({ pressed }) => [
              styles.typeCard,
              pressed ? styles.typeCardPressed : undefined,
            ]}
            onPress={() => handleSelect("customer")}
            testID="button-customer"
          >
            <View style={styles.cardLeft}>
              <View style={[styles.iconCircle, { backgroundColor: "#FFF5EE" }]}>
                <Feather name="shopping-bag" size={28} color={BRAND_ORANGE} />
              </View>
            </View>
            <View style={styles.cardCenter}>
              <ThemedText style={styles.cardTitle}>زبون</ThemedText>
              <ThemedText style={styles.cardDesc}>
                تصفح المنتجات واطلب التوصيل لباب منزلك
              </ThemedText>
            </View>
            <View style={styles.cardArrow}>
              <Feather name="chevron-left" size={20} color={BRAND_ORANGE} />
            </View>
          </Pressable>
        </Animated.View>

        <Animated.View style={{ opacity: card2Anim, transform: [{ scale: card2Anim }] }}>
          <Pressable
            style={({ pressed }) => [
              styles.typeCard,
              pressed ? styles.typeCardPressed : undefined,
            ]}
            onPress={() => handleSelect("driver")}
            testID="button-driver"
          >
            <View style={styles.cardLeft}>
              <View style={[styles.iconCircle, { backgroundColor: "#E8F5E9" }]}>
                <Feather name="truck" size={28} color="#4CAF50" />
              </View>
            </View>
            <View style={styles.cardCenter}>
              <ThemedText style={styles.cardTitle}>سائق توصيل</ThemedText>
              <ThemedText style={styles.cardDesc}>
                انضم لفريق التوصيل واكسب المال بتوصيل الطلبات
              </ThemedText>
            </View>
            <View style={styles.cardArrow}>
              <Feather name="chevron-left" size={20} color="#4CAF50" />
            </View>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  topSection: {
    paddingBottom: 50,
    alignItems: "center",
    overflow: "hidden",
  },
  decorCircle1: {
    position: "absolute",
    top: -50,
    left: -50,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  decorCircle2: {
    position: "absolute",
    bottom: 10,
    right: -40,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  headerContent: {
    alignItems: "center",
    gap: 6,
  },
  logoWrap: {
    direction: "ltr",
    marginBottom: 14,
  },
  logoText: {
    fontFamily: "Kanit_700Bold",
    fontSize: 28,
    color: "#FFFFFF",
    letterSpacing: 1,
    textAlign: "center",
  },
  headerTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 24,
    color: "#FFFFFF",
  },
  headerSub: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    color: "rgba(255,255,255,0.8)",
  },
  card: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    marginTop: -30,
    paddingHorizontal: 24,
    paddingTop: 12,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
      default: {},
    }),
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E0E0E0",
    alignSelf: "center",
    marginBottom: 30,
  },
  typeCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9F9F9",
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: "#F0F0F0",
  },
  typeCardPressed: {
    transform: [{ scale: 0.97 }],
    backgroundColor: "#F5F5F5",
  },
  cardLeft: {
    marginLeft: 14,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  cardCenter: {
    flex: 1,
    paddingHorizontal: 14,
  },
  cardTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 18,
    color: "#2D2D2D",
    textAlign: "right",
    marginBottom: 2,
  },
  cardDesc: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: "#888",
    textAlign: "right",
    lineHeight: 20,
  },
  cardArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#F0F0F0",
  },
});
