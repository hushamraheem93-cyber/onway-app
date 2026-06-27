import React from "react";
import { View, Pressable, StyleSheet, Platform } from "react-native";
import { createBottomTabNavigator, BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import DriverHomeScreen from "@/screens/DriverHomeScreen";
import DriverOrdersScreen from "@/screens/DriverOrdersScreen";
import DriverEarningsScreen from "@/screens/DriverEarningsScreen";
import DriverProfileScreen from "@/screens/DriverProfileScreen";
import { useTheme } from "@/hooks/useTheme";
import { AppColors } from "@/constants/theme";

export type DriverTabParamList = {
  DriverHomeTab: undefined;
  DriverOrdersTab: undefined;
  DriverEarningsTab: undefined;
  DriverProfileTab: undefined;
};

const TAB_CONFIG: Record<string, { icon: keyof typeof Feather.glyphMap; label: string }> = {
  DriverProfileTab: { icon: "user", label: "حسابي" },
  DriverEarningsTab: { icon: "dollar-sign", label: "الأرباح" },
  DriverHomeTab: { icon: "home", label: "الرئيسية" },
  DriverOrdersTab: { icon: "package", label: "الطلبات" },
};

function DriverTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();

  return (
    <View
      style={[
        styles.tabContainer,
        {
          backgroundColor: isDark ? theme.backgroundDefault : AppColors.white,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 10,
        },
      ]}
    >
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const isFocused = state.index === index;
        const config = TAB_CONFIG[route.name] || { icon: "circle", label: "" };
        const isHome = route.name === "DriverHomeTab";

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
            <Pressable key={route.key} onPress={onPress} style={styles.mainButtonContainer}>
              <View style={styles.mainButton}>
                <Feather name="home" size={28} color={AppColors.black} />
              </View>
            </Pressable>
          );
        }

        return (
          <Pressable key={route.key} onPress={onPress} style={styles.tabItem}>
            <Feather
              name={config.icon}
              size={24}
              color={isFocused ? AppColors.onGrey : AppColors.gray400}
            />
            {isFocused ? <View style={styles.activeDot} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const Tab = createBottomTabNavigator<DriverTabParamList>();

export default function DriverTabNavigator() {
  return (
    <Tab.Navigator
      initialRouteName="DriverHomeTab"
      tabBar={(props) => <DriverTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="DriverProfileTab" component={DriverProfileScreen} />
      <Tab.Screen name="DriverEarningsTab" component={DriverEarningsScreen} />
      <Tab.Screen name="DriverHomeTab" component={DriverHomeScreen} />
      <Tab.Screen name="DriverOrdersTab" component={DriverOrdersScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabContainer: {
    flexDirection: "row",
    height: 70,
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    shadowColor: AppColors.shadowColor,
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
    backgroundColor: AppColors.primary,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: AppColors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 5,
    elevation: 10,
    borderWidth: 4,
    borderColor: AppColors.white,
  },
  activeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: AppColors.primary,
    marginTop: 4,
  },
});
