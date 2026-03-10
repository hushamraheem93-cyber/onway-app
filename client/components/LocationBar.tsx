import React, { useState, useEffect } from "react";
import { StyleSheet, View, Pressable, Platform } from "react-native";
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
    <View style={styles.outerWrapper}>
      <Pressable
        style={[
          styles.container,
          {
            backgroundColor: isDark ? theme.backgroundDefault : "#FFFFFF",
            borderColor: isDark ? theme.border : "#F0F0F0",
          },
        ]}
        onPress={handlePress}
        testID="button-location-bar"
      >
        <View style={styles.locationIcon}>
          <Feather name="map-pin" size={18} color={AppColors.wayYellow} />
        </View>
        <View style={styles.textContainer}>
          <ThemedText type="small" style={styles.label}>
            التوصيل إلى
          </ThemedText>
          <ThemedText type="body" numberOfLines={1} style={styles.address}>
            {displayAddress}
          </ThemedText>
        </View>
        <View style={styles.editIcon}>
          <Feather name="edit-2" size={14} color="#E86520" />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  outerWrapper: {
    marginHorizontal: 16,
    marginVertical: 10,
    borderRadius: 20,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: {
        elevation: 4,
      },
      web: {
        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
      },
    }),
  },
  container: {
    flexDirection: "row-reverse",
    alignItems: "center",
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderWidth: 1,
    gap: 14,
  },
  locationIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(243,115,53,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  textContainer: {
    flex: 1,
    alignItems: "flex-end",
  },
  label: {
    fontSize: 12,
    color: "#555555",
    marginBottom: 4,
    fontWeight: "500",
  },
  address: {
    fontWeight: "800",
    fontSize: 15,
    color: "#111111",
  },
  editIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(243,115,53,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
});
