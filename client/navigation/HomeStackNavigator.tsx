import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import HomeScreen from "@/screens/HomeScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type HomeStackParamList = {
  Home: undefined;
};

const Stack = createNativeStackNavigator<HomeStackParamList>();

export default function HomeStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        // Header is rendered inside HomeScreen (see <HeaderTitle/>). The native-stack
        // Toolbar clipped the full-width custom title on Android, hiding the icons.
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}
