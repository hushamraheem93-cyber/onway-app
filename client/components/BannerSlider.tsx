import React, { useRef, useEffect, useState } from "react";
import { StyleSheet, View, Dimensions, Pressable, ScrollView } from "react-native";
import { Image } from "expo-image";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { ThemedText } from "@/components/ThemedText";
import { Spacing, AppColors, DesignSystem } from "@/constants/theme";
import { Banner } from "@/constants/categories";
import { getApiUrl } from "@/lib/query-client";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface BannerSliderProps {
  banners: Banner[];
  autoPlayInterval?: number;
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const BANNER_WIDTH = SCREEN_WIDTH - DesignSystem.screenPadding * 2;
const BANNER_HEIGHT = DesignSystem.bannerHeight;
const BANNER_RADIUS = DesignSystem.bannerRadius;

export function BannerSlider({ banners, autoPlayInterval = 4000 }: BannerSliderProps) {
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const scrollRef = useRef<ScrollView>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (banners.length <= 1) return;

    const startAutoPlay = () => {
      intervalRef.current = setInterval(() => {
        setCurrentPage((prev) => {
          const nextPage = (prev + 1) % banners.length;
          scrollRef.current?.scrollTo({
            x: nextPage * BANNER_WIDTH,
            animated: true,
          });
          return nextPage;
        });
      }, autoPlayInterval);
    };

    startAutoPlay();

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [banners.length, autoPlayInterval]);

  const handleScroll = (event: { nativeEvent: { contentOffset: { x: number } } }) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const page = Math.round(offsetX / BANNER_WIDTH);
    if (page !== currentPage && page >= 0 && page < banners.length) {
      setCurrentPage(page);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = setInterval(() => {
          setCurrentPage((prev) => {
            const nextPage = (prev + 1) % banners.length;
            scrollRef.current?.scrollTo({
              x: nextPage * BANNER_WIDTH,
              animated: true,
            });
            return nextPage;
          });
        }, autoPlayInterval);
      }
    }
  };

  const getImageUrl = (image: string) => {
    if (!image) return "";
    if (image.startsWith("data:image/")) return image;
    if (image.startsWith("http")) return image;
    return `${getApiUrl()}${image}`;
  };

  const handleBannerPress = (banner: Banner) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (!banner.linkType || !banner.linkTarget) return;

    if (banner.linkType === "category") {
      navigation.navigate("Products", {
        categoryId: banner.linkTarget,
        categoryName: banner.title || "",
      });
    } else if (banner.linkType === "screen") {
      const target = banner.linkTarget as keyof RootStackParamList;
      (navigation.navigate as any)(target);
    }
  };

  if (banners.length === 0) return null;

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
        {banners.map((banner) => (
          <Pressable
            key={banner.id}
            style={styles.page}
            onPress={() => handleBannerPress(banner)}
          >
            <Image
              source={{ uri: getImageUrl(banner.image) }}
              style={styles.banner}
              contentFit="cover"
              transition={300}
            />
            {banner.title ? (
              <View style={styles.titleOverlay}>
                <ThemedText type="body" style={styles.bannerTitle}>
                  {banner.title}
                </ThemedText>
              </View>
            ) : null}
          </Pressable>
        ))}
      </ScrollView>
      {banners.length > 1 ? (
        <View style={styles.pagination}>
          {banners.map((_, index) => (
            <Pressable
              key={index}
              onPress={() => {
                scrollRef.current?.scrollTo({ x: index * BANNER_WIDTH, animated: true });
                setCurrentPage(index);
              }}
            >
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor: index === currentPage ? AppColors.primary : theme.border,
                    width: index === currentPage ? 20 : 8,
                  },
                ]}
              />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.lg,
  },
  scrollView: {
    borderRadius: BANNER_RADIUS,
    overflow: "hidden",
  },
  scrollContent: {
    flexDirection: "row",
  },
  page: {
    width: BANNER_WIDTH,
    height: BANNER_HEIGHT,
    position: "relative",
  },
  banner: {
    width: "100%",
    height: "100%",
    borderRadius: BANNER_RADIUS,
  },
  titleOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderBottomLeftRadius: BANNER_RADIUS,
    borderBottomRightRadius: BANNER_RADIUS,
  },
  bannerTitle: {
    color: "#FFFFFF",
    textAlign: "center",
  },
  pagination: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
});
