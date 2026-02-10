import React from "react";
import { View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing } from "@/constants/theme";

interface MapPickerProps {
  selectedLocation: { latitude: number; longitude: number } | null;
  onLocationSelect: (location: { latitude: number; longitude: number }) => void;
  onGetCurrentLocation: () => void;
  isLoadingLocation: boolean;
}

export default function MapPicker(_props: MapPickerProps) {
  const { theme } = useTheme();
  return (
    <View style={styles.container}>
      <Feather name="map" size={60} color={theme.textSecondary} />
      <ThemedText type="body" style={{ color: theme.textSecondary, textAlign: "center", marginTop: Spacing.lg }}>
        الخريطة متاحة فقط على تطبيق الهاتف
      </ThemedText>
      <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: "center", marginTop: Spacing.sm }}>
        استخدم تطبيق Expo Go لتحديد الموقع
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
});
