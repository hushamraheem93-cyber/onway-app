import React from "react";
import { ActivityIndicator, View } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import MainTabNavigator from "@/navigation/MainTabNavigator";
import DriverTabNavigator from "@/navigation/DriverTabNavigator";
import ProductsScreen from "@/screens/ProductsScreen";
import CheckoutScreen from "@/screens/CheckoutScreen";
import OrderConfirmationScreen from "@/screens/OrderConfirmationScreen";
import OrderTrackingScreen from "@/screens/OrderTrackingScreen";
import PhoneLoginScreen from "@/screens/PhoneLoginScreen";
import SplashScreen from "@/screens/SplashScreen";
import OtpVerificationScreen from "@/screens/OtpVerificationScreen";
import UserTypeScreen from "@/screens/UserTypeScreen";
import DriverRegistrationScreen from "@/screens/DriverRegistrationScreen";
import DriverOrderDetailScreen from "@/screens/DriverOrderDetailScreen";
import DriverBatchScreen from "@/screens/DriverBatchScreen";
import ProfileCompletionScreen from "@/screens/ProfileCompletionScreen";
import CategoriesScreen from "@/screens/CategoriesScreen";
import AdminScreen from "@/screens/AdminScreen";
import MapPickerScreen from "@/screens/MapPickerScreen";
import CourierPickupScreen from "@/screens/CourierPickupScreen";
import InternationalShoppingScreen from "@/screens/InternationalShoppingScreen";
import SupportChatScreen from "@/screens/SupportChatScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { useAuth } from "@/context/AuthContext";
import { AppColors } from "@/constants/theme";
import { Order } from "@/context/OrderContext";
import { CurrentBatch } from "@/screens/DriverHomeScreen";

export type RootStackParamList = {
  Splash: undefined;
  PhoneLogin: undefined;
  OtpVerification: undefined;
  UserType: undefined;
  DriverRegistration: undefined;
  DriverOrderDetail: { order: any };
  DriverBatch: { batch: CurrentBatch };
  ProfileCompletion: undefined;
  MainTabs: undefined;
  DriverTabs: undefined;
  Main: undefined;
  AllCategories: undefined;
  Products: { categoryId?: string; categoryName: string; searchQuery?: string; restaurant?: string };
  Checkout: undefined;
  OrderConfirmation: { order: Order };
  OrderTracking: { orderId: string };
  Admin: undefined;
  MapPicker: undefined;
  CourierPickup: undefined;
  InternationalShopping: undefined;
  SupportChat: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootStackNavigator() {
  const screenOptions = useScreenOptions();
  const { isLoggedIn, isLoading, isProfileComplete, isOtpSent, isOtpVerified, selectedUserType, isDriverRegistered, hasSeenSplash } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: AppColors.primary }}>
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  const renderAuthScreens = () => {
    if (!isOtpSent) {
      if (hasSeenSplash) {
        return (
          <Stack.Screen name="PhoneLogin" component={PhoneLoginScreen} />
        );
      }
      return (
        <>
          <Stack.Screen name="Splash" component={SplashScreen} />
          <Stack.Screen name="PhoneLogin" component={PhoneLoginScreen} />
        </>
      );
    }

    if (!isOtpVerified) {
      return (
        <Stack.Screen name="OtpVerification" component={OtpVerificationScreen} />
      );
    }

    if (!selectedUserType) {
      return (
        <Stack.Screen name="UserType" component={UserTypeScreen} />
      );
    }

    if (selectedUserType === "driver" && !isDriverRegistered) {
      return (
        <Stack.Screen name="DriverRegistration" component={DriverRegistrationScreen} />
      );
    }

    return null;
  };

  const needsAuth = !isOtpSent || !isOtpVerified || !selectedUserType || (selectedUserType === "driver" && !isDriverRegistered);

  if (needsAuth && !isLoggedIn) {
    return (
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          headerTransparent: false,
          contentStyle: { backgroundColor: "transparent" },
          gestureEnabled: true,
          gestureDirection: "horizontal",
          animation: "slide_from_left",
        }}
      >
        {renderAuthScreens()}
      </Stack.Navigator>
    );
  }

  if (isLoggedIn && !isProfileComplete && selectedUserType !== "driver") {
    return (
      <Stack.Navigator screenOptions={screenOptions}>
        <Stack.Screen
          name="ProfileCompletion"
          component={ProfileCompletionScreen}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
    );
  }

  if (isLoggedIn && selectedUserType === "driver") {
    return (
      <Stack.Navigator screenOptions={screenOptions}>
        <Stack.Screen
          name="DriverTabs"
          component={DriverTabNavigator}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="DriverOrderDetail"
          component={DriverOrderDetailScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="DriverBatch"
          component={DriverBatchScreen}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
    );
  }

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="MainTabs"
        component={MainTabNavigator}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Main"
        component={MainTabNavigator}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AllCategories"
        component={CategoriesScreen}
        options={{
          headerTitle: "جميع الأقسام",
        }}
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
      <Stack.Screen
        name="OrderTracking"
        component={OrderTrackingScreen}
        options={{
          headerTitle: "تتبع الطلب",
        }}
      />
      <Stack.Screen
        name="Admin"
        component={AdminScreen}
        options={{
          headerTitle: "لوحة التحكم",
        }}
      />
      <Stack.Screen
        name="MapPicker"
        component={MapPickerScreen}
        options={{
          headerTitle: "تحديد الموقع",
          presentation: "modal",
        }}
      />
      <Stack.Screen
        name="CourierPickup"
        component={CourierPickupScreen}
        options={{
          headerTitle: "استلام من المندوب",
        }}
      />
      <Stack.Screen
        name="InternationalShopping"
        component={InternationalShoppingScreen}
        options={{
          headerTitle: "التسوق الدولي",
        }}
      />
      <Stack.Screen
        name="SupportChat"
        component={SupportChatScreen}
        options={{
          headerTitle: "الدعم والمساعدة",
        }}
      />
    </Stack.Navigator>
  );
}
