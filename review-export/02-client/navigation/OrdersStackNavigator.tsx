import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import OrdersScreen from "@/screens/OrdersScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type OrdersStackParamList = {
  Orders: undefined;
};

const Stack = createNativeStackNavigator<OrdersStackParamList>();

export default function OrdersStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Orders"
        component={OrdersScreen}
        options={{
          headerTitle: "الطلبات",
        }}
      />
    </Stack.Navigator>
  );
}
