import React, { useEffect } from "react";
import { View, Pressable, StyleSheet, Platform } from "react-native";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  withDelay,
  Easing,
  interpolateColor,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";

const ICON_COLOR = "#F37335";

interface TabConfig {
  name: string;
  icon: keyof typeof Feather.glyphMap;
  label: string;
  initialScreen: string;
}

const TABS: TabConfig[] = [
  { name: "HomeTab", icon: "home", label: "الرئيسية", initialScreen: "Home" },
  { name: "SearchTab", icon: "search", label: "البحث", initialScreen: "Search" },
  { name: "FavoritesTab", icon: "heart", label: "المفضلة", initialScreen: "Favorites" },
  { name: "ProfileTab", icon: "user", label: "الحساب", initialScreen: "Profile" },
];

const SPRING_CONFIG = {
  damping: 15,
  stiffness: 150,
  mass: 0.8,
};

function TabItem({
  config,
  isFocused,
  onPress,
}: {
  config: TabConfig;
  isFocused: boolean;
  onPress: () => void;
}) {
  const progress = useSharedValue(isFocused ? 1 : 0);
  const iconBounce = useSharedValue(1);
  const textSlide = useSharedValue(isFocused ? 1 : 0);

  useEffect(() => {
    if (isFocused) {
      progress.value = withSpring(1, SPRING_CONFIG);
      iconBounce.value = withSequence(
        withTiming(1.25, { duration: 150 }),
        withSpring(1, { damping: 10, stiffness: 200 })
      );
      textSlide.value = withDelay(100, withSpring(1, { damping: 14, stiffness: 120 }));
    } else {
      textSlide.value = withTiming(0, { duration: 150, easing: Easing.ease });
      progress.value = withTiming(0, { duration: 250, easing: Easing.ease });
      iconBounce.value = withSpring(1, { damping: 12 });
    }
  }, [isFocused]);

  const pillStyle = useAnimatedStyle(() => {
    const bg = interpolateColor(
      progress.value,
      [0, 1],
      ["rgba(243,115,53,0)", "rgba(243,115,53,1)"]
    );
    return {
      backgroundColor: bg,
      paddingHorizontal: 12 + progress.value * 10,
    };
  });

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconBounce.value }],
  }));

  const textStyle = useAnimatedStyle(() => ({
    opacity: textSlide.value,
    maxWidth: textSlide.value * 80,
    marginRight: textSlide.value * 8,
    transform: [{ translateX: (1 - textSlide.value) * -15 }],
  }));

  return (
    <Pressable onPress={onPress} style={styles.tabItem} testID={`tab-${config.name}`}>
      <Animated.View style={[styles.pill, pillStyle]}>
        <Animated.View style={iconStyle}>
          <Feather
            name={config.icon}
            size={22}
            color={isFocused ? "#FFFFFF" : ICON_COLOR}
          />
        </Animated.View>
        <Animated.View style={[styles.textWrap, textStyle]}>
          <ThemedText style={styles.label} numberOfLines={1}>
            {config.label}
          </ThemedText>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

export function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: isDark ? theme.backgroundDefault : "#FFFFFF",
          paddingBottom: Math.max(insets.bottom, 8),
          borderTopColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
        },
      ]}
    >
      <View style={styles.row}>
        {TABS.map((tabConfig) => {
          const routeIndex = state.routes.findIndex((r) => r.name === tabConfig.name);
          if (routeIndex === -1) return null;
          const isFocused = state.index === routeIndex;

          const onPress = () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            const route = state.routes[routeIndex];
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!event.defaultPrevented) {
              navigation.navigate(tabConfig.name, { screen: tabConfig.initialScreen });
            }
          };

          return (
            <TabItem
              key={tabConfig.name}
              config={tabConfig}
              isFocused={isFocused}
              onPress={onPress}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.1,
        shadowRadius: 16,
      },
      android: {
        elevation: 20,
      },
      default: {
        boxShadow: "0 -4px 16px rgba(0,0,0,0.1)",
      },
    }),
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    height: 62,
    gap: 6,
  },
  tabItem: {
    alignItems: "center",
    justifyContent: "center",
  },
  pill: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 25,
    minHeight: 44,
  },
  textWrap: {
    overflow: "hidden",
  },
  label: {
    fontSize: 13,
    fontFamily: "Cairo_700Bold",
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
