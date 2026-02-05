import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import ProfileScreen from "@/screens/ProfileScreen";
import EditProfileScreen from "@/screens/EditProfileScreen";
import PolicyScreen from "@/screens/PolicyScreen";
import AboutScreen from "@/screens/AboutScreen";
import TermsScreen from "@/screens/TermsScreen";
import FAQScreen from "@/screens/FAQScreen";
import NotificationsScreen from "@/screens/NotificationsScreen";
import AddressesScreen from "@/screens/AddressesScreen";
import PaymentScreen from "@/screens/PaymentScreen";
import OrdersScreen from "@/screens/OrdersScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type ProfileStackParamList = {
  Profile: undefined;
  EditProfile: undefined;
  Policy: undefined;
  About: undefined;
  Terms: undefined;
  FAQ: undefined;
  Notifications: undefined;
  Addresses: undefined;
  Payment: undefined;
  Orders: undefined;
};

const Stack = createNativeStackNavigator<ProfileStackParamList>();

export default function ProfileStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          headerTitle: "الحساب",
        }}
      />
      <Stack.Screen
        name="EditProfile"
        component={EditProfileScreen}
        options={{
          headerTitle: "تعديل الملف الشخصي",
        }}
      />
      <Stack.Screen
        name="Policy"
        component={PolicyScreen}
        options={{
          headerTitle: "سياسة الخصوصية",
        }}
      />
      <Stack.Screen
        name="About"
        component={AboutScreen}
        options={{
          headerTitle: "من نحن",
        }}
      />
      <Stack.Screen
        name="Terms"
        component={TermsScreen}
        options={{
          headerTitle: "الشروط والأحكام",
        }}
      />
      <Stack.Screen
        name="FAQ"
        component={FAQScreen}
        options={{
          headerTitle: "الأسئلة الشائعة",
        }}
      />
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          headerTitle: "الإشعارات",
        }}
      />
      <Stack.Screen
        name="Addresses"
        component={AddressesScreen}
        options={{
          headerTitle: "العناوين المحفوظة",
        }}
      />
      <Stack.Screen
        name="Payment"
        component={PaymentScreen}
        options={{
          headerTitle: "طرق الدفع",
        }}
      />
      <Stack.Screen
        name="Orders"
        component={OrdersScreen}
        options={{
          headerTitle: "طلباتي",
        }}
      />
    </Stack.Navigator>
  );
}
