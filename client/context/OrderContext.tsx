import React, { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { io, Socket } from "socket.io-client";
import { CartItem } from "./CartContext";
import { useAuth } from "./AuthContext";
import { useNotifications } from "./NotificationContext";
import { getApiUrl } from "@/lib/query-client";

const ORDER_STATUSES_KEY = "@onway_order_statuses";

const STATUS_MESSAGES: Record<string, { title: string; body: string }> = {
  confirmed: { title: "تم تأكيد الطلب", body: "تم استلام طلبك وسيتم تحضيره قريباً" },
  preparing: { title: "جاري تحضير الطلب", body: "طلبك الآن قيد التحضير في المتجر" },
  ready: { title: "طلبك جاهز", body: "طلبك جاهز وبانتظار المندوب لاستلامه" },
  picked_up: { title: "المندوب استلم طلبك", body: "المندوب في طريقه إليك الآن" },
  in_delivery: { title: "الطلب في الطريق", body: "المندوب في طريقه إليك. تابع موقعه على الخريطة" },
  delivering: { title: "الطلب في الطريق", body: "تم استلام الطلب من قبل المندوب وهو في طريقه إليك" },
  delivered: { title: "تم التوصيل بنجاح", body: "تم توصيل طلبك بنجاح. شكراً لتسوقك معنا!" },
  cancelled: { title: "تم إلغاء الطلب", body: "نأسف لإعلامك أنه تم إلغاء طلبك" },
};

export interface Order {
  id: string;
  items: { productId: string; name: string; price: number; quantity: number; image: string; restaurant?: string }[];
  total: number;
  deliveryFee: number;
  serviceFee?: number;
  phoneNumber: string;
  address: string;
  region: string;
  status: "pending" | "confirmed" | "preparing" | "ready" | "picked_up" | "in_delivery" | "delivering" | "delivered" | "cancelled" | "issue";
  createdAt: string;
  updatedAt: string;
  latitude?: number;
  longitude?: number;
  vendorName?: string;
  vendorId?: string;
  customerRating?: number;
  ratedAt?: string;
}

interface OrderContextType {
  orders: Order[];
  isLoading: boolean;
  addOrder: (orderData: {
    items: CartItem[];
    total: number;
    deliveryFee: number;
    address: string;
    region: string;
    customerName?: string;
    customerPhone?: string;
    notes?: string;
    latitude?: number;
    longitude?: number;
    promoCode?: string;
    promoDiscount?: number;
  }) => Promise<Order>;
  refreshOrders: () => Promise<void>;
}

const OrderContext = createContext<OrderContextType | undefined>(undefined);

export function OrderProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { phoneNumber, userProfile, customerToken } = useAuth();
  const { addNotification } = useNotifications();
  const previousStatusesRef = useRef<Record<string, string>>({});
  const isInitializedRef = useRef(false);

  useEffect(() => {
    const loadStoredStatuses = async () => {
      try {
        const stored = await AsyncStorage.getItem(ORDER_STATUSES_KEY);
        if (stored) {
          previousStatusesRef.current = JSON.parse(stored);
        }
        isInitializedRef.current = true;
      } catch (error) {
        isInitializedRef.current = true;
      }
    };
    loadStoredStatuses();
  }, []);

  const saveStatuses = useCallback(async (statuses: Record<string, string>) => {
    try {
      await AsyncStorage.setItem(ORDER_STATUSES_KEY, JSON.stringify(statuses));
    } catch (error) {
    }
  }, []);

  const checkForStatusChanges = useCallback((newOrders: Order[]) => {
    if (!isInitializedRef.current) return;
    
    const previousStatuses = previousStatusesRef.current;
    const newStatuses: Record<string, string> = {};
    
    newOrders.forEach((order) => {
      newStatuses[order.id] = order.status;
      const previousStatus = previousStatuses[order.id];
      
      if (previousStatus && previousStatus !== order.status && order.status !== "pending") {
        const message = STATUS_MESSAGES[order.status];
        if (message) {
          addNotification(message.title, message.body, { orderId: order.id, status: order.status });
        }
      }
    });

    previousStatusesRef.current = newStatuses;
    saveStatuses(newStatuses);
  }, [addNotification, saveStatuses]);

  const refreshOrders = useCallback(async () => {
    if (!phoneNumber) return;
    setIsLoading(true);
    try {
      // GET /api/orders requires the customer JWT (requireCustomerAuth). Without this
      // header the request 401s and the order list/tracking/notifications stay empty.
      const headers: Record<string, string> = {};
      if (customerToken) headers["Authorization"] = `Bearer ${customerToken}`;
      const response = await fetch(
        new URL(`/api/orders?phoneNumber=${encodeURIComponent(phoneNumber)}`, getApiUrl()).toString(),
        { headers },
      );
      if (response.ok) {
        const data = await response.json();
        checkForStatusChanges(data);
        setOrders(data);
      }
    } catch (error) {
    } finally {
      setIsLoading(false);
    }
  }, [phoneNumber, customerToken, checkForStatusChanges]);

  useEffect(() => {
    if (phoneNumber && isInitializedRef.current) {
      refreshOrders();
      const interval = setInterval(refreshOrders, 10000);
      return () => clearInterval(interval);
    }
  }, [phoneNumber, refreshOrders]);

  // Real-time: refetch immediately when the server broadcasts an order change,
  // instead of waiting up to 10s for the next poll. The 10s poll above stays as a
  // fallback (covers dropped socket connections). Additive only.
  const ordersSocketRef = useRef<Socket | null>(null);
  useEffect(() => {
    if (!phoneNumber) return;
    const sock = io(getApiUrl(), {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 3000,
    });
    ordersSocketRef.current = sock;
    sock.on("orders:changed", () => { refreshOrders(); });
    return () => {
      sock.disconnect();
      ordersSocketRef.current = null;
    };
  }, [phoneNumber, refreshOrders]);

  const addOrder = useCallback(async (orderData: {
    items: CartItem[];
    total: number;
    deliveryFee: number;
    serviceFee?: number;
    address: string;
    region: string;
    customerName?: string;
    customerPhone?: string;
    notes?: string;
    latitude?: number;
    longitude?: number;
    promoCode?: string;
    promoDiscount?: number;
  }): Promise<Order> => {
    if (!phoneNumber) {
      throw new Error("يرجى تسجيل الدخول أولاً");
    }
    
    const bodyData: any = {
      phoneNumber,
      userId: userProfile?.id || "",
      items: orderData.items.map(item => ({
        productId: item.product.id,
        name: item.product.name,
        price: item.product.price,
        quantity: item.quantity,
        image: item.product.image,
        ...(item.product.restaurant ? { restaurant: item.product.restaurant } : {}),
      })),
      total: orderData.total,
      deliveryFee: orderData.deliveryFee,
      address: orderData.address,
      region: orderData.region,
    };
    // Attach the vendor this order belongs to (the cart is scoped to one vendor).
    const orderVendorId = orderData.items.find((it) => it.product.vendorId)?.product.vendorId;
    if (orderVendorId) bodyData.vendorId = orderVendorId;
    if (orderData.serviceFee !== undefined) bodyData.serviceFee = orderData.serviceFee;
    if (orderData.customerName) bodyData.customerName = orderData.customerName;
    if (orderData.customerPhone) bodyData.customerPhone = orderData.customerPhone;
    if (orderData.notes) bodyData.notes = orderData.notes;
    if (orderData.promoCode) bodyData.promoCode = orderData.promoCode;
    if (orderData.promoDiscount) bodyData.promoDiscount = orderData.promoDiscount;
    if (orderData.latitude !== undefined && orderData.longitude !== undefined) {
      bodyData.latitude = orderData.latitude;
      bodyData.longitude = orderData.longitude;
    }

    let response: Response;
    try {
      response = await fetch(new URL("/api/orders", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyData),
      });
    } catch (networkError: any) {
      const netErr = new Error("تعذّر الاتصال بالخادم، تحقق من اتصالك بالإنترنت");
      (netErr as any).isNetworkError = true;
      throw netErr;
    }

    if (!response.ok) {
      let serverMessage = "فشل في إنشاء الطلب";
      try {
        const errBody = await response.json();
        if (errBody?.error) serverMessage = errBody.error;
        else if (errBody?.message) serverMessage = errBody.message;
      } catch {}
      throw new Error(serverMessage);
    }

    const newOrder = await response.json();
    setOrders(prev => [newOrder, ...prev]);
    return newOrder;
  }, [phoneNumber, userProfile]);

  return (
    <OrderContext.Provider value={{ orders, isLoading, addOrder, refreshOrders }}>
      {children}
    </OrderContext.Provider>
  );
}

export function useOrders() {
  const context = useContext(OrderContext);
  if (context === undefined) {
    throw new Error("useOrders must be used within an OrderProvider");
  }
  return context;
}
