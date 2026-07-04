import React from "react";
import { View, StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { AppColors, Anim} from "@/constants/theme";

interface Props {
  count: number;
  activeIndex: number;
}

function Dot({ isActive }: { isActive: boolean }) {
  const animStyle = useAnimatedStyle(() => ({
    width: withTiming(isActive ? 30 : 8, { duration: Anim.duration.normal }),
    opacity: withTiming(isActive ? 1 : 0.4, { duration: Anim.duration.normal }),
  }));

  return <Animated.View style={[styles.dot, animStyle]} />;
}

export default function PageIndicator({ count, activeIndex }: Props) {
  return (
    <View style={styles.row}>
      {Array.from({ length: count }).map((_, i) => (
        <Dot key={i} isActive={i === activeIndex} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 20,
  },
  dot: {
    height: 8,
    borderRadius: 4,
    backgroundColor: AppColors.white,
  },
});
