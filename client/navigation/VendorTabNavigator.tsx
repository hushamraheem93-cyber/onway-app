import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Platform } from "react-native";

import VendorHomeScreen from "@/screens/VendorHomeScreen";
import VendorProductsScreen from "@/screens/VendorProductsScreen";
import VendorAddProductScreen from "@/screens/VendorAddProductScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

const Tab = createBottomTabNavigator();
const ProductStack = createNativeStackNavigator();

const PURPLE = "#673AB7";
const ACTIVE_TINT = PURPLE;
const INACTIVE_TINT = "#9CA3AF";

function ProductsStackNavigator() {
  const screenOptions = useScreenOptions();
  return (
    <ProductStack.Navigator
      screenOptions={{
        ...screenOptions,
        headerTintColor: PURPLE,
      }}
    >
      <ProductStack.Screen
        name="VendorProducts"
        component={VendorProductsScreen}
        options={{ headerTitle: "منتجاتي" }}
      />
      <ProductStack.Screen
        name="VendorAddProduct"
        component={VendorAddProductScreen}
        options={{ headerTitle: "إضافة منتج جديد" }}
      />
    </ProductStack.Navigator>
  );
}

export default function VendorTabNavigator() {
  const screenOptions = useScreenOptions();
  return (
    <Tab.Navigator
      screenOptions={{
        ...screenOptions,
        tabBarActiveTintColor: ACTIVE_TINT,
        tabBarInactiveTintColor: INACTIVE_TINT,
        tabBarStyle: {
          backgroundColor: "#fff",
          borderTopColor: "#F3F4F6",
          borderTopWidth: 1,
          paddingBottom: Platform.OS === "ios" ? 4 : 6,
          height: Platform.OS === "ios" ? 82 : 64,
        },
        tabBarLabelStyle: {
          fontFamily: "Cairo_700Bold",
          fontSize: 11,
        },
        headerTintColor: PURPLE,
      }}
    >
      <Tab.Screen
        name="VendorHome"
        component={VendorHomeScreen}
        options={{
          headerTitle: "لوحة التحكم",
          tabBarLabel: "الرئيسية",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="view-dashboard" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="VendorProductsTab"
        component={ProductsStackNavigator}
        options={{
          headerShown: false,
          tabBarLabel: "المنتجات",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="package-variant" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
