import React, { useState, useCallback, memo } from "react";
import { View, StyleSheet } from "react-native";
import { Image, ImageContentFit, ImageStyle } from "expo-image";

interface OptimizedImageProps {
  source: string | { uri: string };
  style?: ImageStyle;
  width?: number;
  height?: number;
  contentFit?: ImageContentFit;
  placeholder?: string;
  priority?: "low" | "normal" | "high";
  cachePolicy?: "memory" | "disk" | "memory-disk" | "none";
  recyclingKey?: string;
}

const blurhash = "L6PZfSi_.AyE_3t7t7R**0o#DgR4";

function OptimizedImageComponent({
  source,
  style,
  width,
  height,
  contentFit = "cover",
  placeholder,
  priority = "normal",
  cachePolicy = "memory-disk",
  recyclingKey,
}: OptimizedImageProps) {
  const [hasError, setHasError] = useState(false);

  const uri = typeof source === "string" ? source : source.uri;

  const handleError = useCallback(() => {
    setHasError(true);
  }, []);

  if (hasError) {
    return (
      <View style={[styles.placeholder, { width, height }]}>
        <View style={styles.errorIcon} />
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={[{ width, height }, style]}
      contentFit={contentFit}
      placeholder={placeholder || blurhash}
      placeholderContentFit="cover"
      transition={200}
      cachePolicy={cachePolicy}
      priority={priority}
      recyclingKey={recyclingKey}
      onError={handleError}
    />
  );
}

export const OptimizedImage = memo(OptimizedImageComponent);

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: "#f0f0f0",
    alignItems: "center",
    justifyContent: "center",
  },
  errorIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#ddd",
  },
});
