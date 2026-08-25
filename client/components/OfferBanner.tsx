import React from "react";
import { StyleSheet, View, Pressable, Dimensions } from "react-native";
import { Image } from "expo-image";

import { ThemedText } from "@/components/ThemedText";
import {
  Spacing,
  BorderRadius,
  AppColors,
  DesignSystem,
  FontWeight,
  bannerFrame,
} from "@/constants/theme";
import { Banner } from "@/constants/categories";
import { resolveImageUrl } from "@/utils/imageUtils";

interface OfferBannerProps {
  banner: Banner;
  onPress?: () => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");
// Same frame as BannerSlider, from the same function — the two sit in the same
// column and any divergence would show up as one banner wider than the other.
const { width: BANNER_WIDTH, height: BANNER_HEIGHT } = bannerFrame(SCREEN_WIDTH);
const BANNER_RADIUS = DesignSystem.bannerRadius;

export function OfferBanner({ banner, onPress }: OfferBannerProps) {
  return (
    <Pressable onPress={onPress} style={styles.container}>
      <Image
        source={{ uri: resolveImageUrl(banner.image) }}
        style={styles.image}
        contentFit="cover"
        cachePolicy="disk"
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
    // Centres the banner once bannerMaxWidth caps it below the content width.
    alignSelf: "center",
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
    color: AppColors.white,
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
    color: AppColors.white,
    fontWeight: FontWeight.semiBold,
  },
});
