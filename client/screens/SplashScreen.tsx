import React, { useRef, useState } from "react";
import {
  View,
  StyleSheet,
  Dimensions,
  Pressable,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import PagerView from "react-native-pager-view";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import OnboardingSlide from "@/components/OnboardingSlide";
import PageIndicator from "@/components/PageIndicator";
import PrimaryButton from "@/components/PrimaryButton";
import { useAuth } from "@/context/AuthContext";

const { width: W, height: H } = Dimensions.get("window");

const onboarding1 = require("../assets/images/onboarding-1.png");
const onboarding2 = require("../assets/images/onboarding-2.png");
const onboarding3 = require("../assets/images/onboarding-3.png");

type RootStackParamList = { PhoneLogin: undefined };

const SLIDES = [
  {
    id: "1",
    image: onboarding1,
    title: "توصيل سريع وموثوق",
    subtitle: "اطلب من مطاعم وأسواق الضلوعية\nووصل طلبك خلال دقائق.",
    imageSize: Math.round(W * 0.52),
  },
  {
    id: "2",
    image: onboarding2,
    title: "كلشي بمكان واحد",
    subtitle: "",
    imageSize: Math.round(W * 0.62),
  },
  {
    id: "3",
    image: onboarding3,
    title: "لحد باب بيتك",
    subtitle: "تتبع طلبك لحظة بلحظة\nحتى يوصل لباب بيتك.",
    imageSize: Math.round(W * 0.52),
  },
];

// Decorative pulsing circle in background
function BgCircle({ size, top, left, right, bottom, delay }: {
  size: number; top?: number; left?: number; right?: number; bottom?: number; delay: number;
}) {
  const s = useSharedValue(1);
  React.useEffect(() => {
    s.value = withRepeat(
      withSequence(
        withTiming(1.12, { duration: 2200 + delay, easing: Easing.inOut(Easing.ease) }),
        withTiming(1,    { duration: 2200 + delay, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));

  return (
    <Animated.View
      style={[
        styles.bgCircle,
        aStyle,
        { width: size, height: size, borderRadius: size / 2, top, left, right, bottom },
      ]}
    />
  );
}

export default function SplashScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { markSplashSeen } = useAuth();
  const pagerRef = useRef<PagerView>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollX = useSharedValue(0);

  const handlePageScroll = (e: any) => {
    const { position, offset } = e.nativeEvent;
    scrollX.value = (position + offset) * W;
  };

  const handleNext = () => {
    if (activeIndex < SLIDES.length - 1) {
      const next = activeIndex + 1;
      pagerRef.current?.setPage(next);
      setActiveIndex(next);
    } else {
      markSplashSeen();
      navigation.navigate("PhoneLogin");
    }
  };

  const handleSkip = () => {
    markSplashSeen();
    navigation.navigate("PhoneLogin");
  };

  const isLast = activeIndex === SLIDES.length - 1;

  return (
    <View style={styles.root}>
      {/* Gradient background */}
      <LinearGradient
        colors={["#F97316", "#EA580C"]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Decorative circles */}
      <BgCircle size={W * 0.85} top={-W * 0.28} right={-W * 0.28} delay={0} />
      <BgCircle size={W * 0.55} bottom={H * 0.12} left={-W * 0.18} delay={400} />
      <BgCircle size={W * 0.35} bottom={H * 0.35} right={-W * 0.08} delay={800} />

      <SafeAreaView style={styles.safe} edges={["top", "bottom", "left", "right"]}>

        {/* Header */}
        <View style={styles.header}>
          {/* Logo + tagline */}
          <View style={styles.logoBlock}>
            <ThemedText style={styles.logoText}>OnWay</ThemedText>
            <ThemedText style={styles.tagline}>من الضلوعية… إلى باب بيتك</ThemedText>
          </View>

          {/* Skip — top right */}
          <Pressable onPress={handleSkip} style={styles.skipBtn} testID="button-skip">
            <ThemedText style={styles.skipText}>تخطي</ThemedText>
          </Pressable>
        </View>

        {/* Slides */}
        <PagerView
          ref={pagerRef}
          style={styles.pager}
          initialPage={0}
          onPageSelected={(e) => setActiveIndex(e.nativeEvent.position)}
          onPageScroll={handlePageScroll}
          overdrag={false}
        >
          {SLIDES.map((slide, i) => (
            <View key={slide.id} style={styles.page}>
              <OnboardingSlide
                image={slide.image}
                title={slide.title}
                subtitle={slide.subtitle}
                imageSize={slide.imageSize}
                scrollX={scrollX}
                slideIndex={i}
              />
            </View>
          ))}
        </PagerView>

        {/* Bottom controls */}
        <View style={styles.bottom}>
          <PageIndicator count={SLIDES.length} activeIndex={activeIndex} />

          <PrimaryButton
            label={isLast ? "ابدأ الآن" : "التالي"}
            onPress={handleNext}
            testID="button-get-started"
            icon={
              isLast ? (
                <Feather name="arrow-left" size={18} color="#F97316" />
              ) : null
            }
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safe: {
    flex: 1,
    backgroundColor: "transparent",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 4,
    position: "relative",
  },
  logoBlock: {
    alignItems: "center",
  },
  logoText: {
    fontFamily: "Montserrat_800ExtraBold",
    fontSize: 30,
    color: "#FFFFFF",
    letterSpacing: 1.5,
    writingDirection: "ltr",
    includeFontPadding: false,
    lineHeight: 38,
  },
  tagline: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.75)",
    textAlign: "center",
    includeFontPadding: false,
    marginTop: 2,
  },
  skipBtn: {
    position: "absolute",
    right: 20,
    top: 6,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  skipText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 14,
    color: "rgba(255,255,255,0.8)",
  },
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
  },
  bottom: {
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  bgCircle: {
    position: "absolute",
    backgroundColor: "rgba(255,255,255,0.07)",
  },
});
