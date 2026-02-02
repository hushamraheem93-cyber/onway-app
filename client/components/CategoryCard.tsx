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
import { Spacing, BorderRadius, AppColors } from "@/constants/theme";
import { Category } from "@/constants/categories";

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

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        styles.card,
        { backgroundColor: theme.backgroundDefault },
        animatedStyle,
      ]}
    >
      <View style={styles.imageContainer}>
        {isLoading ? (
          <View style={[styles.imagePlaceholder, { backgroundColor: theme.backgroundSecondary }]}>
            <ActivityIndicator size="small" color={AppColors.primary} />
          </View>
        ) : null}
        <Image
          source={{ uri: category.image }}
          style={styles.image}
          contentFit="cover"
          transition={300}
          onLoadStart={() => setIsLoading(true)}
          onLoadEnd={() => setIsLoading(false)}
        />
      </View>
      <ThemedText 
        type={compact ? "small" : "body"} 
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
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    margin: Spacing.xs,
    padding: Spacing.sm,
    overflow: "hidden",
  },
  imageContainer: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    marginBottom: Spacing.sm,
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
  },
  name: {
    textAlign: "center",
    fontWeight: "600",
  },
});
