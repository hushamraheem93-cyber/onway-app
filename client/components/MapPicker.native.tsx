import React, { useRef } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import MapView, { Marker } from "react-native-maps";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { AppColors, Spacing, BorderRadius, Shadows } from "@/constants/theme";

interface MapPickerProps {
  selectedLocation: { latitude: number; longitude: number } | null;
  onLocationSelect: (location: { latitude: number; longitude: number }) => void;
  onGetCurrentLocation: () => void;
  isLoadingLocation: boolean;
}

const DHULUIYAH_REGION = {
  latitude: 34.25,
  longitude: 44.15,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

export default function MapPicker({ selectedLocation, onLocationSelect, onGetCurrentLocation, isLoadingLocation }: MapPickerProps) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const mapRef = useRef<MapView>(null);

  const initialRegion = selectedLocation
    ? { ...selectedLocation, latitudeDelta: 0.005, longitudeDelta: 0.005 }
    : DHULUIYAH_REGION;

  return (
    <View style={{ flex: 1 }}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        onPress={(e) => {
          onLocationSelect(e.nativeEvent.coordinate);
        }}
        showsUserLocation
        showsMyLocationButton={false}
      >
        {selectedLocation ? (
          <Marker
            coordinate={selectedLocation}
            draggable
            onDragEnd={(e) => {
              onLocationSelect(e.nativeEvent.coordinate);
            }}
          />
        ) : null}
      </MapView>

      <View style={[styles.controls, { bottom: insets.bottom + Spacing.xl }]}>
        <Pressable
          style={[styles.myLocationBtn, { backgroundColor: theme.backgroundDefault }, Shadows.md]}
          onPress={onGetCurrentLocation}
          testID="button-my-location"
        >
          <Feather name="crosshair" size={24} color={AppColors.primary} />
        </Pressable>
      </View>

      <View style={styles.hint}>
        <ThemedText type="small" style={{ color: "#FFFFFF", fontWeight: "600" }}>
          انقر على الخريطة أو اسحب المؤشر لتحديد موقعك
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  map: {
    flex: 1,
  },
  controls: {
    position: "absolute",
    left: Spacing.lg,
    right: Spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  myLocationBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
  },
  hint: {
    position: "absolute",
    top: Spacing.lg,
    left: Spacing.lg,
    right: Spacing.lg,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
});
