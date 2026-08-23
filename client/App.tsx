import React, { useEffect, useState } from "react";
import { StyleSheet } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import * as Notifications from "expo-notifications";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});
import { useFonts } from "expo-font";
import {
  Poppins_400Regular,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from "@expo-google-fonts/poppins";
import {
  Cairo_400Regular,
  Cairo_600SemiBold,
  Cairo_700Bold,
} from "@expo-google-fonts/cairo";
import {
  Kanit_400Regular,
  Kanit_500Medium,
  Kanit_600SemiBold,
  Kanit_700Bold,
  Kanit_900Black,
} from "@expo-google-fonts/kanit";
import {
  Montserrat_700Bold,
  Montserrat_800ExtraBold,
  Montserrat_900Black,
} from "@expo-google-fonts/montserrat";

import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";

import RootStackNavigator from "@/navigation/RootStackNavigator";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { reportCrash } from "@/lib/crashReporting";
import { AuthProvider } from "@/context/AuthContext";
import { SystemSettingsProvider } from "@/context/SystemSettingsContext";
import { CartProvider } from "@/context/CartContext";
import { OrderProvider } from "@/context/OrderContext";
import { FavoritesProvider } from "@/context/FavoritesContext";
import { VendorFavoritesProvider } from "@/context/VendorFavoritesContext";
import { CartAnimationProvider } from "@/context/CartAnimationContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { NotificationProvider } from "@/context/NotificationContext";
import { LocationProvider } from "@/context/LocationContext";
import { ensureRtl } from "@/lib/rtl";

SplashScreen.preventAutoHideAsync();

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Poppins_400Regular,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Cairo_400Regular,
    Cairo_600SemiBold,
    Cairo_700Bold,
    Kanit_400Regular,
    Kanit_500Medium,
    Kanit_600SemiBold,
    Kanit_700Bold,
    "Kanit-Black": Kanit_900Black,
    Montserrat_700Bold,
    Montserrat_800ExtraBold,
    Montserrat_900Black,
  });

  // M-80: forceRTL only takes effect on the NEXT launch, so the launch that sets it
  // would otherwise draw the whole Arabic app mirrored. ensureRtl() reloads once
  // when that is the case; holding the splash until it settles means the wrong
  // direction is never painted rather than being painted and corrected.
  const [rtlSettled, setRtlSettled] = useState(false);
  useEffect(() => {
    let cancelled = false;
    ensureRtl().finally(() => {
      if (!cancelled) setRtlSettled(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const assetsReady = fontsLoaded || fontError;

  useEffect(() => {
    if (assetsReady && rtlSettled) {
      SplashScreen.hideAsync();
    }
  }, [assetsReady, rtlSettled]);

  if (!assetsReady || !rtlSettled) {
    return null;
  }

  return (
    <ErrorBoundary onError={reportCrash}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AuthProvider>
            <SystemSettingsProvider>
              <NotificationProvider>
                <LocationProvider>
                  <CartProvider>
                    <OrderProvider>
                      <FavoritesProvider>
                        <VendorFavoritesProvider>
                          <CartAnimationProvider>
                            <SafeAreaProvider>
                              <GestureHandlerRootView style={styles.root}>
                                <KeyboardProvider>
                                  <NavigationContainer>
                                    <RootStackNavigator />
                                  </NavigationContainer>
                                  <StatusBar style="dark" />
                                </KeyboardProvider>
                              </GestureHandlerRootView>
                            </SafeAreaProvider>
                          </CartAnimationProvider>
                        </VendorFavoritesProvider>
                      </FavoritesProvider>
                    </OrderProvider>
                  </CartProvider>
                </LocationProvider>
              </NotificationProvider>
            </SystemSettingsProvider>
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
