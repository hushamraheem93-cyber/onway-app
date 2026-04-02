import React, { useState, useEffect, useRef, memo } from "react";
import { View, StyleSheet, Animated } from "react-native";
import { Image, ImageContentFit, ImageStyle } from "expo-image";
import { resolveImageUrl } from "@/utils/imageUtils";

const BLURHASH = "L6PZfSi_.AyE_3t7t7R**0o#DgR4";

interface OptimizedImageProps {
  source: string | { uri: string };
  style?: ImageStyle;
  width?: number | string;
  height?: number | string;
  contentFit?: ImageContentFit;
  priority?: "low" | "normal" | "high";
  recyclingKey?: string;
  quality?: number;
  borderRadius?: number;
}

function ShimmerSkeleton({ width, height, borderRadius }: { width?: number | string; height?: number | string; borderRadius?: number }) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.85] });

  return (
    <Animated.View
      style={[
        styles.skeleton,
        { width: width as any, height: height as any, borderRadius: borderRadius ?? 8, opacity },
      ]}
    />
  );
}

function OptimizedImageComponent({
  source,
  style,
  width,
  height,
  contentFit = "cover",
  priority = "normal",
  recyclingKey,
  quality = 80,
  borderRadius,
}: OptimizedImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  const rawUri = typeof source === "string" ? source : source?.uri ?? "";
  const uri = resolveImageUrl(rawUri, quality);

  if (hasError || !uri) {
    return (
      <View
        style={[
          styles.errorContainer,
          { width: width as any, height: height as any, borderRadius: borderRadius ?? 8 },
          style as any,
        ]}
      />
    );
  }

  return (
    <View style={[{ width: width as any, height: height as any }, style as any]}>
      {!isLoaded ? (
        <View style={StyleSheet.absoluteFill}>
          <ShimmerSkeleton width="100%" height="100%" borderRadius={borderRadius} />
        </View>
      ) : null}
      <Image
        source={{ uri }}
        style={[StyleSheet.absoluteFill, borderRadius !== undefined ? { borderRadius } : null]}
        contentFit={contentFit}
        placeholder={BLURHASH}
        placeholderContentFit="cover"
        transition={isLoaded ? 0 : 180}
        cachePolicy="disk"
        priority={priority}
        recyclingKey={recyclingKey || uri}
        allowDownscaling
        onLoad={() => setIsLoaded(true)}
        onError={() => setHasError(true)}
      />
    </View>
  );
}

export const OptimizedImage = memo(OptimizedImageComponent);

const styles = StyleSheet.create({
  skeleton: {
    flex: 1,
    backgroundColor: "#E8E8E8",
  },
  errorContainer: {
    backgroundColor: "#F0F0F0",
  },
});
