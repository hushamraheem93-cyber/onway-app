import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { createBottomTabNavigator, BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import VendorRatingsScreen from "@/screens/VendorRatingsScreen";
import VendorProductsScreen from "@/screens/VendorProductsScreen";
import VendorAddProductScreen from "@/screens/VendorAddProductScreen";
import VendorEditProductScreen from "@/screens/VendorEditProductScreen";
import VendorWalletScreen from "@/screens/VendorWalletScreen";
import VendorOrdersScreen from "@/screens/VendorOrdersScreen";
import VendorProfileScreen from "@/screens/VendorProfileScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { VendorNotificationsProvider, useVendorNotifications } from "@/context/VendorNotificationsContext";
import { ThemedText } from "@/components/ThemedText";
import { AppColors } from "@/constants/theme";

// Streamlined vendor navigation: the six-tab layout (Home / Orders / Products /
// Earnings / Ratings / Account) was slow and scattered — store settings lived in
// BOTH Home and Account, and the vendor's core daily task (Orders) was just one
// tab of six. This collapses it to four: Orders is the default landing (the
// workspace), and Ratings + settings live under a single Account hub. No screen
// navigates to "VendorHome"/"VendorRatingsTab" by name, so nothing breaks.
export type VendorTabParamList = {
  VendorOrdersTab: undefined;
  VendorProductsTab: undefined;
  VendorWalletTab: undefined;
  VendorAccountTab: undefined;
};

const Tab = createBottomTabNavigator<VendorTabParamList>();
const ProductStack = createNativeStackNavigator();
const AccountStack = createNativeStackNavigator();

const TAB_CONFIG: Record<string, { icon: keyof typeof Feather.glyphMap; label: string }> = {
  VendorOrdersTab:   { icon: "shopping-bag", label: "الطلبات"  },
  VendorProductsTab: { icon: "box",          label: "المنتجات" },
  VendorWalletTab:   { icon: "bar-chart-2",  label: "الأرباح"  },
  VendorAccountTab:  { icon: "user",         label: "الحساب"   },
};

function ProductsStackNavigator() {
  const screenOptions = useScreenOptions();
  return (
    <ProductStack.Navigator screenOptions={{ ...screenOptions, headerTintColor: AppColors.vendorPurple }}>
      <ProductStack.Screen name="VendorProducts" component={VendorProductsScreen} options={{ headerTitle: "منتجاتي" }} />
      <ProductStack.Screen name="VendorAddProduct" component={VendorAddProductScreen} options={{ headerTitle: "إضافة منتج" }} />
      <ProductStack.Screen name="VendorEditProduct" component={VendorEditProductScreen} options={{ headerTitle: "تعديل المنتج" }} />
    </ProductStack.Navigator>
  );
}

// Account hub: the profile/settings screen is the landing, and Ratings — no longer
// its own tab — is reached from a row inside it.
function AccountStackNavigator() {
  const screenOptions = useScreenOptions();
  return (
    <AccountStack.Navigator screenOptions={{ ...screenOptions, headerTintColor: AppColors.vendorPurple }}>
      <AccountStack.Screen name="VendorProfile" component={VendorProfileScreen} options={{ headerTitle: "الحساب" }} />
      <AccountStack.Screen name="VendorRatings" component={VendorRatingsScreen} options={{ headerTitle: "التقييمات" }} />
    </AccountStack.Navigator>
  );
}

function VendorTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { unreadCount } = useVendorNotifications();

  return (
    <View style={[styles.tabBar, { paddingBottom: insets.bottom > 0 ? insets.bottom : 12 }]}>
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;
        const config = TAB_CONFIG[route.name];
        if (!config) return null;

        const isOrders = route.name === "VendorOrdersTab";

        const onPress = () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
        };

        return (
          <Pressable key={route.key} onPress={onPress} style={styles.tabItem}>
            <View style={[styles.iconWrap, isFocused && { backgroundColor: AppColors.vendorPurple + "15" }]}>
              <Feather name={config.icon} size={22} color={isFocused ? AppColors.vendorPurple : AppColors.gray400} />
              {isOrders && unreadCount > 0 ? (
                <View style={styles.badge}>
                  <ThemedText style={styles.badgeText}>{unreadCount > 9 ? "9+" : String(unreadCount)}</ThemedText>
                </View>
              ) : null}
            </View>
            <ThemedText style={[styles.tabLabel, { color: isFocused ? AppColors.vendorPurple : AppColors.gray400 }]}>
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
    headerTintColor: AppColors.vendorPurple,
    headerShadowVisible: screenOptions.headerShadowVisible,
    headerStyle: screenOptions.headerStyle as any,
  };
  return (
    <Tab.Navigator
      tabBar={(props) => <VendorTabBar {...props} />}
      screenOptions={tabScreenOptions}
    >
      <Tab.Screen name="VendorOrdersTab"     component={VendorOrdersScreen}      options={{ headerTitle: () => <Image source={require("../assets/images/onway-header-logo-transparent.png")} style={{ width: 130, height: 50 }} contentFit="contain" /> }} />
      <Tab.Screen name="VendorProductsTab"   component={ProductsStackNavigator}  options={{ headerShown: false }} />
      <Tab.Screen name="VendorWalletTab"     component={VendorWalletScreen}      options={{ headerTitle: "الأرباح" }} />
      <Tab.Screen name="VendorAccountTab"    component={AccountStackNavigator}   options={{ headerShown: false }} />
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
    backgroundColor: AppColors.white,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: AppColors.divider,
    paddingTop: 8,
    shadowColor: AppColors.shadowColor,
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
    position: "relative",
  },
  tabLabel: {
    fontSize: 11,
    fontFamily: "Cairo_700Bold",
  },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    backgroundColor: AppColors.error,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 3,
  },
  badgeText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 9,
    color: AppColors.white,
  },
});
