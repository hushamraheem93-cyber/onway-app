import React, { useState, useEffect, useRef } from "react";
import { StyleSheet, View, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import * as Location from "expo-location";
import MapView, { Marker } from "react-native-maps";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { useLocation } from "@/context/LocationContext";
import { AppColors } from "@/constants/theme";

const DUJAIL_REGION = {
  latitude: 33.855,
  longitude: 44.237,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
};

export default function MapPickerScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { theme } = useTheme();
  const { savedLocation, setSavedLocation } = useLocation();
  const mapRef = useRef<MapView>(null);

  const [selectedCoord, setSelectedCoord] = useState({
    latitude: savedLocation?.latitude || DUJAIL_REGION.latitude,
    longitude: savedLocation?.longitude || DUJAIL_REGION.longitude,
  });
  const [addressText, setAddressText] = useState(savedLocation?.address || "");
  const [loadingAddress, setLoadingAddress] = useState(false);

  useEffect(() => {
    if (!savedLocation) {
      getMyLocation();
    }
  }, []);

  const getMyLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const coords = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      };
      setSelectedCoord(coords);
      reverseGeocode(coords.latitude, coords.longitude);

      mapRef.current?.animateToRegion({
        ...coords,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      }, 1000);
    } catch {}
  };

  const reverseGeocode = async (lat: number, lng: number) => {
    try {
      setLoadingAddress(true);
      const [address] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      if (address) {
        const parts = [address.street, address.name, address.district, address.city, address.region].filter(Boolean);
        const unique = [...new Set(parts)];
        setAddressText(unique.join("، ") || "موقع محدد");
      } else {
        setAddressText("موقع محدد");
      }
    } catch {
      setAddressText("موقع محدد");
    } finally {
      setLoadingAddress(false);
    }
  };

  const handleMapPress = (e: any) => {
    const coords = e.nativeEvent.coordinate;
    setSelectedCoord(coords);
    reverseGeocode(coords.latitude, coords.longitude);
  };

  const handleConfirm = () => {
    setSavedLocation({
      latitude: selectedCoord.latitude,
      longitude: selectedCoord.longitude,
      address: addressText,
    });
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={{
          latitude: selectedCoord.latitude,
          longitude: selectedCoord.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
        showsUserLocation
        showsMyLocationButton={false}
        onPress={handleMapPress}
      >
        <Marker
          coordinate={selectedCoord}
          draggable
          onDragEnd={(e) => {
            const coords = e.nativeEvent.coordinate;
            setSelectedCoord(coords);
            reverseGeocode(coords.latitude, coords.longitude);
          }}
        />
      </MapView>

      <Pressable
        style={[styles.myLocationBtn, { top: insets.top + 60 }]}
        onPress={getMyLocation}
      >
        <Feather name="crosshair" size={22} color={AppColors.onGrey} />
      </Pressable>

      <View style={[styles.bottomSheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.addressRow}>
          <View style={styles.addressIcon}>
            <Feather name="map-pin" size={20} color={AppColors.wayYellow} />
          </View>
          <View style={styles.addressContent}>
            <ThemedText type="small" style={styles.addressLabel}>العنوان المحدد</ThemedText>
            {loadingAddress ? (
              <ActivityIndicator size="small" color={AppColors.primary} />
            ) : (
              <ThemedText type="body" numberOfLines={2} style={styles.addressValue}>
                {addressText || "انقر على الخريطة لتحديد موقعك"}
              </ThemedText>
            )}
          </View>
        </View>

        <Pressable style={styles.confirmButton} onPress={handleConfirm}>
          <Feather name="check" size={20} color="#000" />
          <ThemedText type="body" style={styles.confirmText}>تثبيت الموقع</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  myLocationBtn: {
    position: "absolute",
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
    zIndex: 10,
  },
  bottomSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 10,
  },
  addressRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    marginBottom: 16,
    gap: 12,
  },
  addressIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#FFF8E1",
    alignItems: "center",
    justifyContent: "center",
  },
  addressContent: {
    flex: 1,
    alignItems: "flex-end",
  },
  addressLabel: {
    color: "#999",
    marginBottom: 2,
  },
  addressValue: {
    fontWeight: "600",
    textAlign: "right",
  },
  confirmButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: AppColors.wayYellow,
    borderRadius: 14,
    height: 52,
    gap: 8,
  },
  confirmText: {
    fontWeight: "700",
    color: "#000",
    fontSize: 16,
  },
});
