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
  Easing,
  interpolateColor,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";

const ICON_COLOR = "#D94523";
const INACTIVE_COLOR = "#AAAAAA";

interface TabConfig {
  name: string;
  icon: keyof typeof Feather.glyphMap;
  label: string;
  initialScreen: string;
}

const TABS: TabConfig[] = [
  { name: "ProfileTab", icon: "user", label: "الحساب", initialScreen: "Profile" },
  { name: "FavoritesTab", icon: "heart", label: "المفضلة", initialScreen: "Favorites" },
  { name: "HomeTab", icon: "home", label: "الرئيسية", initialScreen: "Home" },
  { name: "SearchTab", icon: "search", label: "البحث", initialScreen: "Search" },
  { name: "OrdersTab", icon: "shopping-bag", label: "طلباتي", initialScreen: "Orders" },
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

  useEffect(() => {
    if (isFocused) {
      progress.value = withSpring(1, SPRING_CONFIG);
      iconBounce.value = withSequence(
        withTiming(1.2, { duration: 150 }),
        withSpring(1, { damping: 10, stiffness: 200 })
      );
    } else {
      progress.value = withTiming(0, { duration: 250, easing: Easing.out(Easing.ease) });
      iconBounce.value = withSpring(1, { damping: 12 });
    }
  }, [isFocused]);

  const pillStyle = useAnimatedStyle(() => {
    const bg = interpolateColor(
      progress.value,
      [0, 1],
      ["rgba(217,69,35,0)", "rgba(217,69,35,1)"]
    );
    return {
      backgroundColor: bg,
    };
  });

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconBounce.value }],
  }));

  return (
    <Pressable onPress={onPress} style={styles.tabItem} testID={`tab-${config.name}`}>
      <Animated.View style={[styles.pill, pillStyle]}>
        <Animated.View style={iconStyle}>
          <Feather
            name={config.icon}
            size={21}
            color={isFocused ? "#FFFFFF" : INACTIVE_COLOR}
          />
        </Animated.View>
        <ThemedText
          style={[
            styles.label,
            { color: isFocused ? "#FFFFFF" : INACTIVE_COLOR },
          ]}
          numberOfLines={1}
        >
          {config.label}
        </ThemedText>
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
          paddingBottom: Math.max(insets.bottom, 4),
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
    borderTopWidth: 0,
    backgroundColor: "#FFFFFF",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
      default: {
        boxShadow: "0 -2px 8px rgba(0,0,0,0.05)",
      },
    }),
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-evenly",
    paddingHorizontal: 4,
    height: 66,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  pill: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 18,
    minWidth: 50,
    gap: 3,
  },
  label: {
    fontSize: 10,
    fontFamily: "Cairo_700Bold",
    fontWeight: "700",
  },
});
