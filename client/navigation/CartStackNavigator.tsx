import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import CartScreen from "@/screens/CartScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type CartStackParamList = {
  Cart: undefined;
};

const Stack = createNativeStackNavigator<CartStackParamList>();

export default function CartStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Cart"
        component={CartScreen}
        options={{
          headerTitle: "السلة",
        }}
      />
    </Stack.Navigator>
  );
}
