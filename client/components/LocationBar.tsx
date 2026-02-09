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

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

async function reverseGeocodeArabic(lat: number, lng: number): Promise<string> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=ar&zoom=18&addressdetails=1`;
    const res = await fetch(url, {
      headers: { "User-Agent": "OnwayApp/1.0" },
    });
    const data = await res.json();
    if (data && data.display_name) {
      const parts = data.display_name.split(",").map((s: string) => s.trim()).filter(Boolean);
      if (parts.length > 3) {
        return parts.slice(0, 3).join("، ");
      }
      return parts.join("، ");
    }
    return "قضاء الدجيل";
  } catch {
    return "قضاء الدجيل";
  }
}

export function LocationBar() {
  const { theme, isDark } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const { savedLocation, setSavedLocation } = useLocation();
  const [autoDetecting, setAutoDetecting] = useState(false);

  useEffect(() => {
    if (!savedLocation) {
      autoDetectLocation();
    }
  }, []);

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
    backgroundColor: "#FFF8E1",
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
