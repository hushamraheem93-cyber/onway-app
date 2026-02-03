import React from "react";
import { StyleSheet } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

import HomeStackNavigator from "@/navigation/HomeStackNavigator";
import OffersStackNavigator from "@/navigation/OffersStackNavigator";
import FavoritesStackNavigator from "@/navigation/FavoritesStackNavigator";
import CartStackNavigator from "@/navigation/CartStackNavigator";
import ProfileStackNavigator from "@/navigation/ProfileStackNavigator";
import CategoriesStackNavigator from "@/navigation/CategoriesStackNavigator";
import { CustomTabBar } from "@/components/CustomTabBar";

export type MainTabParamList = {
  HomeTab: undefined;
  OffersTab: undefined;
  FavoritesTab: undefined;
  CartTab: undefined;
  ProfileTab: undefined;
  MenuTab: undefined;
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
      <Tab.Screen name="ProfileTab" component={ProfileStackNavigator} />
      <Tab.Screen name="FavoritesTab" component={FavoritesStackNavigator} />
      <Tab.Screen name="HomeTab" component={HomeStackNavigator} />
      <Tab.Screen name="OffersTab" component={OffersStackNavigator} />
      <Tab.Screen name="MenuTab" component={CategoriesStackNavigator} />
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

const styles = StyleSheet.create({});
