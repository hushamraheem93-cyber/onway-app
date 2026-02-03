import React from "react";
import { View, StyleSheet } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Platform } from "react-native";

import HomeStackNavigator from "@/navigation/HomeStackNavigator";
import CategoriesStackNavigator from "@/navigation/CategoriesStackNavigator";
import CartStackNavigator from "@/navigation/CartStackNavigator";
import OrdersStackNavigator from "@/navigation/OrdersStackNavigator";
import ProfileStackNavigator from "@/navigation/ProfileStackNavigator";
import { useTheme } from "@/hooks/useTheme";
import { useCart } from "@/context/CartContext";
import { ThemedText } from "@/components/ThemedText";
import { AppColors, Spacing, BorderRadius } from "@/constants/theme";

export type MainTabParamList = {
  HomeTab: undefined;
  CategoriesTab: undefined;
  CartTab: undefined;
  OrdersTab: undefined;
  ProfileTab: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

function CartBadge() {
  const { getItemCount } = useCart();
  const count = getItemCount();

  if (count === 0) return null;

  return (
    <View style={styles.badge}>
      <ThemedText type="small" style={styles.badgeText}>
        {count > 9 ? "9+" : count}
      </ThemedText>
    </View>
  );
}

export default function MainTabNavigator() {
  const { theme, isDark } = useTheme();

  return (
    <Tab.Navigator
      initialRouteName="HomeTab"
      screenOptions={{
        tabBarActiveTintColor: "#FFFFFF",
        tabBarInactiveTintColor: "rgba(255,255,255,0.7)",
        tabBarStyle: {
          position: "absolute",
          backgroundColor: AppColors.primary,
          borderTopWidth: 0,
          elevation: 0,
          height: Platform.select({ ios: 88, android: 70 }),
          paddingBottom: Platform.select({ ios: 28, android: 10 }),
          paddingTop: 10,
        },
        tabBarBackground: () => null,
        headerShown: false,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "500",
        },
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeStackNavigator}
        options={{
          title: "الرئيسية",
          tabBarIcon: ({ color, size }) => (
            <Feather name="home" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="CategoriesTab"
        component={CategoriesStackNavigator}
        options={{
          title: "الأقسام",
          tabBarIcon: ({ color, size }) => (
            <Feather name="grid" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="CartTab"
        component={CartStackNavigator}
        options={{
          title: "السلة",
          tabBarIcon: ({ color, size }) => (
            <View>
              <Feather name="shopping-cart" size={size} color={color} />
              <CartBadge />
            </View>
          ),
        }}
      />
      <Tab.Screen
        name="OrdersTab"
        component={OrdersStackNavigator}
        options={{
          title: "الطلبات",
          tabBarIcon: ({ color, size }) => (
            <Feather name="package" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileStackNavigator}
        options={{
          title: "الحساب",
          tabBarIcon: ({ color, size }) => (
            <Feather name="user" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    top: -6,
    right: -10,
    backgroundColor: AppColors.primary,
    borderRadius: BorderRadius.full,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },
});
