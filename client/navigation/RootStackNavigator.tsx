import React from "react";
import { ActivityIndicator, View } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import MainTabNavigator from "@/navigation/MainTabNavigator";
import ProductsScreen from "@/screens/ProductsScreen";
import CheckoutScreen from "@/screens/CheckoutScreen";
import OrderConfirmationScreen from "@/screens/OrderConfirmationScreen";
import PhoneLoginScreen from "@/screens/PhoneLoginScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { useAuth } from "@/context/AuthContext";
import { AppColors } from "@/constants/theme";
import { Order } from "@/context/OrderContext";

export type RootStackParamList = {
  PhoneLogin: undefined;
  Main: undefined;
  Products: { categoryId?: string; categoryName: string; searchQuery?: string };
  Checkout: undefined;
  OrderConfirmation: { order: Order };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootStackNavigator() {
  const screenOptions = useScreenOptions();
  const { isLoggedIn, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: AppColors.primary }}>
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      {!isLoggedIn ? (
        <Stack.Screen
          name="PhoneLogin"
          component={PhoneLoginScreen}
          options={{ headerShown: false }}
        />
      ) : (
        <>
          <Stack.Screen
            name="Main"
            component={MainTabNavigator}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Products"
            component={ProductsScreen}
            options={({ route }) => ({
              headerTitle: route.params.categoryName,
            })}
          />
          <Stack.Screen
            name="Checkout"
            component={CheckoutScreen}
            options={{
              headerTitle: "تأكيد الطلب",
            }}
          />
          <Stack.Screen
            name="OrderConfirmation"
            component={OrderConfirmationScreen}
            options={{
              headerTitle: "تم الطلب",
              headerBackVisible: false,
            }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}
