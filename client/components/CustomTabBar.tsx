import React, { useEffect } from "react";
import { View, Pressable, StyleSheet, Platform } from "react-native";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";

const ACTIVE_BG = "#F37335";
const ICON_COLOR = "#F37335";
const INACTIVE_COLOR = "#999999";

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

const ANIM_CONFIG = {
  duration: 400,
  easing: Easing.bezier(0.25, 0.1, 0.25, 1),
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
  const pillWidth = useSharedValue(isFocused ? 1 : 0);
  const textOpacity = useSharedValue(isFocused ? 1 : 0);
  const iconScale = useSharedValue(isFocused ? 1 : 0.9);

  useEffect(() => {
    pillWidth.value = withTiming(isFocused ? 1 : 0, ANIM_CONFIG);
    textOpacity.value = withTiming(isFocused ? 1 : 0, {
      duration: isFocused ? 350 : 150,
      easing: Easing.ease,
    });
    iconScale.value = withTiming(isFocused ? 1 : 0.9, { duration: 300 });
  }, [isFocused]);

  const pillStyle = useAnimatedStyle(() => ({
    backgroundColor: `rgba(243,115,53,${pillWidth.value})`,
    paddingHorizontal: pillWidth.value * 16 + 10,
    borderRadius: 25,
  }));

  const textStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
    maxWidth: textOpacity.value * 80,
    marginRight: textOpacity.value * 8,
  }));

  const iconAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }));

  return (
    <Pressable onPress={onPress} style={styles.tabItem} testID={`tab-${config.name}`}>
      <Animated.View style={[styles.pill, pillStyle]}>
        <Animated.View style={iconAnimStyle}>
          <Feather
            name={config.icon}
            size={22}
            color={isFocused ? "#FFFFFF" : ICON_COLOR}
          />
        </Animated.View>
        <Animated.View style={[styles.textWrap, textStyle]}>
          <ThemedText style={[styles.label, { color: "#FFFFFF" }]} numberOfLines={1}>
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
    justifyContent: "space-evenly",
    paddingHorizontal: 12,
    height: 62,
  },
  tabItem: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
  },
  pill: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    minHeight: 44,
  },
  textWrap: {
    overflow: "hidden",
  },
  label: {
    fontSize: 13,
    fontFamily: "Cairo_700Bold",
    fontWeight: "700",
  },
});
