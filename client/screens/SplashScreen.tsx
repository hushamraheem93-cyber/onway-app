import React, { useRef, useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  Dimensions,
  Pressable,
  FlatList,
  Platform,
  ViewToken,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const BRAND_ORANGE = "#FF7622";

const onboarding1 = require("../assets/images/onboarding-1.png");
const onboarding2 = require("../assets/images/onboarding-2.png");
const onboarding3 = require("../assets/images/onboarding-3.png");

type RootStackParamList = { PhoneLogin: undefined };

interface SlideData {
  id: string;
  image: any;
  title: string;
  subtitle: string;
}

const SLIDES: SlideData[] = [
  {
    id: "1",
    image: onboarding1,
    title: "توصيل سريع وموثوق",
    subtitle: "نوصل طلبك بأسرع وقت ممكن\nداخل قضاء الضلوعية",
  },
  {
    id: "2",
    image: onboarding2,
    title: "تسوق بسهولة",
    subtitle: "تصفح مئات المنتجات من متاجر متنوعة\nواختر ما يناسبك",
  },
  {
    id: "3",
    image: onboarding3,
    title: "لحد باب بيتك",
    subtitle: "استلم طلبك وأنت مرتاح في بيتك\nبضغطة زر واحدة",
  },
];

const IMAGE_SIZE = Math.min(SCREEN_WIDTH * 0.4, 160);

export default function SplashScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { markSplashSeen } = useAuth();
  const flatListRef = useRef<FlatList>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setActiveIndex(viewableItems[0].index);
      }
    },
    []
  );

  const viewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 50,
  }).current;

  const handleNext = () => {
    if (activeIndex < SLIDES.length - 1) {
      const nextIndex = activeIndex + 1;
      setActiveIndex(nextIndex);
      flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
    } else {
      markSplashSeen();
      navigation.navigate("PhoneLogin");
    }
  };

  const handleSkip = () => {
    markSplashSeen();
    navigation.navigate("PhoneLogin");
  };

  const renderSlide = ({ item }: { item: SlideData }) => (
    <View style={styles.slideContainer}>
      <View style={styles.imageCircle}>
        <Image source={item.image} style={styles.slideImage} contentFit="contain" />
      </View>
      <View style={styles.slideTextWrap}>
        <ThemedText style={styles.slideTitle}>{item.title}</ThemedText>
        <ThemedText style={styles.slideSubtitle}>{item.subtitle}</ThemedText>
      </View>
    </View>
  );

  const isLastSlide = activeIndex === SLIDES.length - 1;

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom", "left", "right"]}>
      <View style={styles.topRow}>
        <Pressable onPress={handleSkip} style={styles.skipBtn} testID="button-skip">
          <ThemedText style={styles.skipText}>تخطي</ThemedText>
        </Pressable>

        <View style={styles.logoWrap}>
          <ThemedText style={styles.logoText}>OnWay</ThemedText>
        </View>

        <View style={{ width: 60 }} />
      </View>

      <View style={styles.expandedCenter}>
        <FlatList
          ref={flatListRef}
          data={SLIDES}
          renderItem={renderSlide}
          keyExtractor={(item) => item.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          bounces={false}
        />
      </View>

      <View style={styles.bottomSection}>
        <View style={styles.dotsRow}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === activeIndex ? styles.dotActive : undefined]}
            />
          ))}
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.ctaButton,
            pressed ? styles.ctaPressed : undefined,
          ]}
          onPress={handleNext}
          testID="button-get-started"
        >
          <ThemedText style={styles.ctaText}>
            {isLastSlide ? "ابدأ" : "التالي"}
          </ThemedText>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BRAND_ORANGE,
    paddingHorizontal: 24,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    paddingTop: 4,
  },
  skipBtn: {
    width: 60,
    alignItems: "center",
  },
  skipText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 14,
    color: "rgba(255,255,255,0.8)",
  },
  logoWrap: {
    paddingVertical: 6,
  },
  logoText: {
    fontFamily: "Montserrat_800ExtraBold",
    fontSize: 28,
    color: "#FFFFFF",
    letterSpacing: 1,
    writingDirection: "ltr",
    lineHeight: 38,
    includeFontPadding: true,
  },
  expandedCenter: {
    flex: 1,
    justifyContent: "center",
  },
  slideContainer: {
    width: SCREEN_WIDTH - 48,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
  },
  imageCircle: {
    width: IMAGE_SIZE + 36,
    height: IMAGE_SIZE + 36,
    borderRadius: (IMAGE_SIZE + 36) / 2,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  slideImage: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
  },
  slideTextWrap: {
    marginTop: 28,
    alignItems: "center",
    paddingHorizontal: 8,
    paddingTop: 6,
  },
  slideTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 22,
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 8,
    lineHeight: 38,
    includeFontPadding: true,
    paddingTop: 4,
  },
  slideSubtitle: {
    fontFamily: "Cairo_400Regular",
    fontSize: 15,
    color: "rgba(255,255,255,0.75)",
    textAlign: "center",
    lineHeight: 26,
    includeFontPadding: true,
  },
  bottomSection: {
    paddingBottom: 12,
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginBottom: 20,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.4)",
  },
  dotActive: {
    width: 16,
    borderRadius: 4,
    backgroundColor: "#FFFFFF",
  },
  ctaButton: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 6,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  ctaPressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.9,
  },
  ctaText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    color: BRAND_ORANGE,
  },
});
