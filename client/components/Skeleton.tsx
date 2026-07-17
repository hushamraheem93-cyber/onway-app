/**
 * Skeleton — a lightweight loading placeholder that pulses. Design-system primitive
 * that fills the documented gap (SkeletonStyles tokens existed but no component used
 * them). Purely additive: screens opt in; nothing existing changes.
 *
 * Usage:
 *   <Skeleton variant="title" width={160} />
 *   <Skeleton variant="avatar" width={48} height={48} />
 *   <Skeleton variant="card" />            // full-width card placeholder
 *   <SkeletonRow count={3} gap={12} />     // convenience for repeated rows
 */
import React, { useEffect, useRef } from "react";
import { Animated, View, StyleSheet, DimensionValue, ViewStyle } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { SkeletonStyles, Anim } from "@/constants/theme";

type SkeletonVariant = keyof typeof SkeletonStyles.variants;

interface SkeletonProps {
  variant?: SkeletonVariant;
  width?: DimensionValue;
  height?: DimensionValue;
  borderRadius?: number;
  style?: ViewStyle | ViewStyle[];
}

export function Skeleton({ variant = "text", width, height, borderRadius, style }: SkeletonProps) {
  const { theme } = useTheme();
  const pulse = useRef(new Animated.Value(0.4)).current;
  const v = SkeletonStyles.variants[variant] as { height?: number; borderRadius?: number };

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: Anim.duration.slow, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: Anim.duration.slow, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[
        {
          width: width ?? "100%",
          height: height ?? v.height ?? 14,
          borderRadius: borderRadius ?? v.borderRadius ?? 6,
          backgroundColor: theme.backgroundSecondary,
          opacity: pulse,
        },
        style as ViewStyle,
      ]}
    />
  );
}

interface SkeletonRowProps {
  count?: number;
  gap?: number;
  variant?: SkeletonVariant;
  style?: ViewStyle | ViewStyle[];
}

/** Convenience: a vertical stack of identical skeletons (e.g. a loading list). */
export function SkeletonRow({ count = 3, gap = 12, variant = "text", style }: SkeletonRowProps) {
  return (
    <View style={[styles.col, { gap }, style as ViewStyle]}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} variant={variant} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  col: { flexDirection: "column" },
});

export default Skeleton;
