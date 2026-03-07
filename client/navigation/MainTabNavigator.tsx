import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

import HomeStackNavigator from "@/navigation/HomeStackNavigator";
import SearchStackNavigator from "@/navigation/SearchStackNavigator";
import FavoritesStackNavigator from "@/navigation/FavoritesStackNavigator";
import CartStackNavigator from "@/navigation/CartStackNavigator";
import ProfileStackNavigator from "@/navigation/ProfileStackNavigator";
import { CustomTabBar } from "@/components/CustomTabBar";

export type MainTabParamList = {
  HomeTab: undefined;
  SearchTab: undefined;
  FavoritesTab: undefined;
  CartTab: undefined;
  ProfileTab: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

export default function MainTabNavigator() {
  return (
    <Tab.Navigator
      initialRouteName="HomeTab"
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tab.Screen name="HomeTab" component={HomeStackNavigator} />
      <Tab.Screen name="SearchTab" component={SearchStackNavigator} />
      <Tab.Screen name="FavoritesTab" component={FavoritesStackNavigator} />
      <Tab.Screen name="ProfileTab" component={ProfileStackNavigator} />
      <Tab.Screen
        name="CartTab"
        component={CartStackNavigator}
        options={{
          tabBarButton: () => null,
        }}
      />
    </Tab.Navigator>
  );
}
