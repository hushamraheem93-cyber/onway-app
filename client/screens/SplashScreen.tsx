import React, { useRef, useEffect } from "react";
import {
  View,
  StyleSheet,
  Dimensions,
  Pressable,
  Animated,
  Easing,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { ThemedText } from "@/components/ThemedText";

const { width, height } = Dimensions.get("window");
const deliveryHeroImage = require("../assets/images/delivery-hero.png");

const BRAND_ORANGE = "#FF7622";
const BRAND_DARK = "#E5691E";
const BRAND_LIGHT = "#FF9A5C";

type RootStackParamList = {
  PhoneLogin: undefined;
};

export default function SplashScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.5)).current;
  const imageSlide = useRef(new Animated.Value(80)).current;
  const imageOpacity = useRef(new Animated.Value(0)).current;
  const textSlide = useRef(new Animated.Value(40)).current;
  const buttonSlide = useRef(new Animated.Value(60)).current;
  const buttonOpacity = useRef(new Animated.Value(0)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.spring(logoScale, {
          toValue: 1,
          friction: 6,
          tension: 80,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(imageSlide, {
          toValue: 0,
          duration: 600,
          easing: Easing.out(Easing.back(1.1)),
          useNativeDriver: true,
        }),
        Animated.timing(imageOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(textSlide, {
          toValue: 0,
          duration: 500,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(buttonSlide, {
          toValue: 0,
          duration: 400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(buttonOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: 1,
          duration: 2500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 2500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const floatY = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -14],
  });

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
            styles.logoRow,
            { opacity: fadeAnim, transform: [{ scale: logoScale }] },
          ]}
        >
          <View style={styles.logoIconWrap}>
            <Feather name="truck" size={20} color={BRAND_ORANGE} />
          </View>
          <ThemedText style={styles.logoOn}>On</ThemedText>
          <ThemedText style={styles.logoWay}>Way</ThemedText>
        </Animated.View>

        <Animated.View
          style={[
            styles.imageWrap,
            {
              opacity: imageOpacity,
              transform: [{ translateY: Animated.add(imageSlide, floatY) }],
            },
          ]}
        >
          <View style={styles.imageGlow} />
          <Image
            source={deliveryHeroImage}
            style={styles.heroImage}
            contentFit="contain"
          />
        </Animated.View>
      </LinearGradient>

      <View style={[styles.bottomSection, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.handleBar} />

        <Animated.View
          style={[
            styles.textBlock,
            {
              opacity: fadeAnim,
              transform: [{ translateY: textSlide }],
            },
          ]}
        >
          <ThemedText style={styles.headline}>توصيل سريع وموثوق</ThemedText>
          <ThemedText style={styles.subheadline}>
            احصل على طلبك في أي مكان وأي وقت{"\n"}داخل قضاء الضلوعية
          </ThemedText>
        </Animated.View>

        <Animated.View
          style={[
            styles.dotsRow,
            { opacity: fadeAnim },
          ]}
        >
          <View style={[styles.dot, styles.dotActive]} />
          <View style={styles.dot} />
          <View style={styles.dot} />
        </Animated.View>

        <Animated.View
          style={[
            styles.buttonWrap,
            {
              opacity: buttonOpacity,
              transform: [{ translateY: buttonSlide }],
            },
          ]}
        >
          <Pressable
            style={({ pressed }) => [
              styles.ctaButton,
              pressed ? styles.ctaPressed : undefined,
            ]}
            onPress={() => navigation.navigate("PhoneLogin")}
            testID="button-get-started"
          >
            <LinearGradient
              colors={[BRAND_ORANGE, BRAND_DARK]}
              style={styles.ctaGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <ThemedText style={styles.ctaText}>ابدأ الآن</ThemedText>
              <View style={styles.ctaArrow}>
                <Feather name="arrow-left" size={20} color={BRAND_ORANGE} />
              </View>
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  topSection: {
    flex: 1.1,
    alignItems: "center",
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    overflow: "hidden",
    paddingBottom: 10,
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
    bottom: 20,
    right: -40,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  logoIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  logoOn: {
    fontFamily: "Kanit_700Bold",
    fontSize: 34,
    color: "#FFFFFF",
    letterSpacing: 1,
  },
  logoWay: {
    fontFamily: "Kanit_700Bold",
    fontSize: 34,
    color: "rgba(255,255,255,0.7)",
    letterSpacing: 1,
  },
  imageWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  imageGlow: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  heroImage: {
    width: width * 0.6,
    height: width * 0.6,
    maxWidth: 280,
    maxHeight: 280,
  },
  bottomSection: {
    flex: 0.7,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 28,
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 16,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E0E0E0",
    marginBottom: 16,
  },
  textBlock: {
    alignItems: "center",
  },
  headline: {
    fontFamily: "Cairo_700Bold",
    fontSize: 24,
    color: "#2D2D2D",
    textAlign: "center",
    marginBottom: 8,
  },
  subheadline: {
    fontFamily: "Cairo_400Regular",
    fontSize: 15,
    color: "#888",
    textAlign: "center",
    lineHeight: 24,
  },
  dotsRow: {
    flexDirection: "row",
    gap: 8,
    marginVertical: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#E0E0E0",
  },
  dotActive: {
    width: 24,
    borderRadius: 4,
    backgroundColor: BRAND_ORANGE,
  },
  buttonWrap: {
    width: "100%",
  },
  ctaButton: {
    borderRadius: 16,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: BRAND_ORANGE,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
      default: {},
    }),
  },
  ctaPressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.9,
  },
  ctaGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 12,
  },
  ctaText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 18,
    color: "#FFFFFF",
  },
  ctaArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
});
