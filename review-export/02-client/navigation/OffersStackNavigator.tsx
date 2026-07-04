import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import OffersScreen from "@/screens/OffersScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type OffersStackParamList = {
  Offers: undefined;
};

const Stack = createNativeStackNavigator<OffersStackParamList>();

export default function OffersStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Offers"
        component={OffersScreen}
        options={{
          headerTitle: "التخفيضات",
        }}
      />
    </Stack.Navigator>
  );
}
