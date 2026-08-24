import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Image } from "expo-image";
import {
  createBottomTabNavigator,
  BottomTabBarProps,
} from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import VendorHomeScreen from "@/screens/VendorHomeScreen";
import VendorAnalyticsScreen from "@/screens/VendorAnalyticsScreen";
import VendorProductsScreen from "@/screens/VendorProductsScreen";
import VendorAddProductScreen from "@/screens/VendorAddProductScreen";
import VendorEditProductScreen from "@/screens/VendorEditProductScreen";
import VendorOrdersScreen from "@/screens/VendorOrdersScreen";
import VendorProfileScreen from "@/screens/VendorProfileScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import {
  VendorNotificationsProvider,
  useVendorNotifications,
} from "@/context/VendorNotificationsContext";
import { ThemedText } from "@/components/ThemedText";
import { AppColors, FontFamily } from "@/constants/theme";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type VendorTabParamList = {
  VendorHome: undefined;
  VendorOrdersTab: undefined;
  VendorProductsTab: undefined;
  VendorAnalyticsTab: undefined;
  VendorProfileTab: undefined;
};

const Tab = createBottomTabNavigator<VendorTabParamList>();
const ProductStack = createNativeStackNavigator();

// ─── Tab config — 5 tabs as per spec ──────────────────────────────────────────

const TAB_CONFIG: Record<
  string,
  { icon: string; label: string; activeColor: string }
> = {
  VendorHome: {
    icon: "home-outline",
    label: "الرئيسية",
    activeColor: AppColors.primary,
  },
  VendorOrdersTab: {
    icon: "shopping-outline",
    label: "الطلبات",
    activeColor: AppColors.primary,
  },
  VendorProductsTab: {
    icon: "package-variant-closed",
    label: "المنتجات",
    activeColor: AppColors.primary,
  },
  VendorAnalyticsTab: {
    icon: "chart-bar",
    label: "الإحصائيات",
    activeColor: AppColors.primary,
  },
  VendorProfileTab: {
    icon: "account-outline",
    label: "الحساب",
    activeColor: AppColors.primary,
  },
};

// ─── Products stack ───────────────────────────────────────────────────────────

function ProductsStackNavigator() {
  const screenOptions = useScreenOptions();
  return (
    <ProductStack.Navigator
      screenOptions={{ ...screenOptions, headerTintColor: AppColors.primary }}
    >
      <ProductStack.Screen
        name="VendorProducts"
        component={VendorProductsScreen}
        options={{ headerTitle: "منتجاتي" }}
      />
      <ProductStack.Screen
        name="VendorAddProduct"
        component={VendorAddProductScreen}
        options={{ headerTitle: "إضافة منتج" }}
      />
      <ProductStack.Screen
        name="VendorEditProduct"
        component={VendorEditProductScreen}
        options={{ headerTitle: "تعديل المنتج" }}
      />
    </ProductStack.Navigator>
  );
}

// ─── Custom tab bar ───────────────────────────────────────────────────────────

function VendorTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { unreadCount } = useVendorNotifications();

  return (
    <View
      style={[
        styles.tabBar,
        { paddingBottom: insets.bottom > 0 ? insets.bottom : 12 },
      ]}
    >
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;
        const config = TAB_CONFIG[route.name];
        if (!config) return null;

        const isOrders = route.name === "VendorOrdersTab";
        const color = isFocused ? config.activeColor : AppColors.gray400;

        const onPress = () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });
          if (!isFocused && !event.defaultPrevented)
            navigation.navigate(route.name);
        };

        return (
          // H-63: the visible label already names this tab, so no accessibilityLabel
          // is added for it — except when the unread badge is showing, where the
          // reader would otherwise announce "الطلبات ٩+" and leave "9+ of what?"
          // unanswered. Role and selected state were missing outright: focus was
          // carried by colour and a background tint, neither of which is announced.
          <Pressable
            key={route.key}
            onPress={onPress}
            style={styles.tabItem}
            accessibilityRole="tab"
            accessibilityState={{ selected: isFocused }}
            accessibilityLabel={
              isOrders && unreadCount > 0
                ? `${config.label}، ${unreadCount} طلب غير مقروء`
                : undefined
            }
          >
            <View
              style={[
                styles.iconWrap,
                isFocused && { backgroundColor: AppColors.primary + "15" },
              ]}
            >
              <MaterialCommunityIcons
                name={config.icon as any}
                size={22}
                color={color}
              />
              {isOrders && unreadCount > 0 && (
                <View style={styles.badge}>
                  <ThemedText style={styles.badgeText}>
                    {unreadCount > 9 ? "9+" : String(unreadCount)}
                  </ThemedText>
                </View>
              )}
            </View>
            <ThemedText style={[styles.tabLabel, { color }]}>
              {config.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Tab navigator ────────────────────────────────────────────────────────────

function VendorTabs() {
  const screenOptions = useScreenOptions();
  const tabScreenOptions = {
    headerTitleAlign: screenOptions.headerTitleAlign as "center" | "left",
    headerTransparent: screenOptions.headerTransparent,
    headerTintColor: AppColors.primary,
    headerShadowVisible: screenOptions.headerShadowVisible,
    headerStyle: screenOptions.headerStyle as any,
  };
  return (
    <Tab.Navigator
      tabBar={(props) => <VendorTabBar {...props} />}
      screenOptions={tabScreenOptions}
    >
      <Tab.Screen
        name="VendorHome"
        component={VendorHomeScreen}
        options={{
          headerTitle: () => (
            <Image
              source={require("../assets/images/onway-header-logo-transparent.png")}
              style={{ width: 130, height: 50 }}
              contentFit="contain"
            />
          ),
        }}
      />
      <Tab.Screen
        name="VendorOrdersTab"
        component={VendorOrdersScreen}
        options={{ headerTitle: "الطلبات" }}
      />
      <Tab.Screen
        name="VendorProductsTab"
        component={ProductsStackNavigator}
        options={{ headerShown: false }}
      />
      <Tab.Screen
        name="VendorAnalyticsTab"
        component={VendorAnalyticsScreen}
        options={{ headerTitle: "الإحصائيات والتقييمات" }}
      />
      <Tab.Screen
        name="VendorProfileTab"
        component={VendorProfileScreen}
        options={{ headerTitle: "الحساب" }}
      />
    </Tab.Navigator>
  );
}

// ─── Root export ──────────────────────────────────────────────────────────────

export default function VendorTabNavigator() {
  return (
    <VendorNotificationsProvider>
      <VendorTabs />
    </VendorNotificationsProvider>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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
    fontSize: 10,
    fontFamily: FontFamily.cairoBold,
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
    fontFamily: FontFamily.cairoBold,
    fontSize: 9,
    color: AppColors.white,
  },
});
