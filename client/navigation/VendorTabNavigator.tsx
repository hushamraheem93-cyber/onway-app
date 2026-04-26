import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Platform, View, StyleSheet } from "react-native";

import VendorHomeScreen from "@/screens/VendorHomeScreen";
import VendorProductsScreen from "@/screens/VendorProductsScreen";
import VendorAddProductScreen from "@/screens/VendorAddProductScreen";
import VendorEditProductScreen from "@/screens/VendorEditProductScreen";
import VendorNotificationsScreen from "@/screens/VendorNotificationsScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import {
  VendorNotificationsProvider,
  useVendorNotifications,
} from "@/context/VendorNotificationsContext";
import { ThemedText } from "@/components/ThemedText";

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
      <ProductStack.Screen
        name="VendorEditProduct"
        component={VendorEditProductScreen}
        options={{ headerTitle: "تعديل المنتج" }}
      />
    </ProductStack.Navigator>
  );
}

function NotificationsBadgeIcon({ color, size }: { color: string; size: number }) {
  const { unreadCount } = useVendorNotifications();
  return (
    <View>
      <MaterialCommunityIcons name="bell-outline" size={size} color={color} />
      {unreadCount > 0 ? (
        <View style={styles.badge}>
          <ThemedText style={styles.badgeText}>
            {unreadCount > 9 ? "9+" : String(unreadCount)}
          </ThemedText>
        </View>
      ) : null}
    </View>
  );
}

function VendorTabs() {
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
      <Tab.Screen
        name="VendorNotificationsTab"
        component={VendorNotificationsScreen}
        options={{
          headerTitle: "الإشعارات",
          tabBarLabel: "الإشعارات",
          tabBarIcon: ({ color, size }) => (
            <NotificationsBadgeIcon color={color} size={size} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export default function VendorTabNavigator() {
  return (
    <VendorNotificationsProvider>
      <VendorTabs />
    </VendorNotificationsProvider>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    top: -4,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#E86520",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 3,
  },
  badgeText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 9,
    color: "#fff",
    lineHeight: 14,
  },
});
