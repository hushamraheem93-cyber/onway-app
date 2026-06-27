import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import ProfileScreen from "@/screens/ProfileScreen";
import EditProfileScreen from "@/screens/EditProfileScreen";
import PolicyScreen from "@/screens/PolicyScreen";
import AboutScreen from "@/screens/AboutScreen";
import TermsScreen from "@/screens/TermsScreen";
import FAQScreen from "@/screens/FAQScreen";
import HelpCenterScreen from "@/screens/HelpCenterScreen";
import NotificationsScreen from "@/screens/NotificationsScreen";
import NotificationsListScreen from "@/screens/NotificationsListScreen";
import AddressesScreen from "@/screens/AddressesScreen";
import OrdersScreen from "@/screens/OrdersScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type ProfileStackParamList = {
  Profile: undefined;
  EditProfile: undefined;
  Policy: undefined;
  About: undefined;
  Terms: undefined;
  FAQ: undefined;
  HelpCenter: undefined;
  Notifications: undefined;
  NotificationsList: undefined;
  Addresses: undefined;
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
        options={{ headerTitle: "الحساب" }}
      />
      <Stack.Screen
        name="EditProfile"
        component={EditProfileScreen}
        options={{ headerTitle: "تعديل الملف الشخصي" }}
      />
      <Stack.Screen
        name="HelpCenter"
        component={HelpCenterScreen}
        options={{ headerTitle: "مركز المساعدة" }}
      />
      <Stack.Screen
        name="FAQ"
        component={FAQScreen}
        options={{ headerTitle: "الأسئلة الشائعة" }}
      />
      <Stack.Screen
        name="Terms"
        component={TermsScreen}
        options={{ headerTitle: "الشروط والأحكام" }}
      />
      <Stack.Screen
        name="Policy"
        component={PolicyScreen}
        options={{ headerTitle: "سياسة الخصوصية" }}
      />
      <Stack.Screen
        name="About"
        component={AboutScreen}
        options={{ headerTitle: "حول OnWay" }}
      />
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ headerTitle: "إعدادات الإشعارات" }}
      />
      <Stack.Screen
        name="NotificationsList"
        component={NotificationsListScreen}
        options={{ headerTitle: "الإشعارات" }}
      />
      <Stack.Screen
        name="Addresses"
        component={AddressesScreen}
        options={{ headerTitle: "العناوين المحفوظة" }}
      />
      <Stack.Screen
        name="Orders"
        component={OrdersScreen}
        options={{ headerTitle: "طلباتي" }}
      />
    </Stack.Navigator>
  );
}
