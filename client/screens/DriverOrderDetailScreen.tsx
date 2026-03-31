import React from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  Linking,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { WebView } from "react-native-webview";

import { ThemedText } from "@/components/ThemedText";
import { GradientBackground } from "@/components/GradientBackground";
import { useTheme } from "@/hooks/useTheme";
import { AppColors, Spacing, BorderRadius, Shadows } from "@/constants/theme";
import { formatPrice } from "@/constants/currency";

function getMiniMapHTML(lat: number, lng: number, label: string) {
  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
*{margin:0;padding:0;}
html,body{width:100%;height:100%;overflow:hidden;}
#map{width:100%;height:100%;}
.leaflet-control-attribution,.leaflet-control-zoom{display:none!important;}
.pin-marker{width:36px;height:36px;position:relative;}
.pin-dot{width:36px;height:36px;border-radius:50% 50% 50% 0;background:#E86520;transform:rotate(-45deg);position:absolute;border:3px solid #fff;box-shadow:0 3px 10px rgba(255,118,34,0.4);}
.pin-dot::after{content:'';width:12px;height:12px;border-radius:50%;background:#fff;position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);}
.pulse{width:50px;height:50px;border-radius:50%;background:rgba(255,118,34,0.2);position:absolute;left:-7px;top:-7px;animation:p 2s ease-out infinite;}
@keyframes p{0%{transform:scale(0.5);opacity:1;}100%{transform:scale(1.4);opacity:0;}}
.pin-tooltip{background:#E86520!important;color:#fff!important;border:none!important;border-radius:8px!important;padding:4px 10px!important;font-size:12px!important;font-weight:700!important;box-shadow:0 2px 8px rgba(255,118,34,0.3)!important;direction:rtl!important;white-space:nowrap!important;}
.pin-tooltip::before{border-top-color:#E86520!important;}
.open-btn{position:absolute;bottom:10px;left:50%;transform:translateX(-50%);background:#E86520;color:#fff;border:none;border-radius:20px;padding:8px 20px;font-size:13px;font-weight:700;box-shadow:0 3px 12px rgba(255,118,34,0.4);cursor:pointer;z-index:1000;display:flex;align-items:center;gap:6px;direction:rtl;font-family:'Segoe UI',Tahoma,sans-serif;}
</style>
</head><body>
<div id="map"></div>
<button class="open-btn" onclick="window.ReactNativeWebView.postMessage('openMaps')">
<svg width="16" height="16" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
افتح بالخرائط
</button>
<script>
var map=L.map('map',{center:[${lat},${lng}],zoom:16,zoomControl:false,attributionControl:false,dragging:false,scrollWheelZoom:false,doubleClickZoom:false,touchZoom:false});
L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=ar',{maxZoom:20}).addTo(map);
var icon=L.divIcon({className:'pin-marker',html:'<div class="pulse"></div><div class="pin-dot"></div>',iconSize:[36,36],iconAnchor:[18,36]});
var mk=L.marker([${lat},${lng}],{icon:icon}).addTo(map);
${label ? `mk.bindTooltip("${label.replace(/"/g, '\\"')}",{permanent:true,direction:'top',offset:[0,-40],className:'pin-tooltip'}).openTooltip();` : ''}
</script>
</body></html>`;
}

interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
}

interface OrderDetail {
  id: string;
  customerName: string;
  customerPhone: string;
  address: string;
  region: string;
  items: OrderItem[];
  total: number;
  deliveryFee: number;
  status: string;
  createdAt: string;
  notes?: string;
  orderType?: string;
  latitude?: number;
  longitude?: number;
}

export default function DriverOrderDetailScreen() {
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<{ params: { order: OrderDetail } }, "params">>();
  const order = route.params?.order;

  if (!order) {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot, justifyContent: "center", alignItems: "center" }]}>
        <Feather name="alert-circle" size={40} color={theme.textSecondary} />
        <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: Spacing.md }}>
          لا توجد بيانات للطلب
        </ThemedText>
      </View>
    );
  }

  const handleCallCustomer = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const phoneUrl = Platform.OS === "android"
      ? `tel:${order.customerPhone}`
      : `telprompt:${order.customerPhone}`;
    Linking.openURL(phoneUrl).catch(() => {
      Linking.openURL(`tel:${order.customerPhone}`).catch(console.error);
    });
  };

  const openInMaps = () => {
    if (!order.latitude || !order.longitude) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const lat = order.latitude;
    const lng = order.longitude;
    const label = encodeURIComponent(order.customerName || "موقع الزبون");
    const url = Platform.select({
      ios: `maps:0,0?q=${label}@${lat},${lng}`,
      android: `geo:0,0?q=${lat},${lng}(${label})`,
      default: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
    });
    if (url) {
      Linking.openURL(url).catch(() => {
        Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`).catch(console.error);
      });
    }
  };

  const statusLabel: Record<string, string> = {
    pending: "قيد الانتظار",
    confirmed: "تم التأكيد",
    preparing: "جاري التحضير",
    delivering: "جاري التوصيل",
    delivered: "تم التوصيل",
    cancelled: "ملغي",
  };

  const statusColor: Record<string, string> = {
    pending: "#FF9800",
    confirmed: "#3B82F6",
    preparing: "#8B5CF6",
    delivering: "#2196F3",
    delivered: "#4CAF50",
    cancelled: "#F44336",
  };

  const orderTotal = (order.total || 0) + (order.deliveryFee || 0);

  return (
    <View style={[styles.container]}>
      <GradientBackground />
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm, backgroundColor: AppColors.primary }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} testID="button-back">
          <Feather name="arrow-right" size={24} color="#FFFFFF" />
        </Pressable>
        <ThemedText type="h3" style={styles.headerTitle}>تفاصيل الطلب</ThemedText>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.statusBanner, { backgroundColor: (statusColor[order.status] || "#9E9E9E") + "15" }]}>
          <ThemedText type="h4" style={{ color: statusColor[order.status] || "#9E9E9E", fontWeight: "700" }}>
            {statusLabel[order.status] || order.status}
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 2 }}>
            #{order.id?.slice(-6)}
          </ThemedText>
        </View>

        <View style={[styles.card, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
          <View style={styles.cardHeader}>
            <Feather name="user" size={20} color={AppColors.primary} />
            <ThemedText type="h4" style={{ color: theme.text, fontWeight: "700" }}>بيانات الزبون</ThemedText>
          </View>

          <View style={styles.infoRow}>
            <ThemedText type="body" style={{ color: theme.text }}>{order.customerName || "زبون"}</ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>الاسم</ThemedText>
          </View>

          <View style={styles.infoRow}>
            <ThemedText type="body" style={{ color: theme.text, writingDirection: "ltr" }}>{order.customerPhone}</ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>رقم الهاتف</ThemedText>
          </View>

          <View style={styles.infoRow}>
            <ThemedText type="body" style={{ color: theme.text }}>{order.region}</ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>المنطقة</ThemedText>
          </View>

          <View style={styles.infoRow}>
            <ThemedText type="body" style={{ color: theme.text }}>{order.address}</ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>العنوان</ThemedText>
          </View>

          <Pressable
            style={styles.callButton}
            onPress={handleCallCustomer}
            testID="button-call-customer"
          >
            <Feather name="phone" size={20} color="#FFFFFF" />
            <ThemedText type="h4" style={styles.callButtonText}>اتصال بالزبون</ThemedText>
          </Pressable>
        </View>

        {(order.latitude && order.longitude) ? (
          <View style={[styles.card, { backgroundColor: theme.backgroundDefault, padding: 0, overflow: "hidden" }, Shadows.sm]}>
            <View style={styles.mapCardHeader}>
              <Feather name="map" size={20} color={AppColors.primary} />
              <ThemedText type="h4" style={{ color: theme.text, fontWeight: "700", flex: 1 }}>موقع التوصيل</ThemedText>
              <Pressable
                style={styles.openMapsBtn}
                onPress={openInMaps}
                testID="button-open-maps"
              >
                <Feather name="external-link" size={14} color={AppColors.primary} />
                <ThemedText type="small" style={{ color: AppColors.primary, fontWeight: "600" }}>افتح بالخرائط</ThemedText>
              </Pressable>
            </View>
            <View style={styles.mapCardAddress}>
              <Feather name="map-pin" size={14} color={AppColors.primary} />
              <ThemedText type="small" style={{ color: theme.textSecondary, flex: 1, textAlign: "right" }}>
                {order.address || order.region}
              </ThemedText>
            </View>
            <Pressable onPress={openInMaps} testID="button-map-preview">
              <View style={styles.miniMapContainer}>
                <WebView
                  source={{ html: getMiniMapHTML(order.latitude!, order.longitude!, order.customerName || "") }}
                  style={styles.miniMap}
                  scrollEnabled={false}
                  javaScriptEnabled
                  domStorageEnabled
                  onMessage={(event) => {
                    if (event.nativeEvent.data === "openMaps") {
                      openInMaps();
                    }
                  }}
                />
              </View>
            </Pressable>
          </View>
        ) : null}

        <View style={[styles.card, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
          <View style={styles.cardHeader}>
            <Feather name="shopping-bag" size={20} color={AppColors.primary} />
            <ThemedText type="h4" style={{ color: theme.text, fontWeight: "700" }}>ملخص الطلب</ThemedText>
          </View>

          {order.orderType ? (
            <View style={[styles.orderTypeBadge, { backgroundColor: AppColors.primary + "15" }]}>
              <ThemedText type="small" style={{ color: AppColors.primary, fontWeight: "600" }}>
                {order.orderType === "delivery" ? "توصيل" : order.orderType}
              </ThemedText>
            </View>
          ) : null}

          <View style={[styles.tableHeader, { borderBottomColor: theme.border }]}>
            <ThemedText type="small" style={[styles.tableHeaderText, { color: theme.textSecondary, flex: 1 }]}>المجموع</ThemedText>
            <ThemedText type="small" style={[styles.tableHeaderText, { color: theme.textSecondary, width: 40, textAlign: "center" }]}>العدد</ThemedText>
            <ThemedText type="small" style={[styles.tableHeaderText, { color: theme.textSecondary, flex: 1, textAlign: "center" }]}>السعر</ThemedText>
            <ThemedText type="small" style={[styles.tableHeaderText, { color: theme.textSecondary, flex: 2, textAlign: "right" }]}>المنتج</ThemedText>
          </View>

          {(order.items || []).map((item, index) => (
            <View
              key={item.id || `item-${index}`}
              style={[styles.tableRow, { borderBottomColor: theme.border }]}
            >
              <ThemedText type="body" style={[styles.tableCell, { flex: 1, fontWeight: "600", color: AppColors.primary }]}>
                {formatPrice(item.price * item.quantity)}
              </ThemedText>
              <ThemedText type="body" style={[styles.tableCell, { width: 40, textAlign: "center", color: theme.text }]}>
                {item.quantity}
              </ThemedText>
              <ThemedText type="body" style={[styles.tableCell, { flex: 1, textAlign: "center", color: theme.textSecondary }]}>
                {formatPrice(item.price)}
              </ThemedText>
              <ThemedText type="body" style={[styles.tableCell, { flex: 2, textAlign: "right", color: theme.text, fontWeight: "500" }]}>
                {item.name}
              </ThemedText>
            </View>
          ))}

          <View style={[styles.totalSection, { borderTopColor: theme.border }]}>
            <View style={styles.totalRow}>
              <ThemedText type="body" style={{ color: theme.text }}>{formatPrice(order.total || 0)}</ThemedText>
              <ThemedText type="body" style={{ color: theme.textSecondary }}>المنتجات</ThemedText>
            </View>
            <View style={styles.totalRow}>
              <ThemedText type="body" style={{ color: theme.text }}>{formatPrice(order.deliveryFee || 0)}</ThemedText>
              <ThemedText type="body" style={{ color: theme.textSecondary }}>أجرة التوصيل</ThemedText>
            </View>
            <View style={[styles.totalRow, styles.grandTotalRow]}>
              <ThemedText type="h3" style={{ color: AppColors.primary, fontWeight: "800" }}>
                {formatPrice(orderTotal)}
              </ThemedText>
              <ThemedText type="h4" style={{ color: theme.text, fontWeight: "700" }}>المجموع الكلي</ThemedText>
            </View>
          </View>
        </View>

        {order.notes ? (
          <View style={[styles.card, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
            <View style={styles.cardHeader}>
              <Feather name="file-text" size={20} color={AppColors.primary} />
              <ThemedText type="h4" style={{ color: theme.text, fontWeight: "700" }}>ملاحظات</ThemedText>
            </View>
            <ThemedText type="body" style={{ color: theme.text, lineHeight: 24 }}>
              {order.notes}
            </ThemedText>
          </View>
        ) : null}

        <View style={[styles.card, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
          <View style={styles.cardHeader}>
            <Feather name="clock" size={20} color={AppColors.primary} />
            <ThemedText type="h4" style={{ color: theme.text, fontWeight: "700" }}>معلومات إضافية</ThemedText>
          </View>
          <View style={styles.infoRow}>
            <ThemedText type="body" style={{ color: theme.text }}>
              {order.createdAt ? new Date(order.createdAt).toLocaleDateString("ar-IQ", {
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              }) : "غير محدد"}
            </ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>تاريخ الطلب</ThemedText>
          </View>
          <View style={styles.infoRow}>
            <ThemedText type="body" style={{ color: theme.text }}>{order.items?.length || 0} منتج</ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>عدد المنتجات</ThemedText>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  headerTitle: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  statusBanner: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    alignItems: "center",
  },
  card: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
  },
  cardHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  infoRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  callButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "#4CAF50",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.md,
  },
  mapCardHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xs,
  },
  mapCardAddress: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  openMapsBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
    backgroundColor: AppColors.primary + "15",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  miniMapContainer: {
    height: 200,
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
  },
  miniMap: {
    flex: 1,
  },
  callButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  orderTypeBadge: {
    alignSelf: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: Spacing.md,
  },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: Spacing.sm,
    borderBottomWidth: 2,
    marginBottom: Spacing.xs,
  },
  tableHeaderText: {
    fontWeight: "700",
    fontSize: 12,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    alignItems: "center",
  },
  tableCell: {
    fontSize: 13,
  },
  totalSection: {
    borderTopWidth: 2,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    gap: Spacing.sm,
  },
  totalRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
  },
  grandTotalRow: {
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
    paddingTop: Spacing.md,
    marginTop: Spacing.sm,
  },
});
