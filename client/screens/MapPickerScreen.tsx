import React, { useState, useEffect, useRef } from "react";
import { StyleSheet, View, Pressable, ActivityIndicator, Platform, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import * as Location from "expo-location";
import { WebView } from "react-native-webview";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { useLocation } from "@/context/LocationContext";
import { AppColors, FontWeight} from "@/constants/theme";
import { reverseGeocodeDetailed, DHULUIYAH_CENTER } from "@/lib/geocoding";

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
    .leaflet-control-zoom { border: none !important; box-shadow: 0 2px 12px rgba(0,0,0,0.15) !important; border-radius: 12px !important; overflow: hidden; }
    .leaflet-control-zoom a { width: 38px !important; height: 38px !important; line-height: 38px !important; font-size: 18px !important; color: #333 !important; background: #fff !important; border: none !important; }
    .leaflet-control-zoom a:hover { background: #f5f5f5 !important; }
    .custom-marker {
      width: 40px; height: 40px; position: relative;
    }
    .marker-pin {
      width: 40px; height: 40px; border-radius: 50% 50% 50% 0;
      background: #E86520; transform: rotate(-45deg);
      position: absolute; left: 0; top: 0;
      box-shadow: 0 3px 10px rgba(255,118,34,0.4);
      border: 3px solid #fff;
    }
    .marker-pin::after {
      content: ''; width: 14px; height: 14px; border-radius: 50%;
      background: #fff; position: absolute;
      left: 50%; top: 50%; transform: translate(-50%, -50%);
    }
    .marker-shadow {
      width: 28px; height: 6px; border-radius: 50%;
      background: rgba(0,0,0,0.15); position: absolute;
      bottom: -4px; left: 6px;
    }
    .pulse-ring {
      width: 60px; height: 60px; border-radius: 50%;
      background: rgba(255,118,34,0.2); position: absolute;
      left: -10px; top: -10px;
      animation: pulse 2s ease-out infinite;
    }
    @keyframes pulse {
      0% { transform: scale(0.5); opacity: 1; }
      100% { transform: scale(1.4); opacity: 0; }
    }
    .pin-tooltip {
      background: #E86520 !important; color: #fff !important;
      border: none !important; border-radius: 10px !important;
      padding: 6px 14px !important; font-size: 13px !important;
      font-weight: 700 !important; box-shadow: 0 3px 12px rgba(255,118,34,0.35) !important;
      white-space: nowrap !important; direction: rtl !important;
      font-family: 'Segoe UI', Tahoma, sans-serif !important;
    }
    .pin-tooltip::before { border-top-color: #E86520 !important; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', {
      center: [${lat}, ${lng}],
      zoom: 16,
      zoomControl: false,
      attributionControl: false
    });

    var googleStreets = L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=ar', {
      maxZoom: 20
    });

    googleStreets.addTo(map);

    L.control.zoom({ position: 'topleft' }).addTo(map);

    var markerIcon = L.divIcon({
      className: 'custom-marker',
      html: '<div class="pulse-ring"></div><div class="marker-pin"></div><div class="marker-shadow"></div>',
      iconSize: [40, 40],
      iconAnchor: [20, 40],
      popupAnchor: [0, -40]
    });

    var marker = L.marker([${lat}, ${lng}], { draggable: true, icon: markerIcon }).addTo(map);

    var tooltip = null;
    function showTooltip(text) {
      if (!text) { if (tooltip) { marker.unbindTooltip(); tooltip = null; } return; }
      if (tooltip) marker.unbindTooltip();
      marker.bindTooltip(text, {
        permanent: true, direction: 'top', offset: [0, -45],
        className: 'pin-tooltip'
      }).openTooltip();
      tooltip = true;
    }

    function sendLocation(lat, lng) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'location', lat: lat, lng: lng }));
    }

    marker.on('dragend', function(e) {
      var pos = e.target.getLatLng();
      showTooltip(null);
      sendLocation(pos.lat, pos.lng);
    });

    map.on('click', function(e) {
      marker.setLatLng(e.latlng);
      showTooltip(null);
      sendLocation(e.latlng.lat, e.latlng.lng);
    });

    function moveToLocation(lat, lng) {
      map.setView([lat, lng], 17, { animate: true, duration: 0.5 });
      marker.setLatLng([lat, lng]);
      sendLocation(lat, lng);
    }

    window.addEventListener('message', function(e) {
      try {
        var data = JSON.parse(e.data);
        if (data.type === 'moveTo') {
          moveToLocation(data.lat, data.lng);
        } else if (data.type === 'showLabel') {
          showTooltip(data.text);
        }
      } catch(err) {}
    });

    document.addEventListener('message', function(e) {
      try {
        var data = JSON.parse(e.data);
        if (data.type === 'moveTo') {
          moveToLocation(data.lat, data.lng);
        } else if (data.type === 'showLabel') {
          showTooltip(data.text);
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
  const [placeNameText, setPlaceNameText] = useState("");
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
    const result = await reverseGeocodeDetailed(lat, lng);
    setAddressText(result.address);
    setPlaceNameText(result.placeName || "");
    if (result.placeName && webViewRef.current) {
      webViewRef.current.postMessage(JSON.stringify({
        type: "showLabel",
        text: result.placeName,
      }));
    }
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
            <ActivityIndicator size="large" color={AppColors.primary} />
            <ThemedText type="body" style={{ marginTop: 10, color: AppColors.gray400 }}>جاري تحميل الخريطة...</ThemedText>
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
        {placeNameText ? (
          <View style={styles.placeNameRow}>
            <View style={styles.placeNameBadge}>
              <Feather name="navigation" size={14} color={AppColors.white} />
            </View>
            <ThemedText type="body" style={styles.placeNameValue}>{placeNameText}</ThemedText>
          </View>
        ) : null}

        <View style={styles.addressRow}>
          <View style={styles.addressIcon}>
            <Feather name="map-pin" size={20} color={AppColors.primary} />
          </View>
          <View style={styles.addressContent}>
            <ThemedText type="small" style={styles.addressLabel}>العنوان المحدد</ThemedText>
            {loadingAddress ? (
              <ActivityIndicator size="small" color={AppColors.primary} />
            ) : (
              <TextInput
                value={addressText}
                onChangeText={setAddressText}
                placeholder="اكتب عنوانك هنا (مثال: قرب أسوق دزني)"
                placeholderTextColor={AppColors.gray400}
                style={styles.addressInput}
                textAlign="right"
                multiline
                numberOfLines={2}
              />
            )}
          </View>
        </View>

        <Pressable style={styles.confirmButton} onPress={handleConfirm}>
          <Feather name="check" size={20} color={AppColors.black} />
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
    backgroundColor: AppColors.gray50,
    alignItems: "center",
    justifyContent: "center",
  },
  myLocationBtn: {
    position: "absolute",
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: AppColors.white,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: AppColors.black,
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
    backgroundColor: AppColors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    shadowColor: AppColors.black,
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 10,
  },
  placeNameRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    marginBottom: 12,
    gap: 10,
    backgroundColor: AppColors.secondary,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: AppColors.secondary,
  },
  placeNameBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: AppColors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  placeNameValue: {
    flex: 1,
    fontWeight: FontWeight.bold,
    fontSize: 12,
    color: AppColors.gray700,
    textAlign: "right",
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
    backgroundColor: AppColors.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
  addressContent: {
    flex: 1,
    alignItems: "flex-end",
  },
  addressLabel: {
    color: AppColors.gray400,
    marginBottom: 2,
  },
  addressValue: {
    fontWeight: FontWeight.semiBold,
    textAlign: "right",
  },
  addressInput: {
    fontWeight: FontWeight.semiBold,
    textAlign: "right",
    color: AppColors.gray700,
    fontSize: 13,
    paddingVertical: 2,
    width: "100%",
  },
  confirmButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: AppColors.primary,
    borderRadius: 14,
    height: 52,
    gap: 8,
  },
  confirmText: {
    fontWeight: FontWeight.bold,
    color: AppColors.black,
    fontSize: 13,
  },
});
