import React, { useState, useEffect, useRef } from "react";
import { StyleSheet, View, Pressable, ActivityIndicator, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import * as Location from "expo-location";
import { WebView } from "react-native-webview";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { useLocation } from "@/context/LocationContext";
import { AppColors } from "@/constants/theme";
import { reverseGeocodeArabic, DHULUIYAH_CENTER, DEFAULT_DISTRICT } from "@/lib/geocoding";

function getLeafletHTML(lat: number, lng: number) {
  return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; overflow: hidden; }
    #map { width: 100%; height: 100%; }
    .leaflet-control-attribution { display: none !important; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', {
      center: [${lat}, ${lng}],
      zoom: 15,
      zoomControl: false,
      attributionControl: false
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(map);

    L.control.zoom({ position: 'topleft' }).addTo(map);

    var marker = L.marker([${lat}, ${lng}], { draggable: true }).addTo(map);

    function sendLocation(lat, lng) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'location', lat: lat, lng: lng }));
    }

    marker.on('dragend', function(e) {
      var pos = e.target.getLatLng();
      sendLocation(pos.lat, pos.lng);
    });

    map.on('click', function(e) {
      marker.setLatLng(e.latlng);
      sendLocation(e.latlng.lat, e.latlng.lng);
    });

    function moveToLocation(lat, lng) {
      map.setView([lat, lng], 17, { animate: true });
      marker.setLatLng([lat, lng]);
      sendLocation(lat, lng);
    }

    window.addEventListener('message', function(e) {
      try {
        var data = JSON.parse(e.data);
        if (data.type === 'moveTo') {
          moveToLocation(data.lat, data.lng);
        }
      } catch(err) {}
    });

    document.addEventListener('message', function(e) {
      try {
        var data = JSON.parse(e.data);
        if (data.type === 'moveTo') {
          moveToLocation(data.lat, data.lng);
        }
      } catch(err) {}
    });

    sendLocation(${lat}, ${lng});
  </script>
</body>
</html>`;
}

export default function MapPickerScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { theme } = useTheme();
  const { savedLocation, setSavedLocation } = useLocation();
  const webViewRef = useRef<WebView>(null);

  const initialLat = savedLocation?.latitude || DHULUIYAH_CENTER.lat;
  const initialLng = savedLocation?.longitude || DHULUIYAH_CENTER.lng;

  const [selectedCoord, setSelectedCoord] = useState({ latitude: initialLat, longitude: initialLng });
  const [addressText, setAddressText] = useState(savedLocation?.address || "");
  const [loadingAddress, setLoadingAddress] = useState(false);

  useEffect(() => {
    if (!savedLocation) {
      getMyLocation();
    } else if (!addressText) {
      fetchAddress(initialLat, initialLng);
    }
  }, []);

  const fetchAddress = async (lat: number, lng: number) => {
    setLoadingAddress(true);
    const addr = await reverseGeocodeArabic(lat, lng);
    setAddressText(addr);
    setLoadingAddress(false);
  };

  const getMyLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      setSelectedCoord(coords);
      fetchAddress(coords.latitude, coords.longitude);

      if (webViewRef.current) {
        webViewRef.current.postMessage(JSON.stringify({
          type: "moveTo",
          lat: coords.latitude,
          lng: coords.longitude,
        }));
      }
    } catch {}
  };

  const handleWebViewMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === "location") {
        const coords = { latitude: data.lat, longitude: data.lng };
        setSelectedCoord(coords);
        fetchAddress(data.lat, data.lng);
      }
    } catch {}
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
      <WebView
        ref={webViewRef}
        source={{ html: getLeafletHTML(initialLat, initialLng) }}
        style={styles.map}
        onMessage={handleWebViewMessage}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={AppColors.wayYellow} />
            <ThemedText type="body" style={{ marginTop: 10, color: "#999" }}>جاري تحميل الخريطة...</ThemedText>
          </View>
        )}
      />

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
              <ActivityIndicator size="small" color={AppColors.wayYellow} />
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
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#F9F9F9",
    alignItems: "center",
    justifyContent: "center",
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
