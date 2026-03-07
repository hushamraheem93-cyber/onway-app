import React from "react";
import { View, Pressable, StyleSheet, Platform } from "react-native";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";

const ACTIVE_COLOR = "#F37335";
const INACTIVE_COLOR = "#8E8E93";

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

function TabItem({
  config,
  isFocused,
  onPress,
}: {
  config: TabConfig;
  isFocused: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.tabItem}>
      <View style={styles.iconWrap}>
        <Feather
          name={config.icon}
          size={isFocused ? 24 : 22}
          color={isFocused ? ACTIVE_COLOR : INACTIVE_COLOR}
        />
      </View>
      {isFocused ? <View style={styles.activeDot} /> : null}
      <ThemedText
        style={[
          styles.label,
          {
            color: isFocused ? ACTIVE_COLOR : INACTIVE_COLOR,
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
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 8,
    height: 58,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingTop: 6,
  },
  iconWrap: {
    width: 40,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  activeDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: ACTIVE_COLOR,
    marginTop: -1,
  },
  label: {
    fontSize: 10,
    textAlign: "center",
  },
});
