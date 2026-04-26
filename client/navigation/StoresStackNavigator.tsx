import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import StoresScreen from "@/screens/StoresScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type StoresStackParamList = {
  Stores: undefined;
};

const Stack = createNativeStackNavigator<StoresStackParamList>();

export default function StoresStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Stores"
        component={StoresScreen}
        options={{
          headerTitle: "المتاجر",
          headerShadowVisible: false,
        }}
      />
    </Stack.Navigator>
  );
}
