import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  Dispatch,
  SetStateAction,
  ReactNode,
} from "react";
import { View, StyleSheet, Pressable, Modal, Platform } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import * as Haptics from "expo-haptics";
import { io, Socket } from "socket.io-client";

import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";
import { getApiUrl } from "@/lib/query-client";
import { playRepeatingAlert, stopAlert } from "@/lib/alertSound";

const ORANGE = "#E86520";
const POLL_INTERVAL_MS = 20_000;

interface NewOrderPopup {
  orderId: string;
  orderNumber: string;
  customerName: string;
  total: number;
  itemCount: number;
}

interface VendorNotificationsContextType {
  unreadCount: number;
  setUnreadCount: Dispatch<SetStateAction<number>>;
  newOrderPopup: NewOrderPopup | null;
  dismissNewOrderPopup: () => void;
}

const VendorNotificationsContext = createContext<VendorNotificationsContextType>({
  unreadCount: 0,
  setUnreadCount: () => {},
  newOrderPopup: null,
  dismissNewOrderPopup: () => {},
});

export function VendorNotificationsProvider({ children }: { children: ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [newOrderPopup, setNewOrderPopup] = useState<NewOrderPopup | null>(null);
  const { vendorToken } = useAuth();

  const lastSeenOrderIds = useRef<Set<string>>(new Set());
  const isFirstLoad = useRef(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const dismissNewOrderPopup = useCallback(() => {
    stopAlert(); // vendor acknowledged the new order → silence the repeating alarm
    setNewOrderPopup(null);
  }, []);

  const checkNewOrders = useCallback(async () => {
    if (!vendorToken) return;
    try {
      const res = await fetch(new URL("/api/vendor/orders", getApiUrl()).toString(), {
        headers: { Authorization: `Bearer ${vendorToken}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const orders: any[] = data.orders ?? [];
      const pendingOrders = orders.filter((o: any) => o.status === "pending");

      if (isFirstLoad.current) {
        for (const o of pendingOrders) lastSeenOrderIds.current.add(o.id);
        isFirstLoad.current = false;
        return;
      }

      const newOrders = pendingOrders.filter((o: any) => !lastSeenOrderIds.current.has(o.id));
      for (const o of pendingOrders) lastSeenOrderIds.current.add(o.id);

      if (newOrders.length > 0) {
        const latest = newOrders[0];
        const items: any[] = Array.isArray(latest.items) ? latest.items : [];
        const total = latest.vendorSubtotal ?? latest.restaurantSubtotal ?? latest.total ?? 0;
        setNewOrderPopup({
          orderId: latest.id,
          orderNumber: latest.id.slice(-6).toUpperCase(),
          customerName: latest.customerName || latest.customerPhone || "زبون",
          total,
          itemCount: items.length,
        });
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        }
        playRepeatingAlert();
      }
    } catch {}
  }, [vendorToken]);

  useEffect(() => {
    if (!vendorToken) return;
    isFirstLoad.current = true;
    lastSeenOrderIds.current = new Set();
    checkNewOrders();
    pollRef.current = setInterval(checkNewOrders, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [vendorToken, checkNewOrders]);

  // Real-time: when the server broadcasts an order change (new order or status
  // change), re-check immediately instead of waiting up to 20s. The poll above
  // stays as a fallback. Additive only.
  const socketRef = useRef<Socket | null>(null);
  useEffect(() => {
    if (!vendorToken) return;
    const sock = io(getApiUrl(), {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 3000,
    });
    socketRef.current = sock;
    sock.on("orders:changed", () => { checkNewOrders(); });
    return () => {
      sock.disconnect();
      socketRef.current = null;
    };
  }, [vendorToken, checkNewOrders]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    Notifications.setBadgeCountAsync(unreadCount).catch(() => {});
  }, [unreadCount]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const subscription = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data as Record<string, unknown> | undefined;
      if (!data) return;
      const type = data.type as string | undefined;
      if (type === "vendor_product" || type === "vendor_status") {
        const serverCount = data.unreadCount;
        if (typeof serverCount === "number") {
          setUnreadCount(serverCount);
        }
      }
    });
    return () => subscription.remove();
  }, []);

  return (
    <VendorNotificationsContext.Provider value={{ unreadCount, setUnreadCount, newOrderPopup, dismissNewOrderPopup }}>
      {children}
      {newOrderPopup ? (
        <NewOrderPopupModal popup={newOrderPopup} onDismiss={dismissNewOrderPopup} />
      ) : null}
    </VendorNotificationsContext.Provider>
  );
}

export function useVendorNotifications() {
  return useContext(VendorNotificationsContext);
}

function NewOrderPopupModal({
  popup,
  onDismiss,
}: {
  popup: NewOrderPopup;
  onDismiss: () => void;
}) {
  return (
    <Modal transparent visible animationType="slide" onRequestClose={onDismiss}>
      <View style={popupStyles.overlay}>
        <View style={popupStyles.sheet}>
          <View style={popupStyles.header}>
            <View style={popupStyles.bellCircle}>
              <MaterialCommunityIcons name="bell-ring" size={28} color={ORANGE} />
            </View>
            <ThemedText style={popupStyles.title}>طلب جديد وصل</ThemedText>
            <ThemedText style={popupStyles.orderNum}>#{popup.orderNumber}</ThemedText>
          </View>

          <View style={popupStyles.infoBox}>
            <View style={popupStyles.infoRow}>
              <MaterialCommunityIcons name="account" size={18} color="#6B7280" />
              <ThemedText style={popupStyles.infoText}>{popup.customerName}</ThemedText>
            </View>
            <View style={popupStyles.infoRow}>
              <MaterialCommunityIcons name="food" size={18} color="#6B7280" />
              <ThemedText style={popupStyles.infoText}>{popup.itemCount} منتج</ThemedText>
            </View>
            <View style={popupStyles.infoRow}>
              <MaterialCommunityIcons name="cash-multiple" size={18} color={ORANGE} />
              <ThemedText style={[popupStyles.infoText, { color: ORANGE, fontFamily: "Cairo_700Bold" }]}>
                {popup.total.toLocaleString("ar-IQ")} د.ع
              </ThemedText>
            </View>
          </View>

          <Pressable style={popupStyles.viewBtn} onPress={onDismiss} testID="btn-new-order-popup-view">
            <ThemedText style={popupStyles.viewBtnText}>عرض الطلبات</ThemedText>
          </Pressable>
          <Pressable style={popupStyles.dismissBtn} onPress={onDismiss} testID="btn-new-order-popup-dismiss">
            <ThemedText style={popupStyles.dismissBtnText}>إغلاق</ThemedText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const popupStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
    gap: 14,
  },
  header: {
    alignItems: "center",
    gap: 6,
    paddingBottom: 4,
  },
  bellCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#FFF0E6",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: {
    fontFamily: "Cairo_700Bold",
    fontSize: 20,
    textAlign: "center",
  },
  orderNum: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: "#9CA3AF",
    textAlign: "center",
  },
  infoBox: {
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    padding: 14,
    gap: 10,
  },
  infoRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
  },
  infoText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    color: "#374151",
    textAlign: "right",
  },
  viewBtn: {
    backgroundColor: ORANGE,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  viewBtnText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 15,
    color: "#fff",
  },
  dismissBtn: {
    backgroundColor: "#F3F4F6",
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  dismissBtnText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    color: "#6B7280",
  },
});
