import React from "react";
import { View, Pressable, StyleSheet, Platform } from "react-native";
import { createBottomTabNavigator, BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import VendorHomeScreen from "@/screens/VendorHomeScreen";
import VendorProductsScreen from "@/screens/VendorProductsScreen";
import VendorAddProductScreen from "@/screens/VendorAddProductScreen";
import VendorEditProductScreen from "@/screens/VendorEditProductScreen";
import VendorWalletScreen from "@/screens/VendorWalletScreen";
import VendorOrdersScreen from "@/screens/VendorOrdersScreen";
import VendorNotificationsScreen from "@/screens/VendorNotificationsScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { VendorNotificationsProvider } from "@/context/VendorNotificationsContext";
import { ThemedText } from "@/components/ThemedText";

const PURPLE = "#673AB7";

export type VendorTabParamList = {
  VendorHome: undefined;
  VendorOrdersTab: undefined;
  VendorProductsTab: undefined;
  VendorWalletTab: undefined;
  VendorNotifications: undefined;
};

const Tab = createBottomTabNavigator<VendorTabParamList>();
const ProductStack = createNativeStackNavigator();

const TAB_CONFIG: Record<string, { icon: keyof typeof Feather.glyphMap; label: string }> = {
  VendorHome:        { icon: "home",         label: "الرئيسية" },
  VendorOrdersTab:   { icon: "shopping-bag", label: "الطلبات"  },
  VendorProductsTab: { icon: "box",          label: "المنتجات" },
  VendorWalletTab:   { icon: "credit-card",  label: "المحفظة"  },
};

function ProductsStackNavigator() {
  const screenOptions = useScreenOptions();
  return (
    <ProductStack.Navigator screenOptions={{ ...screenOptions, headerTintColor: PURPLE }}>
      <ProductStack.Screen name="VendorProducts" component={VendorProductsScreen} options={{ headerTitle: "منتجاتي" }} />
      <ProductStack.Screen name="VendorAddProduct" component={VendorAddProductScreen} options={{ headerTitle: "إضافة منتج" }} />
      <ProductStack.Screen name="VendorEditProduct" component={VendorEditProductScreen} options={{ headerTitle: "تعديل المنتج" }} />
    </ProductStack.Navigator>
  );
}

function VendorTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.tabBar, { paddingBottom: insets.bottom > 0 ? insets.bottom : 12 }]}>
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;
        const config = TAB_CONFIG[route.name];
        if (!config) return null;

        const onPress = () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
        };

        return (
          <Pressable key={route.key} onPress={onPress} style={styles.tabItem}>
            <View style={[styles.iconWrap, isFocused && { backgroundColor: PURPLE + "15" }]}>
              <Feather name={config.icon} size={22} color={isFocused ? PURPLE : "#9CA3AF"} />
            </View>
            <ThemedText style={[styles.tabLabel, { color: isFocused ? PURPLE : "#9CA3AF" }]}>
              {config.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

function VendorTabs() {
  const screenOptions = useScreenOptions();
  const tabScreenOptions = {
    headerTitleAlign: screenOptions.headerTitleAlign as "center" | "left",
    headerTransparent: screenOptions.headerTransparent,
    headerTintColor: PURPLE,
    headerShadowVisible: screenOptions.headerShadowVisible,
    headerStyle: screenOptions.headerStyle as any,
  };
  return (
    <Tab.Navigator
      tabBar={(props) => <VendorTabBar {...props} />}
      screenOptions={tabScreenOptions}
    >
      <Tab.Screen name="VendorHome"          component={VendorHomeScreen}        options={{ headerTitle: "لوحة التحكم" }} />
      <Tab.Screen name="VendorOrdersTab"     component={VendorOrdersScreen}      options={{ headerTitle: "الطلبات" }} />
      <Tab.Screen name="VendorProductsTab"   component={ProductsStackNavigator}  options={{ headerShown: false }} />
      <Tab.Screen name="VendorWalletTab"     component={VendorWalletScreen}      options={{ headerTitle: "المحفظة" }} />
      <Tab.Screen name="VendorNotifications" component={VendorNotificationsScreen} options={{ headerTitle: "الإشعارات" }} />
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
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
    paddingTop: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 12,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    gap: 3,
  },
  iconWrap: {
    width: 44,
    height: 34,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  tabLabel: {
    fontSize: 11,
    fontFamily: "Cairo_700Bold",
  },
});
