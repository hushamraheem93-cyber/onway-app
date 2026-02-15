import React, { useRef, useState } from "react";
import {
  View,
  StyleSheet,
  Dimensions,
  Pressable,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import PagerView from "react-native-pager-view";
import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { ThemedText } from "@/components/ThemedText";

const { width, height } = Dimensions.get("window");

const BRAND_ORANGE = "#FF6B35";
const BRAND_ORANGE_LIGHT = "#FF8C61";

const onboarding1 = require("../assets/images/onboarding-1.png");
const onboarding2 = require("../assets/images/onboarding-2.png");
const onboarding3 = require("../assets/images/onboarding-3.png");

type RootStackParamList = { PhoneLogin: undefined };

const slides = [
  {
    id: 1,
    image: onboarding1,
    title: "توصيل سريع وموثوق",
    description: "احصل على طلبك في أي مكان وأي وقت داخل قضاء الضلوعية",
  },
  {
    id: 2,
    image: onboarding2,
    title: "تسوق بسهولة",
    description: "اختر من مئات المنتجات المتوفرة بأفضل الأسعار",
  },
  {
    id: 3,
    image: onboarding3,
    title: "تتبع طلبك",
    description: "تابع طلبك لحظة بلحظة حتى يصل إليك",
  },
];

export default function SplashScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const pagerRef = useRef<PagerView>(null);
  const [currentPage, setCurrentPage] = useState(0);

  const handleNext = () => {
    if (currentPage < slides.length - 1) {
      pagerRef.current?.setPage(currentPage + 1);
    } else {
      navigation.navigate("PhoneLogin");
    }
  };

  const handleSkip = () => {
    navigation.navigate("PhoneLogin");
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={[BRAND_ORANGE, BRAND_ORANGE_LIGHT]}
        style={styles.gradient}
      >
        <View style={styles.logoContainer}>
          <View style={styles.logoBox}>
            <Feather name="truck" size={24} color={BRAND_ORANGE} />
          </View>
          <View style={styles.logoTextContainer}>
            <ThemedText style={styles.logoOn}>On</ThemedText>
            <ThemedText style={styles.logoWay}>Way</ThemedText>
          </View>
        </View>

        <View style={styles.illustrationContainer}>
          <View style={styles.circle}>
            <Image
              source={slides[currentPage].image}
              style={styles.illustration}
              contentFit="contain"
            />
          </View>
        </View>

        <View style={styles.contentCard}>
          <View style={styles.handleBar} />

          <ThemedText style={styles.title}>
            {slides[currentPage].title}
          </ThemedText>
          <ThemedText style={styles.description}>
            {slides[currentPage].description}
          </ThemedText>

          <View style={styles.dotsContainer}>
            {slides.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.dot,
                  currentPage === index ? styles.activeDot : undefined,
                ]}
              />
            ))}
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.button,
              pressed ? styles.buttonPressed : undefined,
            ]}
            onPress={handleNext}
            testID="button-get-started"
          >
            <LinearGradient
              colors={[BRAND_ORANGE, BRAND_ORANGE_LIGHT]}
              style={styles.buttonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <ThemedText style={styles.buttonText}>
                {currentPage === slides.length - 1 ? "ابدأ الآن" : "التالي"}
              </ThemedText>
              <View style={styles.buttonArrow}>
                <Feather name="arrow-left" size={18} color={BRAND_ORANGE} />
              </View>
            </LinearGradient>
          </Pressable>
        </View>

        {Platform.OS !== "web" ? (
          <PagerView
            ref={pagerRef}
            style={styles.hiddenPager}
            initialPage={0}
            onPageSelected={(e) => setCurrentPage(e.nativeEvent.position)}
          >
            {slides.map((slide) => (
              <View key={slide.id} />
            ))}
          </PagerView>
        ) : null}
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND_ORANGE,
  },
  gradient: {
    flex: 1,
  },
  logoContainer: {
    flexDirection: "row",
    writingDirection: "ltr",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
    gap: 12,
  },
  logoBox: {
    width: 50,
    height: 50,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
  },
  logoTextContainer: {
    flexDirection: "row",
    writingDirection: "ltr",
    alignItems: "baseline",
  },
  logoOn: {
    fontFamily: "Kanit_700Bold",
    fontSize: 32,
    color: "#FFFFFF",
    letterSpacing: -1,
    writingDirection: "ltr",
  },
  logoWay: {
    fontFamily: "Kanit_700Bold",
    fontSize: 32,
    color: "#FFFFFF",
    opacity: 0.85,
    letterSpacing: -1,
    writingDirection: "ltr",
  },
  illustrationContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    marginTop: -20,
  },
  circle: {
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  illustration: {
    width: 220,
    height: 220,
  },
  contentCard: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 32,
    minHeight: height * 0.35,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#ECF0F1",
    alignSelf: "center",
    marginBottom: 20,
  },
  title: {
    fontFamily: "Cairo_700Bold",
    fontSize: 26,
    color: "#2C3E50",
    textAlign: "center",
    marginBottom: 12,
  },
  description: {
    fontFamily: "Cairo_400Regular",
    fontSize: 15,
    color: "#7F8C8D",
    textAlign: "center",
    lineHeight: 26,
    marginBottom: 24,
  },
  dotsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginBottom: 24,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ECF0F1",
  },
  activeDot: {
    width: 24,
    backgroundColor: BRAND_ORANGE,
  },
  button: {
    borderRadius: 16,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: BRAND_ORANGE,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: { elevation: 8 },
      default: {},
    }),
  },
  buttonPressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.9,
  },
  buttonGradient: {
    flexDirection: "row",
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  buttonText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 18,
    color: "#FFFFFF",
  },
  buttonArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  hiddenPager: {
    width: 0,
    height: 0,
  },
});
