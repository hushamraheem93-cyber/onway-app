import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import CategoriesScreen from "@/screens/CategoriesScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type CategoriesStackParamList = {
  Categories: undefined;
};

const Stack = createNativeStackNavigator<CategoriesStackParamList>();

export default function CategoriesStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Categories"
        component={CategoriesScreen}
        options={{
          headerTitle: "الأقسام",
        }}
      />
    </Stack.Navigator>
  );
}
