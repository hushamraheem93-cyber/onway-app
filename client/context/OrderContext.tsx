import React, { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CartItem } from "./CartContext";
import { useAuth } from "./AuthContext";
import { useNotifications } from "./NotificationContext";
import { getApiUrl } from "@/lib/query-client";

const ORDER_STATUSES_KEY = "@onway_order_statuses";

const STATUS_MESSAGES: Record<string, { title: string; body: string }> = {
  confirmed: { title: "تم تأكيد الطلب", body: "تم استلام طلبك وسيتم تحضيره قريباً" },
  preparing: { title: "جاري تحضير الطلب", body: "طلبك الآن قيد التحضير في المتجر" },
  delivering: { title: "الطلب في الطريق", body: "تم استلام الطلب من قبل المندوب وهو في طريقه إليك" },
  delivered: { title: "تم التوصيل بنجاح", body: "تم توصيل طلبك بنجاح. شكراً لتسوقك معنا!" },
  cancelled: { title: "تم إلغاء الطلب", body: "نأسف لإعلامك أنه تم إلغاء طلبك" },
};

export interface Order {
  id: string;
  items: { productId: string; name: string; price: number; quantity: number; image: string }[];
  total: number;
  deliveryFee: number;
  phoneNumber: string;
  address: string;
  region: string;
  status: "pending" | "confirmed" | "preparing" | "delivering" | "delivered" | "cancelled";
  createdAt: string;
  updatedAt: string;
  latitude?: number;
  longitude?: number;
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
  }) => Promise<Order | null>;
  refreshOrders: () => Promise<void>;
}

const OrderContext = createContext<OrderContextType | undefined>(undefined);

export function OrderProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { phoneNumber, userProfile } = useAuth();
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
        console.error("Error loading order statuses:", error);
        isInitializedRef.current = true;
      }
    };
    loadStoredStatuses();
  }, []);

  const saveStatuses = useCallback(async (statuses: Record<string, string>) => {
    try {
      await AsyncStorage.setItem(ORDER_STATUSES_KEY, JSON.stringify(statuses));
    } catch (error) {
      console.error("Error saving order statuses:", error);
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
      const response = await fetch(new URL(`/api/orders?phoneNumber=${encodeURIComponent(phoneNumber)}`, getApiUrl()).toString());
      if (response.ok) {
        const data = await response.json();
        checkForStatusChanges(data);
        setOrders(data);
      }
    } catch (error) {
      console.error("Error fetching orders:", error);
    } finally {
      setIsLoading(false);
    }
  }, [phoneNumber, checkForStatusChanges]);

  useEffect(() => {
    if (phoneNumber && isInitializedRef.current) {
      refreshOrders();
      const interval = setInterval(refreshOrders, 10000);
      return () => clearInterval(interval);
    }
  }, [phoneNumber, refreshOrders]);

  const addOrder = useCallback(async (orderData: {
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
  }): Promise<Order | null> => {
    if (!phoneNumber) return null;
    
    try {
      const bodyData: any = {
        phoneNumber,
        userId: userProfile?.id || "",
        items: orderData.items.map(item => ({
          productId: item.product.id,
          name: item.product.name,
          price: item.product.price,
          quantity: item.quantity,
          image: item.product.image,
        })),
        total: orderData.total,
        deliveryFee: orderData.deliveryFee,
        address: orderData.address,
        region: orderData.region,
      };
      if (orderData.customerName) bodyData.customerName = orderData.customerName;
      if (orderData.customerPhone) bodyData.customerPhone = orderData.customerPhone;
      if (orderData.notes) bodyData.notes = orderData.notes;
      if (orderData.promoCode) bodyData.promoCode = orderData.promoCode;
      if (orderData.promoDiscount) bodyData.promoDiscount = orderData.promoDiscount;
      if (orderData.latitude !== undefined && orderData.longitude !== undefined) {
        bodyData.latitude = orderData.latitude;
        bodyData.longitude = orderData.longitude;
      }
      const response = await fetch(new URL("/api/orders", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyData),
      });
      
      if (response.ok) {
        const newOrder = await response.json();
        setOrders(prev => [newOrder, ...prev]);
        return newOrder;
      }
    } catch (error) {
      console.error("Error creating order:", error);
    }
    return null;
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
