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

const { width: SCREEN_WIDTH } = Dimensions.get("window");

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

  const viewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 50,
  }).current;

  const handleNext = () => {
    if (activeIndex < SLIDES.length - 1) {
      const nextIndex = activeIndex + 1;
      setActiveIndex(nextIndex);
      flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
    } else {
      navigation.navigate("PhoneLogin");
    }
  };

  const handleSkip = () => {
    navigation.navigate("PhoneLogin");
  };

  const renderSlide = ({ item }: { item: SlideData }) => (
    <View style={styles.slideContainer}>
      <View style={styles.imageCircle}>
        <Image source={item.image} style={styles.slideImage} contentFit="contain" />
      </View>
    </View>
  );

  const isLastSlide = activeIndex === SLIDES.length - 1;

  return (
    <LinearGradient
      colors={[BRAND_ORANGE, BRAND_DARK]}
      style={styles.container}
      start={{ x: 0, y: 0 }}
      end={{ x: 0.3, y: 1 }}
    >
      <View style={styles.decorCircle1} />
      <View style={styles.decorCircle2} />
      <View style={styles.decorCircle3} />

      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <Pressable onPress={handleSkip} style={styles.skipBtn} testID="button-skip">
          <ThemedText style={styles.skipText}>تخطي</ThemedText>
        </Pressable>

        <View style={styles.logoWrap}>
          <ThemedText style={styles.logoText}>OnWay</ThemedText>
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

      <View style={styles.textBlock}>
        <ThemedText style={styles.slideTitle}>
          {SLIDES[activeIndex].title}
        </ThemedText>
        <ThemedText style={styles.slideSubtitle}>
          {SLIDES[activeIndex].subtitle}
        </ThemedText>
      </View>

      <View style={styles.dotsRow}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === activeIndex ? styles.dotActive : undefined]}
          />
        ))}
      </View>

      <View style={[styles.buttonWrap, { paddingBottom: insets.bottom + 20 }]}>
        <Pressable
          style={({ pressed }) => [
            styles.ctaButton,
            pressed ? styles.ctaPressed : undefined,
          ]}
          onPress={handleNext}
          testID="button-get-started"
        >
          <ThemedText style={styles.ctaText}>
            {isLastSlide ? "ابدأ الآن" : "التالي"}
          </ThemedText>
          <View style={styles.ctaArrow}>
            <Feather name="arrow-left" size={18} color={BRAND_ORANGE} />
          </View>
        </Pressable>
      </View>
    </LinearGradient>
  );
}

const IMAGE_SIZE = SCREEN_WIDTH * 0.55;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: "hidden",
  },
  decorCircle1: {
    position: "absolute",
    top: -50,
    left: -50,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  decorCircle2: {
    position: "absolute",
    top: "40%",
    right: -40,
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  decorCircle3: {
    position: "absolute",
    bottom: 80,
    left: -60,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
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
    direction: "ltr",
  },
  logoText: {
    fontFamily: "Kanit_700Bold",
    fontSize: 28,
    color: "#FFFFFF",
    letterSpacing: 1,
    textAlign: "center",
  },
  flatList: {
    flexGrow: 0,
    marginTop: 4,
  },
  slideContainer: {
    width: SCREEN_WIDTH,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
  },
  imageCircle: {
    width: IMAGE_SIZE + 40,
    height: IMAGE_SIZE + 40,
    borderRadius: (IMAGE_SIZE + 40) / 2,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  slideImage: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
  },
  textBlock: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 30,
  },
  slideTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 24,
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 8,
  },
  slideSubtitle: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    color: "rgba(255,255,255,0.75)",
    textAlign: "center",
    lineHeight: 24,
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginBottom: 16,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  dotActive: {
    width: 24,
    borderRadius: 4,
    backgroundColor: "#FFFFFF",
  },
  buttonWrap: {
    paddingHorizontal: 24,
  },
  ctaButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingVertical: 15,
    gap: 10,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
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
  ctaText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 17,
    color: BRAND_ORANGE,
  },
  ctaArrow: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: BRAND_ORANGE,
    alignItems: "center",
    justifyContent: "center",
  },
});
