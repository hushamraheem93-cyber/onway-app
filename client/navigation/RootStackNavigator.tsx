import React from "react";
import { ActivityIndicator, View } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import MainTabNavigator from "@/navigation/MainTabNavigator";
import DriverTabNavigator from "@/navigation/DriverTabNavigator";
import VendorTabNavigator from "@/navigation/VendorTabNavigator";
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
import MapPickerScreen from "@/screens/MapPickerScreen";
import CourierPickupScreen from "@/screens/CourierPickupScreen";
import InternationalShoppingScreen from "@/screens/InternationalShoppingScreen";
import SupportChatScreen from "@/screens/SupportChatScreen";
import VendorRegistrationScreen from "@/screens/VendorRegistrationScreen";
import StoreProductsScreen from "@/screens/StoreProductsScreen";
import StoreRatingsScreen from "@/screens/StoreRatingsScreen";
import StoresListScreen from "@/screens/StoresListScreen";
import ProductDetailScreen from "@/screens/ProductDetailScreen";
import AdminScreen from "@/screens/AdminScreen";
import AdminLoginScreen from "@/screens/AdminLoginScreen";
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
  VendorRegistration: undefined;
  DriverOrderDetail: { order: any };
  DriverBatch: { batch: CurrentBatch };
  ProfileCompletion: undefined;
  MainTabs: undefined;
  DriverTabs: undefined;
  VendorTabs: undefined;
  Main: undefined;
  AllCategories: undefined;
  Products: { categoryId?: string; categoryName: string; searchQuery?: string; restaurant?: string };
  Checkout: undefined;
  OrderConfirmation: { order: Order };
  OrderTracking: { orderId: string };
  MapPicker: undefined;
  CourierPickup: undefined;
  InternationalShopping: undefined;
  SupportChat: undefined;
  StoreProducts: { storeId: string; storeName: string; initialCategoryFilter?: string };
  StoreRatings: { storeId: string; storeName: string };
  StoresList: { categoryId: string; categoryName: string; businessType?: string };
  AdminLogin: undefined;
  Admin: undefined;
  ProductDetail: {
    product: {
      id: string;
      name: string;
      description?: string;
      price: number;
      category?: string;
      stock: number;
      unit?: string;
      imageUrl: string;
      imageUrls?: string[];
      storeName?: string;
    };
  };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootStackNavigator() {
  const screenOptions = useScreenOptions();
  const { isLoggedIn, isLoading, isProfileComplete, isOtpSent, isOtpVerified, selectedUserType, isDriverRegistered, hasSeenSplash, isVendorRegistered } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: AppColors.primary }}>
        <ActivityIndicator size="large" color={AppColors.white} />
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

    if (selectedUserType === "vendor" && !isVendorRegistered) {
      return (
        <Stack.Screen name="VendorRegistration" component={VendorRegistrationScreen} />
      );
    }

    return null;
  };

  const needsAuth =
    !isOtpSent ||
    !isOtpVerified ||
    !selectedUserType ||
    (selectedUserType === "driver" && !isDriverRegistered) ||
    (selectedUserType === "vendor" && !isVendorRegistered && !isLoggedIn);

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

  if (isLoggedIn && selectedUserType === "vendor" && isVendorRegistered) {
    return (
      <Stack.Navigator screenOptions={screenOptions}>
        <Stack.Screen
          name="VendorTabs"
          component={VendorTabNavigator}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
    );
  }

  if (isLoggedIn && selectedUserType === "vendor" && !isVendorRegistered) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="VendorRegistration" component={VendorRegistrationScreen} />
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
        <Stack.Screen
          name="MapPicker"
          component={MapPickerScreen}
          options={{
            headerTitle: "تحديد الموقع",
            presentation: "modal",
          }}
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
        <Stack.Screen
          name="SupportChat"
          component={SupportChatScreen}
          options={{ headerTitle: "الدعم والمساعدة" }}
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
      <Stack.Screen
        name="StoreProducts"
        component={StoreProductsScreen}
        options={({ route }) => ({
          headerTitle: route.params.storeName,
        })}
      />
      <Stack.Screen
        name="StoreRatings"
        component={StoreRatingsScreen}
        options={({ route }) => ({
          headerTitle: `تقييمات ${route.params.storeName}`,
        })}
      />
      <Stack.Screen
        name="StoresList"
        component={StoresListScreen}
        options={({ route }) => ({
          headerTitle: route.params.categoryName,
        })}
      />
      <Stack.Screen
        name="ProductDetail"
        component={ProductDetailScreen}
        options={({ route }) => ({
          headerTitle: route.params.product.name,
        })}
      />
      <Stack.Screen
        name="AdminLogin"
        component={AdminLoginScreen}
        options={{ headerTitle: "لوحة التحكم" }}
      />
      <Stack.Screen
        name="Admin"
        component={AdminScreen}
        options={{ headerTitle: "لوحة التحكم" }}
      />
    </Stack.Navigator>
  );
}
