import React, { useState } from "react";
import { StyleSheet, Pressable, View, ActivityIndicator } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, AppColors, DesignSystem, Shadows } from "@/constants/theme";
import { Category } from "@/constants/categories";
import { getApiUrl } from "@/lib/query-client";

interface CategoryCardProps {
  category: Category;
  onPress: () => void;
  compact?: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function CategoryCard({ category, onPress, compact = false }: CategoryCardProps) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);
  const [isLoading, setIsLoading] = useState(true);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.95, { damping: 15, stiffness: 150 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 150 });
  };

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  const getImageUrl = (image: string) => {
    if (image.startsWith("http")) return image;
    return `${getApiUrl()}${image}`;
  };

  const cardWidth = compact ? undefined : DesignSystem.categoryCard.width;
  const cardHeight = compact ? undefined : DesignSystem.categoryCard.height;
  const imageSize = compact ? 65 : DesignSystem.categoryImageSize;

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        styles.card,
        { 
          backgroundColor: theme.backgroundDefault,
          width: cardWidth,
          height: cardHeight,
        },
        Shadows.sm,
        animatedStyle,
      ]}
    >
      <View style={[styles.imageContainer, { width: imageSize, height: imageSize }]}>
        {isLoading ? (
          <View style={[styles.imagePlaceholder, { backgroundColor: theme.backgroundSecondary }]}>
            <ActivityIndicator size="small" color={AppColors.primary} />
          </View>
        ) : null}
        <Image
          source={{ uri: getImageUrl(category.image) }}
          style={styles.image}
          contentFit="contain"
          transition={300}
          onLoadStart={() => setIsLoading(true)}
          onLoadEnd={() => setIsLoading(false)}
        />
      </View>
      <ThemedText 
        type="body"
        style={styles.name}
        numberOfLines={2}
      >
        {category.name}
      </ThemedText>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: Spacing.sm,
  },
  imageContainer: {
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  imagePlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
    borderRadius: BorderRadius.sm,
  },
  name: {
    textAlign: "center",
    fontWeight: "700",
    fontSize: 13,
    color: AppColors.textPrimary,
  },
});
