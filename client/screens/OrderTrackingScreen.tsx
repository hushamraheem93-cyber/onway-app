import React, { useEffect, useState, useCallback, useRef } from "react";
import { StyleSheet, View, ScrollView, ActivityIndicator, Pressable, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { WebView } from "react-native-webview";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
} from "react-native-reanimated";

import { useTheme } from "@/hooks/useTheme";
import { ThemedText } from "@/components/ThemedText";
import { Spacing, BorderRadius, AppColors, Shadows } from "@/constants/theme";
import { formatPrice } from "@/constants/currency";
import { Button } from "@/components/Button";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { useOrders, Order } from "@/context/OrderContext";
import { getApiUrl } from "@/lib/query-client";
import { GradientBackground } from "@/components/GradientBackground";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RouteProps = RouteProp<RootStackParamList, "OrderTracking">;

const STEPS: { key: Order["status"]; label: string; icon: keyof typeof Feather.glyphMap; description: string }[] = [
  { key: "pending", label: "قيد الانتظار", icon: "clock", description: "تم استلام طلبك وبانتظار التأكيد" },
  { key: "confirmed", label: "تم التأكيد", icon: "check-circle", description: "تم تأكيد طلبك من قبل المتجر" },
  { key: "preparing", label: "جاري التحضير", icon: "package", description: "يتم الآن تحضير طلبك" },
  { key: "delivering", label: "في الطريق", icon: "truck", description: "المندوب في طريقه إليك" },
  { key: "delivered", label: "تم التوصيل", icon: "home", description: "تم توصيل طلبك بنجاح!" },
];

const statusOrder: Order["status"][] = ["pending", "confirmed", "preparing", "delivering", "delivered"];

function getStepIndex(status: Order["status"]): number {
  if (status === "cancelled") return -1;
  return statusOrder.indexOf(status);
}

function PulsingDot() {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.3, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View style={[styles.pulsingDot, animatedStyle]}>
      <View style={styles.pulsingDotInner} />
    </Animated.View>
  );
}

function getTrackingMapHTML(driverLat: number, driverLng: number, customerLat?: number, customerLng?: number) {
  const centerLat = driverLat;
  const centerLng = driverLng;
  const customerMarkerJS = customerLat && customerLng
    ? `
      var customerIcon = L.divIcon({
        className: '',
        html: '<div style="width:36px;height:36px;background:#E86520;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 3px 10px rgba(232,101,32,0.5);"></div>',
        iconSize: [36, 36],
        iconAnchor: [18, 36],
      });
      var customerMarker = L.marker([${customerLat}, ${customerLng}], { icon: customerIcon })
        .addTo(map)
        .bindPopup('<b style="font-family:sans-serif">موقع التوصيل</b>');
    `
    : "";

  return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #f0f0f0; }
    #map { width: 100%; height: 100%; }
    .leaflet-control-attribution { display: none !important; }
    .leaflet-control-zoom {
      border: none !important;
      box-shadow: 0 2px 12px rgba(0,0,0,0.18) !important;
      border-radius: 12px !important;
      overflow: hidden;
      left: 12px !important;
      right: auto !important;
    }
    .leaflet-control-zoom a {
      width: 38px !important; height: 38px !important;
      line-height: 38px !important; font-size: 18px !important;
      color: #333 !important; background: #fff !important;
      border: none !important;
    }
    .driver-pulse {
      width: 48px; height: 48px;
      position: relative;
      display: flex; align-items: center; justify-content: center;
    }
    .driver-pulse::before {
      content: '';
      position: absolute;
      width: 48px; height: 48px;
      border-radius: 50%;
      background: rgba(232,101,32,0.25);
      animation: pulse 1.8s ease-out infinite;
    }
    .driver-inner {
      width: 30px; height: 30px;
      background: #E86520;
      border-radius: 50%;
      border: 3px solid #fff;
      box-shadow: 0 2px 10px rgba(232,101,32,0.6);
      display: flex; align-items: center; justify-content: center;
      position: relative; z-index: 1;
    }
    @keyframes pulse {
      0% { transform: scale(0.5); opacity: 1; }
      100% { transform: scale(2); opacity: 0; }
    }
    .info-pill {
      position: absolute;
      bottom: 12px; left: 50%; transform: translateX(-50%);
      background: rgba(255,255,255,0.95);
      border-radius: 24px;
      padding: 8px 20px;
      font-family: sans-serif;
      font-size: 13px;
      color: #333;
      box-shadow: 0 2px 12px rgba(0,0,0,0.15);
      white-space: nowrap;
      z-index: 1000;
      pointer-events: none;
    }
    .dot { width: 8px; height: 8px; background: #E86520; border-radius: 50%; display: inline-block; margin-left: 6px; animation: blink 1.2s ease-in-out infinite; }
    @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0.2; } }
  </style>
</head>
<body>
  <div id="map"></div>
  <div class="info-pill"><span class="dot"></span> المندوب في طريقه إليك</div>
  <script>
    var map = L.map('map', { zoomControl: true, attributionControl: false }).setView([${centerLat}, ${centerLng}], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

    var driverIcon = L.divIcon({
      className: '',
      html: '<div class="driver-pulse"><div class="driver-inner"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg></div></div>',
      iconSize: [48, 48],
      iconAnchor: [24, 24],
    });

    var driverMarker = L.marker([${driverLat}, ${driverLng}], { icon: driverIcon }).addTo(map);

    ${customerMarkerJS}

    ${customerLat && customerLng ? `
    var routeLine = null;
    function drawRoute(dLat, dLng, cLat, cLng) {
      if (routeLine) map.removeLayer(routeLine);
      routeLine = L.polyline([[dLat, dLng], [cLat, cLng]], {
        color: '#E86520',
        weight: 3,
        opacity: 0.6,
        dashArray: '8, 8',
      }).addTo(map);
    }
    drawRoute(${driverLat}, ${driverLng}, ${customerLat}, ${customerLng});
    ` : ""}

    function updateDriverLocation(lat, lng) {
      var newLatLng = L.latLng(lat, lng);
      driverMarker.setLatLng(newLatLng);
      map.panTo(newLatLng, { animate: true, duration: 0.8 });
      ${customerLat && customerLng ? `drawRoute(lat, lng, ${customerLat}, ${customerLng});` : ""}
    }

    document.addEventListener('message', function(e) {
      try {
        var data = JSON.parse(e.data);
        if (data.type === 'updateDriver') updateDriverLocation(data.lat, data.lng);
      } catch(err) {}
    });
    window.addEventListener('message', function(e) {
      try {
        var data = JSON.parse(e.data);
        if (data.type === 'updateDriver') updateDriverLocation(data.lat, data.lng);
      } catch(err) {}
    });
  </script>
</body>
</html>`;
}

export default function OrderTrackingScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { orders, refreshOrders } = useOrders();
  const [refreshing, setRefreshing] = useState(false);
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number; fullName: string } | null>(null);
  const [mapHtml, setMapHtml] = useState<string | null>(null);
  const webViewRef = useRef<WebView>(null);
  const mapInitializedRef = useRef(false);

  const orderId = route.params?.orderId;
  const order = orders.find((o) => o.id === orderId);

  const fetchDriverLocation = useCallback(async () => {
    if (!orderId) return;
    try {
      const url = new URL(`/api/orders/${orderId}/driver-location`, getApiUrl()).toString();
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      if (!data.available) return;

      setDriverLocation({ lat: data.lat, lng: data.lng, fullName: data.fullName });

      if (!mapInitializedRef.current) {
        mapInitializedRef.current = true;
        setMapHtml(getTrackingMapHTML(
          data.lat, data.lng,
          order?.latitude, order?.longitude
        ));
      } else if (webViewRef.current) {
        webViewRef.current.injectJavaScript(
          `updateDriverLocation(${data.lat}, ${data.lng}); true;`
        );
      }
    } catch {}
  }, [orderId, order?.latitude, order?.longitude]);

  useEffect(() => {
    const interval = setInterval(() => {
      refreshOrders();
    }, 10000);
    return () => clearInterval(interval);
  }, [refreshOrders]);

  useEffect(() => {
    if (order?.status === "delivering") {
      fetchDriverLocation();
      const interval = setInterval(fetchDriverLocation, 10000);
      return () => clearInterval(interval);
    } else {
      setDriverLocation(null);
      setMapHtml(null);
      mapInitializedRef.current = false;
    }
  }, [order?.status, fetchDriverLocation]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshOrders();
    if (order?.status === "delivering") await fetchDriverLocation();
    setRefreshing(false);
  }, [refreshOrders, fetchDriverLocation, order?.status]);

  if (!order) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.backgroundRoot }]}>
        <ActivityIndicator size="large" color={AppColors.primary} />
        <ThemedText type="body" style={{ marginTop: Spacing.md }}>جاري تحميل بيانات الطلب...</ThemedText>
      </View>
    );
  }

  const currentStepIndex = getStepIndex(order.status);
  const isCancelled = order.status === "cancelled";
  const isDelivering = order.status === "delivering";

  const formatTime = (date: string) => {
    const d = new Date(date);
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  };

  const formatDate = (date: string) => {
    const d = new Date(date);
    return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}`;
  };

  return (
    <View style={{ flex: 1 }}>
      <GradientBackground />
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingBottom: insets.bottom + Spacing["3xl"],
        paddingHorizontal: Spacing.lg,
      }}
    >
      <View style={[styles.orderHeader, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
        <View style={styles.headerRow}>
          <View style={styles.headerInfo}>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>رقم الطلب</ThemedText>
            <ThemedText type="h4" style={{ marginTop: 2 }}>{order.id?.slice(-8) || order.id}</ThemedText>
          </View>
          <View style={[styles.statusChip, {
            backgroundColor: isCancelled ? "#FEE2E2" : currentStepIndex >= 4 ? "#D1FAE5" : AppColors.primary + "15",
          }]}>
            <ThemedText type="small" style={{
              color: isCancelled ? "#EF4444" : currentStepIndex >= 4 ? "#10B981" : AppColors.primary,
              fontWeight: "700",
            }}>
              {isCancelled ? "ملغي" : STEPS[Math.min(currentStepIndex, 4)]?.label}
            </ThemedText>
          </View>
        </View>

        <View style={[styles.headerDetails, { borderTopColor: theme.border }]}>
          <View style={styles.detailItem}>
            <Feather name="map-pin" size={14} color={theme.textSecondary} />
            <ThemedText type="small" style={{ color: theme.textSecondary, marginRight: 4 }}>
              {order.region}
            </ThemedText>
          </View>
          <View style={styles.detailItem}>
            <Feather name="calendar" size={14} color={theme.textSecondary} />
            <ThemedText type="small" style={{ color: theme.textSecondary, marginRight: 4 }}>
              {formatDate(order.createdAt)} - {formatTime(order.createdAt)}
            </ThemedText>
          </View>
          <View style={styles.detailItem}>
            <Feather name="shopping-bag" size={14} color={theme.textSecondary} />
            <ThemedText type="small" style={{ color: theme.textSecondary, marginRight: 4 }}>
              {formatPrice(order.total + order.deliveryFee)}
            </ThemedText>
          </View>
        </View>
      </View>

      {isDelivering ? (
        <View style={[styles.mapCard, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
          <View style={styles.mapHeader}>
            <View style={styles.mapLiveBadge}>
              <View style={styles.liveDot} />
              <ThemedText type="small" style={styles.liveText}>مباشر</ThemedText>
            </View>
            <View style={styles.mapTitleRow}>
              <Feather name="truck" size={18} color={AppColors.primary} />
              <ThemedText type="h4" style={styles.mapTitle}>تتبع المندوب</ThemedText>
            </View>
          </View>

          {Platform.OS === "web" ? (
            <View style={styles.webFallback}>
              <Feather name="smartphone" size={36} color={AppColors.primary} />
              <ThemedText type="body" style={styles.webFallbackText}>
                افتح التطبيق عبر Expo Go لمتابعة موقع المندوب على الخارطة
              </ThemedText>
            </View>
          ) : mapHtml ? (
            <WebView
              ref={webViewRef}
              source={{ html: mapHtml }}
              style={styles.mapView}
              scrollEnabled={false}
              javaScriptEnabled
              originWhitelist={["*"]}
            />
          ) : (
            <View style={styles.mapLoading}>
              <ActivityIndicator size="large" color={AppColors.primary} />
              <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: Spacing.md }}>
                جاري تحديد موقع المندوب...
              </ThemedText>
            </View>
          )}

          {driverLocation ? (
            <View style={[styles.driverInfoBar, { borderTopColor: theme.border }]}>
              <View style={styles.driverInfoRow}>
                <View style={[styles.driverAvatar, { backgroundColor: AppColors.primary + "20" }]}>
                  <Feather name="user" size={16} color={AppColors.primary} />
                </View>
                <View style={styles.driverInfoText}>
                  <ThemedText type="small" style={{ color: theme.textSecondary }}>المندوب</ThemedText>
                  <ThemedText type="body" style={{ fontWeight: "600" }}>
                    {driverLocation.fullName || "المندوب"}
                  </ThemedText>
                </View>
                <View style={styles.driverStatus}>
                  <View style={styles.statusDot} />
                  <ThemedText type="small" style={{ color: "#10B981", fontWeight: "600" }}>في الطريق</ThemedText>
                </View>
              </View>
            </View>
          ) : null}
        </View>
      ) : null}

      {isCancelled ? (
        <View style={[styles.cancelledCard, Shadows.sm]}>
          <View style={styles.cancelledIcon}>
            <Feather name="x-circle" size={40} color="#EF4444" />
          </View>
          <ThemedText type="h3" style={styles.cancelledTitle}>تم إلغاء الطلب</ThemedText>
          <ThemedText type="body" style={styles.cancelledDesc}>
            نأسف لإعلامك أنه تم إلغاء هذا الطلب. يمكنك تقديم طلب جديد في أي وقت.
          </ThemedText>
        </View>
      ) : (
        <View style={[styles.timelineCard, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
          <ThemedText type="h4" style={styles.timelineTitle}>مراحل الطلب</ThemedText>

          {STEPS.map((step, index) => {
            const isCompleted = index <= currentStepIndex;
            const isCurrent = index === currentStepIndex;
            const isLast = index === STEPS.length - 1;

            return (
              <View key={step.key} style={styles.stepRow}>
                <View style={styles.stepIndicator}>
                  {isCompleted ? (
                    <View style={[styles.stepCircle, styles.stepCompleted]}>
                      {isCurrent && currentStepIndex < 4 ? (
                        <PulsingDot />
                      ) : (
                        <Feather name="check" size={14} color="#FFFFFF" />
                      )}
                    </View>
                  ) : (
                    <View style={[styles.stepCircle, styles.stepPending, { borderColor: theme.border }]}>
                      <View style={[styles.stepDotInner, { backgroundColor: theme.border }]} />
                    </View>
                  )}
                  {!isLast ? (
                    <View style={[
                      styles.stepLine,
                      { backgroundColor: index < currentStepIndex ? AppColors.primary : theme.border },
                    ]} />
                  ) : null}
                </View>

                <View style={[styles.stepContent, !isLast && { paddingBottom: Spacing.xl }]}>
                  <View style={styles.stepHeader}>
                    <Feather
                      name={step.icon as any}
                      size={18}
                      color={isCompleted ? AppColors.primary : theme.textSecondary}
                    />
                    <ThemedText
                      type="body"
                      style={[
                        styles.stepLabel,
                        { color: isCompleted ? theme.text : theme.textSecondary },
                        isCurrent && { fontWeight: "700" },
                      ]}
                    >
                      {step.label}
                    </ThemedText>
                  </View>
                  <ThemedText
                    type="small"
                    style={[
                      styles.stepDesc,
                      { color: isCompleted ? theme.textSecondary : theme.border },
                    ]}
                  >
                    {step.description}
                  </ThemedText>
                </View>
              </View>
            );
          })}
        </View>
      )}

      <View style={[styles.itemsCard, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
        <ThemedText type="h4" style={styles.itemsTitle}>المنتجات ({order.items.length})</ThemedText>
        {order.items.map((item, index) => (
          <View key={index} style={[styles.itemRow, index < order.items.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
            <ThemedText type="body" style={{ color: AppColors.primary, fontWeight: "600" }}>
              {formatPrice(item.price * item.quantity)}
            </ThemedText>
            <View style={styles.itemInfo}>
              <ThemedText type="body" style={{ fontWeight: "500" }}>{item.name}</ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                {item.quantity} × {formatPrice(item.price)}
              </ThemedText>
            </View>
          </View>
        ))}
        <View style={[styles.totalSection, { borderTopColor: theme.border }]}>
          <ThemedText type="body" style={{ color: theme.textSecondary }}>
            التوصيل: {formatPrice(order.deliveryFee)}
          </ThemedText>
          <ThemedText type="h3" style={{ color: AppColors.primary }}>
            {formatPrice(order.total + order.deliveryFee)}
          </ThemedText>
        </View>
      </View>

      <Pressable style={styles.refreshBtn} onPress={handleRefresh}>
        {refreshing ? (
          <ActivityIndicator size="small" color={AppColors.primary} />
        ) : (
          <Feather name="refresh-cw" size={16} color={AppColors.primary} />
        )}
        <ThemedText type="small" style={{ color: AppColors.primary, fontWeight: "600", marginRight: 6 }}>
          تحديث حالة الطلب
        </ThemedText>
      </Pressable>

      <Button onPress={() => navigation.navigate("MainTabs")} style={styles.homeButton}>
        العودة للرئيسية
      </Button>
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  orderHeader: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerInfo: {
    alignItems: "flex-end",
  },
  statusChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: 20,
  },
  headerDetails: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: Spacing.lg,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
  },
  detailItem: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
  },
  mapCard: {
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.lg,
    overflow: "hidden",
  },
  mapHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  mapTitleRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Spacing.sm,
  },
  mapTitle: {
    textAlign: "right",
  },
  mapLiveBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#D1FAE5",
    borderRadius: 12,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 4,
    gap: 4,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#10B981",
  },
  liveText: {
    color: "#10B981",
    fontWeight: "700",
  },
  mapView: {
    height: 260,
    width: "100%",
  },
  mapLoading: {
    height: 260,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F5F5F5",
  },
  webFallback: {
    height: 180,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: AppColors.primary + "08",
    gap: Spacing.md,
    paddingHorizontal: Spacing["2xl"],
  },
  webFallbackText: {
    textAlign: "center",
    color: AppColors.primary,
    fontWeight: "500",
    lineHeight: 22,
  },
  driverInfoBar: {
    borderTopWidth: 1,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  driverInfoRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Spacing.md,
  },
  driverAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  driverInfoText: {
    flex: 1,
    alignItems: "flex-end",
  },
  driverStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#D1FAE5",
    borderRadius: 12,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#10B981",
  },
  timelineCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  timelineTitle: {
    textAlign: "right",
    marginBottom: Spacing.xl,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  stepRow: {
    flexDirection: "row-reverse",
  },
  stepIndicator: {
    alignItems: "center",
    width: 32,
    marginLeft: Spacing.md,
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1,
  },
  stepCompleted: {
    backgroundColor: AppColors.primary,
  },
  stepPending: {
    backgroundColor: "transparent",
    borderWidth: 2,
  },
  stepDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  stepLine: {
    width: 3,
    flex: 1,
    marginTop: -2,
    marginBottom: -2,
    borderRadius: 1.5,
  },
  stepContent: {
    flex: 1,
    paddingTop: 2,
  },
  stepHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Spacing.sm,
  },
  stepLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  stepDesc: {
    textAlign: "right",
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
  },
  pulsingDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  pulsingDotInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#FFFFFF",
  },
  cancelledCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing["2xl"],
    marginBottom: Spacing.lg,
    backgroundColor: "#FEF2F2",
    alignItems: "center",
  },
  cancelledIcon: {
    marginBottom: Spacing.md,
  },
  cancelledTitle: {
    color: "#EF4444",
    marginBottom: Spacing.sm,
  },
  cancelledDesc: {
    color: "#B91C1C",
    textAlign: "center",
    lineHeight: 22,
  },
  itemsCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  itemsTitle: {
    textAlign: "right",
    marginBottom: Spacing.md,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.md,
  },
  itemInfo: {
    alignItems: "flex-end",
    gap: 2,
  },
  totalSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    marginTop: Spacing.sm,
    paddingTop: Spacing.lg,
  },
  refreshBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    marginBottom: Spacing.md,
  },
  homeButton: {
    marginBottom: Spacing.xl,
  },
});
