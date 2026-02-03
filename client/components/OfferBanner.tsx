import React from "react";
import { StyleSheet, View, Pressable, Dimensions } from "react-native";
import { Image } from "expo-image";

import { ThemedText } from "@/components/ThemedText";
import { Spacing, BorderRadius, AppColors, DesignSystem } from "@/constants/theme";
import { Banner } from "@/constants/categories";
import { getApiUrl } from "@/lib/query-client";

interface OfferBannerProps {
  banner: Banner;
  onPress?: () => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const BANNER_WIDTH = SCREEN_WIDTH - DesignSystem.screenPadding * 2;
const BANNER_HEIGHT = DesignSystem.bannerHeight;
const BANNER_RADIUS = DesignSystem.bannerRadius;

export function OfferBanner({ banner, onPress }: OfferBannerProps) {
  const getImageUrl = (image: string) => {
    if (image.startsWith("http")) return image;
    return `${getApiUrl()}${image}`;
  };

  return (
    <Pressable onPress={onPress} style={styles.container}>
      <Image
        source={{ uri: getImageUrl(banner.image) }}
        style={styles.image}
        contentFit="cover"
        transition={300}
      />
      <View style={styles.overlay}>
        {banner.title ? (
          <ThemedText type="h3" style={styles.title}>
            {banner.title}
          </ThemedText>
        ) : null}
        <View style={styles.ctaButton}>
          <ThemedText type="body" style={styles.ctaText}>
            تسوق الآن
          </ThemedText>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: BANNER_WIDTH,
    height: BANNER_HEIGHT,
    borderRadius: BANNER_RADIUS,
    overflow: "hidden",
    marginBottom: Spacing.lg,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  overlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.4)",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    color: "#FFFFFF",
    flex: 1,
    marginLeft: Spacing.md,
  },
  ctaButton: {
    backgroundColor: AppColors.primary,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  ctaText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
});
