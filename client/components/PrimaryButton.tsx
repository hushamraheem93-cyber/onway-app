import React from "react";
import { Pressable, StyleSheet, Platform, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
} from "react-native-reanimated";
import { ThemedText } from "@/components/ThemedText";

interface Props {
  label: string;
  onPress: () => void;
  testID?: string;
  icon?: React.ReactNode;
}

export default function PrimaryButton({ label, onPress, testID, icon }: Props) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withTiming(0.96, { duration: 100 });
  };
  const handlePressOut = () => {
    scale.value = withSequence(
      withTiming(1.02, { duration: 80 }),
      withTiming(1, { duration: 120 })
    );
  };

  return (
    <Animated.View style={[styles.shadow, animStyle]}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        testID={testID}
        style={styles.btn}
      >
        <ThemedText style={styles.label}>{label}</ThemedText>
        {icon ? <View style={styles.icon}>{icon}</View> : null}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shadow: {
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
  btn: {
    height: 58,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  label: {
    fontFamily: "Cairo_700Bold",
    fontSize: 17,
    color: "#F97316",
    includeFontPadding: false,
  },
  icon: {
    marginTop: 1,
  },
});
