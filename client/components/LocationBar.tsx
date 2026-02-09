import React, { useState, useEffect } from "react";
import { StyleSheet, View, Pressable, Platform, Alert } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Location from "expo-location";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { AppColors, Spacing, BorderRadius } from "@/constants/theme";

interface LocationBarProps {
  onPress?: () => void;
}

export function LocationBar({ onPress }: LocationBarProps) {
  const { theme, isDark } = useTheme();
  const [locationText, setLocationText] = useState("تحديد الموقع...");
  const [loading, setLoading] = useState(false);

  const getCurrentLocation = async () => {
    try {
      setLoading(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocationText("يرجى السماح بالوصول للموقع");
        setLoading(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const [address] = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      if (address) {
        const parts = [address.street, address.district, address.city, address.region].filter(Boolean);
        setLocationText(parts.join("، ") || "تم تحديد الموقع");
      } else {
        setLocationText("تم تحديد الموقع");
      }
    } catch (error) {
      setLocationText("قضاء الدجيل - صلاح الدين");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getCurrentLocation();
  }, []);

  return (
    <Pressable
      style={[
        styles.container,
        {
          backgroundColor: isDark ? theme.backgroundDefault : "#F5F5F5",
          borderColor: isDark ? theme.border : "#EEE",
        },
      ]}
      onPress={onPress || getCurrentLocation}
    >
      <View style={styles.locationIcon}>
        <Feather name="map-pin" size={20} color={AppColors.wayYellow} />
      </View>
      <View style={styles.textContainer}>
        <ThemedText type="small" style={[styles.label, { color: theme.textSecondary }]}>
          التوصيل إلى
        </ThemedText>
        <ThemedText type="body" numberOfLines={1} style={styles.address}>
          {loading ? "جاري تحديد الموقع..." : locationText}
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
