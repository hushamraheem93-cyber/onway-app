import React, { useEffect } from "react";
import { View, StyleSheet, Dimensions } from "react-native";
import { Image } from "expo-image";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
  interpolate,
  SharedValue,
} from "react-native-reanimated";
import { ThemedText } from "@/components/ThemedText";
import { AppColors } from "@/constants/theme";

const { width: W } = Dimensions.get("window");

interface Props {
  image: any;
  title: string;
  subtitle?: string;
  imageSize: number;
  scrollX: SharedValue<number>;
  slideIndex: number;
}

export default function OnboardingSlide({
  image,
  title,
  subtitle,
  imageSize,
  scrollX,
  slideIndex,
}: Props) {
  const floatY   = useSharedValue(0);
  const pulse    = useSharedValue(1);
  const opacity  = useSharedValue(0);
  const scale    = useSharedValue(0.85);
  const transY   = useSharedValue(30);

  useEffect(() => {
    // Floating image
    floatY.value = withRepeat(
      withSequence(
        withTiming(-10, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
        withTiming(10,  { duration: 1600, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );

    // Pulse circle
    pulse.value = withDelay(
      200,
      withRepeat(
        withSequence(
          withTiming(1.08, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
          withTiming(1,    { duration: 1400, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      )
    );

    // Enter animation
    opacity.value = withTiming(1, { duration: 700 });
    scale.value   = withTiming(1, { duration: 700, easing: Easing.out(Easing.exp) });
    transY.value  = withTiming(0, { duration: 700, easing: Easing.out(Easing.exp) });
  }, []);

  const circleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  const imageStyle = useAnimatedStyle(() => {
    const parallaxX = interpolate(
      scrollX.value,
      [(slideIndex - 1) * W, slideIndex * W, (slideIndex + 1) * W],
      [W * 0.25, 0, -W * 0.25]
    );
    return {
      transform: [
        { translateX: parallaxX },
        { translateY: floatY.value },
      ],
    };
  });

  const contentStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { scale: scale.value },
      { translateY: transY.value },
    ],
  }));

  const circleDiameter = imageSize + 64;

  return (
    <View style={styles.container}>
      {/* Image + circle */}
      <Animated.View style={[styles.circleWrap, circleStyle, { width: circleDiameter, height: circleDiameter, borderRadius: circleDiameter / 2 }]}>
        <Animated.View style={imageStyle}>
          <Image source={image} style={{ width: imageSize, height: imageSize }} contentFit="contain" />
        </Animated.View>
      </Animated.View>

      {/* Text */}
      <Animated.View style={[styles.textWrap, contentStyle]}>
        <ThemedText style={styles.title}>{title}</ThemedText>
        {subtitle ? (
          <ThemedText style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </ThemedText>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: W,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingVertical: 12,
  },
  circleWrap: {
    backgroundColor: "rgba(255,255,255,0.13)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 36,
  },
  textWrap: {
    alignItems: "center",
  },
  title: {
    fontFamily: "Cairo_700Bold",
    fontSize: 36,
    color: AppColors.white,
    textAlign: "center",
    lineHeight: 54,
    includeFontPadding: false,
    marginBottom: 10,
  },
  subtitle: {
    fontFamily: "Cairo_400Regular",
    fontSize: 16,
    color: "rgba(255,255,255,0.92)",
    textAlign: "center",
    lineHeight: 28,
    includeFontPadding: false,
  },
});
