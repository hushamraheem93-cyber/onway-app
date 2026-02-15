import React, { useRef, useEffect } from "react";
import { View, Pressable, StyleSheet, Animated, Platform } from "react-native";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { AppColors } from "@/constants/theme";

const BRAND = "#FF7622";

interface TabConfig {
  name: string;
  icon: keyof typeof Feather.glyphMap;
  iconFocused: keyof typeof Feather.glyphMap;
  label: string;
  initialScreen: string;
}

const TABS: TabConfig[] = [
  { name: "SearchTab", icon: "search", iconFocused: "search", label: "البحث", initialScreen: "Search" },
  { name: "MenuTab", icon: "grid", iconFocused: "grid", label: "الأقسام", initialScreen: "Categories" },
  { name: "HomeTab", icon: "home", iconFocused: "home", label: "الرئيسية", initialScreen: "Home" },
  { name: "FavoritesTab", icon: "heart", iconFocused: "heart", label: "المفضلة", initialScreen: "Favorites" },
  { name: "ProfileTab", icon: "user", iconFocused: "user", label: "الحساب", initialScreen: "Profile" },
];

function TabItem({
  config,
  isFocused,
  onPress,
}: {
  config: TabConfig;
  isFocused: boolean;
  onPress: () => void;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const bgAnim = useRef(new Animated.Value(isFocused ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: isFocused ? 1.08 : 1,
        friction: 6,
        tension: 300,
        useNativeDriver: true,
      }),
      Animated.timing(bgAnim, {
        toValue: isFocused ? 1 : 0,
        duration: 200,
        useNativeDriver: false,
      }),
    ]).start();
  }, [isFocused]);

  const bgColor = bgAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["transparent", "rgba(255,118,34,0.12)"],
  });

  const isHome = config.name === "HomeTab";

  if (isHome) {
    return (
      <Pressable onPress={onPress} style={styles.homeContainer}>
        <Animated.View
          style={[
            styles.homeButton,
            {
              transform: [{ scale: scaleAnim }],
              backgroundColor: isFocused ? BRAND : "#FF8C42",
            },
          ]}
        >
          <Feather name="home" size={26} color="#FFFFFF" />
        </Animated.View>
        <ThemedText
          style={[
            styles.label,
            { color: isFocused ? BRAND : "#8E8E93", fontFamily: "Cairo_600SemiBold" },
          ]}
        >
          {config.label}
        </ThemedText>
      </Pressable>
    );
  }

  return (
    <Pressable onPress={onPress} style={styles.tabItem}>
      <Animated.View
        style={[
          styles.iconWrap,
          { backgroundColor: bgColor, transform: [{ scale: scaleAnim }] },
        ]}
      >
        <Feather
          name={isFocused ? config.iconFocused : config.icon}
          size={22}
          color={isFocused ? BRAND : "#8E8E93"}
        />
      </Animated.View>
      <ThemedText
        style={[
          styles.label,
          {
            color: isFocused ? BRAND : "#8E8E93",
            fontFamily: isFocused ? "Cairo_700Bold" : "Cairo_400Regular",
          },
        ]}
      >
        {config.label}
      </ThemedText>
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
          paddingBottom: Math.max(insets.bottom, 6),
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
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: {
        elevation: 16,
      },
      default: {
        boxShadow: "0 -3px 12px rgba(0,0,0,0.08)",
      },
    }),
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-around",
    paddingHorizontal: 4,
    height: 62,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingTop: 8,
  },
  iconWrap: {
    width: 40,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  homeContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 4,
  },
  homeButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -22,
    ...Platform.select({
      ios: {
        shadowColor: "#FF7622",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
      },
      android: {
        elevation: 12,
      },
      default: {
        boxShadow: "0 4px 12px rgba(255,118,34,0.35)",
      },
    }),
  },
  label: {
    fontSize: 10,
    textAlign: "center",
  },
});
