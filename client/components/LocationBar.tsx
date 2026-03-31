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
      <View style={styles.pinIcon}>
        <Feather name="map-pin" size={18} color={AppColors.primary} />
      </View>
      <View style={styles.textBlock}>
        <ThemedText style={styles.label}>التوصيل إلى</ThemedText>
        <ThemedText style={styles.address} numberOfLines={1}>{displayAddress}</ThemedText>
      </View>
      <Feather name="chevron-down" size={15} color={AppColors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 2,
    justifyContent: "flex-start",
  },
  pinIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#FFF0E8",
    alignItems: "center",
    justifyContent: "center",
  },
  textBlock: {
    flex: 1,
    alignItems: "flex-end",
  },
  label: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    color: "#9CA3AF",
    textAlign: "right",
  },
  address: {
    fontFamily: "Cairo_700Bold",
    fontSize: 12,
    color: "#1A1A1A",
    textAlign: "right",
  },
});
