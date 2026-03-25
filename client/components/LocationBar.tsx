import React, { useState, useEffect } from "react";
import { StyleSheet, View, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Location from "expo-location";

import { ThemedText } from "@/components/ThemedText";
import { useLocation } from "@/context/LocationContext";
import { AppColors } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { reverseGeocodeArabic, isGenericAddress } from "@/lib/geocoding";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function LocationBar() {
  const navigation = useNavigation<NavigationProp>();
  const { savedLocation, setSavedLocation } = useLocation();
  const [autoDetecting, setAutoDetecting] = useState(false);

  useEffect(() => {
    if (!savedLocation) {
      autoDetectLocation();
    } else if (isGenericAddress(savedLocation.address)) {
      refreshAddress(savedLocation.latitude, savedLocation.longitude);
    }
  }, []);

  const refreshAddress = async (lat: number, lng: number) => {
    try {
      const address = await reverseGeocodeArabic(lat, lng);
      setSavedLocation({ latitude: lat, longitude: lng, address });
    } catch {}
  };

  const autoDetectLocation = async () => {
    try {
      setAutoDetecting(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const address = await reverseGeocodeArabic(loc.coords.latitude, loc.coords.longitude);
      setSavedLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude, address });
    } catch {} finally {
      setAutoDetecting(false);
    }
  };

  const displayAddress = savedLocation?.address
    ? savedLocation.address
    : autoDetecting
      ? "جاري تحديد الموقع..."
      : "حدد موقعك";

  return (
    <Pressable style={styles.row} onPress={() => navigation.navigate("MapPicker")} testID="button-location-bar">
      <Feather name="map-pin" size={13} color={AppColors.primary} />
      <ThemedText style={styles.label}>التوصيل إلى</ThemedText>
      <ThemedText style={styles.address} numberOfLines={1}>{displayAddress}</ThemedText>
      <Feather name="chevron-down" size={13} color="#9CA3AF" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 4,
    paddingVertical: 6,
    justifyContent: "flex-end",
  },
  label: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    color: "#9CA3AF",
  },
  address: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    color: "#1A1A1A",
    maxWidth: 160,
  },
});
