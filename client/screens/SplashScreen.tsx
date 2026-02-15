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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { ThemedText } from "@/components/ThemedText";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const BRAND_ORANGE = "#FF7622";
const BRAND_DARK = "#E5691E";

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

export default function SplashScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
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

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const handleNext = () => {
    if (activeIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: activeIndex + 1, animated: true });
    } else {
      navigation.navigate("PhoneLogin");
    }
  };

  const handleSkip = () => {
    navigation.navigate("PhoneLogin");
  };

  const renderSlide = ({ item }: { item: SlideData }) => (
    <View style={styles.slideContainer}>
      <View style={styles.imageSection}>
        <View style={styles.imageGlow} />
        <Image source={item.image} style={styles.slideImage} contentFit="contain" />
      </View>
    </View>
  );

  const isLastSlide = activeIndex === SLIDES.length - 1;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[BRAND_ORANGE, BRAND_DARK]}
        style={[styles.topGradient, { paddingTop: insets.top + 16 }]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <View style={styles.decorCircle1} />
        <View style={styles.decorCircle2} />

        <View style={styles.headerRow}>
          <Pressable onPress={handleSkip} style={styles.skipBtn} testID="button-skip">
            <ThemedText style={styles.skipText}>تخطي</ThemedText>
          </Pressable>

          <View style={styles.logoRow}>
            <ThemedText style={styles.logoOn}>On</ThemedText>
            <ThemedText style={styles.logoWay}>Way</ThemedText>
          </View>

          <View style={styles.skipBtn} />
        </View>

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
          style={styles.flatList}
        />
      </LinearGradient>

      <View style={[styles.bottomSection, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.handleBar} />

        <ThemedText style={styles.slideTitle}>
          {SLIDES[activeIndex].title}
        </ThemedText>
        <ThemedText style={styles.slideSubtitle}>
          {SLIDES[activeIndex].subtitle}
        </ThemedText>

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
          <LinearGradient
            colors={[BRAND_ORANGE, BRAND_DARK]}
            style={styles.ctaGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <ThemedText style={styles.ctaText}>
              {isLastSlide ? "ابدأ الآن" : "التالي"}
            </ThemedText>
            <View style={styles.ctaArrow}>
              <Feather name="arrow-left" size={18} color={BRAND_ORANGE} />
            </View>
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

const IMAGE_SIZE = SCREEN_WIDTH * 0.55;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  topGradient: {
    overflow: "hidden",
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
    paddingBottom: 8,
  },
  decorCircle1: {
    position: "absolute",
    top: -40,
    left: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  decorCircle2: {
    position: "absolute",
    bottom: 20,
    right: -30,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 8,
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
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  logoOn: {
    fontFamily: "Kanit_700Bold",
    fontSize: 28,
    color: "#FFFFFF",
    letterSpacing: 1,
  },
  logoWay: {
    fontFamily: "Kanit_700Bold",
    fontSize: 28,
    color: "rgba(255,255,255,0.65)",
    letterSpacing: 1,
  },
  flatList: {
    flexGrow: 0,
  },
  slideContainer: {
    width: SCREEN_WIDTH,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
  },
  imageSection: {
    alignItems: "center",
    justifyContent: "center",
  },
  imageGlow: {
    position: "absolute",
    width: IMAGE_SIZE * 0.85,
    height: IMAGE_SIZE * 0.85,
    borderRadius: IMAGE_SIZE * 0.42,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  slideImage: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
  },
  bottomSection: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 12,
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E5E5E5",
  },
  slideTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 22,
    color: "#2D2D2D",
    textAlign: "center",
  },
  slideSubtitle: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    color: "#999",
    textAlign: "center",
    lineHeight: 22,
  },
  dotsRow: {
    flexDirection: "row",
    gap: 8,
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
  ctaButton: {
    width: "100%",
    borderRadius: 16,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: BRAND_ORANGE,
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
      },
      android: { elevation: 6 },
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
    paddingVertical: 15,
    gap: 10,
  },
  ctaText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 17,
    color: "#FFFFFF",
  },
  ctaArrow: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
});
