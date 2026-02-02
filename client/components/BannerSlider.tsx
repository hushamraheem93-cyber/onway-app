import React, { useRef, useEffect, useState } from "react";
import { StyleSheet, View, Dimensions, Pressable, ScrollView, Platform } from "react-native";
import { Image } from "expo-image";

import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, AppColors } from "@/constants/theme";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const BANNER_WIDTH = SCREEN_WIDTH - Spacing.lg * 2;
const BANNER_HEIGHT = BANNER_WIDTH * 0.5;

const banners = [
  require("../../assets/images/banner-1.png"),
  require("../../assets/images/banner-2.png"),
];

export function BannerSlider() {
  const { theme } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const [currentPage, setCurrentPage] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      const nextPage = (currentPage + 1) % banners.length;
      scrollRef.current?.scrollTo({
        x: nextPage * BANNER_WIDTH,
        animated: true,
      });
      setCurrentPage(nextPage);
    }, 4000);

    return () => clearInterval(interval);
  }, [currentPage]);

  const handleScroll = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const page = Math.round(offsetX / BANNER_WIDTH);
    if (page !== currentPage && page >= 0 && page < banners.length) {
      setCurrentPage(page);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {banners.map((banner, index) => (
          <View key={index} style={styles.page}>
            <Image
              source={banner}
              style={styles.banner}
              contentFit="cover"
              transition={300}
            />
          </View>
        ))}
      </ScrollView>
      <View style={styles.pagination}>
        {banners.map((_, index) => (
          <View
            key={index}
            style={[
              styles.dot,
              {
                backgroundColor:
                  index === currentPage ? AppColors.primary : theme.border,
                width: index === currentPage ? 24 : 8,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.xl,
  },
  scrollView: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  scrollContent: {
    flexDirection: "row",
  },
  page: {
    width: BANNER_WIDTH,
    height: BANNER_HEIGHT,
  },
  banner: {
    width: "100%",
    height: "100%",
    borderRadius: BorderRadius.lg,
  },
  pagination: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: Spacing.md,
    gap: Spacing.xs,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
});
