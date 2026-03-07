import React, { useState, useEffect } from "react";
import { StyleSheet, View, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Location from "expo-location";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { useLocation } from "@/context/LocationContext";
import { AppColors, Spacing } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { reverseGeocodeArabic, isGenericAddress } from "@/lib/geocoding";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function LocationBar() {
  const { theme, isDark } = useTheme();
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
      setSavedLocation({
        latitude: lat,
        longitude: lng,
        address,
      });
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
      setSavedLocation({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        address: address,
      });
    } catch {} finally {
      setAutoDetecting(false);
    }
  };

  const handlePress = () => {
    navigation.navigate("MapPicker");
  };

  const displayAddress = savedLocation?.address
    ? savedLocation.address
    : autoDetecting
      ? "جاري تحديد الموقع..."
      : "حدد موقعك على الخريطة";

  return (
    <Pressable
      style={[
        styles.container,
        {
          backgroundColor: isDark ? theme.backgroundDefault : "#F5F5F5",
          borderColor: isDark ? theme.border : "#EEE",
        },
      ]}
      onPress={handlePress}
    >
      <View style={styles.locationIcon}>
        <Feather name="map-pin" size={20} color={AppColors.wayYellow} />
      </View>
      <View style={styles.textContainer}>
        <ThemedText type="small" style={[styles.label, { color: theme.textSecondary }]}>
          التوصيل إلى
        </ThemedText>
        <ThemedText type="body" numberOfLines={1} style={styles.address}>
          {displayAddress}
        </ThemedText>
      </View>
      <Feather name="chevron-down" size={18} color={AppColors.onGrey} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row-reverse",
    alignItems: "center",
    borderRadius: 12,
    paddingHorizontal: 15,
    marginHorizontal: 15,
    marginVertical: 10,
    height: 55,
    borderWidth: 1,
    gap: 10,
  },
  locationIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#FFF2EC",
    alignItems: "center",
    justifyContent: "center",
  },
  textContainer: {
    flex: 1,
    alignItems: "flex-end",
  },
  label: {
    fontSize: 11,
    marginBottom: 2,
  },
  address: {
    fontWeight: "600",
    fontSize: 13,
  },
});
