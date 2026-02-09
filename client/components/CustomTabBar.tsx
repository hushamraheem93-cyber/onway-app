import React from "react";
import { View, Pressable, StyleSheet, Platform } from "react-native";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { AppColors } from "@/constants/theme";

const TAB_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  ProfileTab: "user",
  FavoritesTab: "heart",
  HomeTab: "home",
  SearchTab: "search",
  MenuTab: "grid",
};

export function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();

  const visibleRoutes = state.routes.filter(
    (route) => route.name !== "CartTab"
  );

  const homeIndex = visibleRoutes.findIndex((r) => r.name === "HomeTab");
  const reorderedRoutes = [
    ...visibleRoutes.filter((_, i) => i > homeIndex),
    ...visibleRoutes.filter((_, i) => i === homeIndex),
    ...visibleRoutes.filter((_, i) => i < homeIndex),
  ].reverse();

  return (
    <View
      style={[
        styles.tabContainer,
        {
          backgroundColor: isDark ? theme.backgroundDefault : "#FFFFFF",
          paddingBottom: insets.bottom > 0 ? insets.bottom : 10,
        },
      ]}
    >
      {reorderedRoutes.map((route) => {
        const realIndex = state.routes.findIndex((r) => r.key === route.key);
        const { options } = descriptors[route.key];
        const isFocused = state.index === realIndex;
        const isHome = route.name === "HomeTab";

        const onPress = () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        if (isHome) {
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              style={styles.mainButtonContainer}
            >
              <View style={styles.mainButton}>
                <Feather name="home" size={28} color="#000000" />
              </View>
            </Pressable>
          );
        }

        const iconName = TAB_ICONS[route.name] || "circle";

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            style={styles.tabItem}
          >
            <Feather
              name={iconName}
              size={24}
              color={isFocused ? AppColors.onGrey : "#8E8E93"}
            />
            {isFocused ? <View style={styles.activeDot} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabContainer: {
    flexDirection: "row",
    height: 70,
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 20,
    position: "absolute",
    bottom: 0,
    width: "100%",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 10,
  },
  tabItem: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    paddingTop: 10,
  },
  mainButtonContainer: {
    top: -25,
    justifyContent: "center",
    alignItems: "center",
  },
  mainButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: AppColors.wayYellow,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: AppColors.wayYellow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 5,
    elevation: 10,
    borderWidth: 4,
    borderColor: "#FFFFFF",
  },
  activeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: AppColors.wayYellow,
    marginTop: 4,
  },
});
