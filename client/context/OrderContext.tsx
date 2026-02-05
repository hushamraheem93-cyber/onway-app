import React, { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from "react";
import { CartItem } from "./CartContext";
import { useAuth } from "./AuthContext";
import { useNotifications } from "./NotificationContext";
import { getApiUrl } from "@/lib/query-client";

const STATUS_MESSAGES: Record<string, { title: string; body: string }> = {
  confirmed: { title: "تم تأكيد طلبك", body: "طلبك قيد التحضير الآن" },
  preparing: { title: "جاري تحضير طلبك", body: "طلبك قيد التحضير وسيكون جاهزاً قريباً" },
  delivering: { title: "طلبك في الطريق", body: "تم استلام الطلب من قبل المندوب" },
  delivered: { title: "تم توصيل طلبك", body: "شكراً لتسوقك معنا!" },
  cancelled: { title: "تم إلغاء طلبك", body: "نأسف لإعلامك بإلغاء طلبك" },
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
  }) => Promise<Order | null>;
  refreshOrders: () => Promise<void>;
}

const OrderContext = createContext<OrderContextType | undefined>(undefined);

export function OrderProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { phoneNumber, userProfile } = useAuth();
  const { addNotification } = useNotifications();
  const previousOrdersRef = useRef<Map<string, string>>(new Map());

  const checkForStatusChanges = useCallback((newOrders: Order[]) => {
    const previousStatuses = previousOrdersRef.current;
    
    newOrders.forEach((order) => {
      const previousStatus = previousStatuses.get(order.id);
      if (previousStatus && previousStatus !== order.status && order.status !== "pending") {
        const message = STATUS_MESSAGES[order.status];
        if (message) {
          addNotification(message.title, message.body, { orderId: order.id, status: order.status });
        }
      }
    });

    const newStatuses = new Map<string, string>();
    newOrders.forEach((order) => {
      newStatuses.set(order.id, order.status);
    });
    previousOrdersRef.current = newStatuses;
  }, [addNotification]);

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
    if (phoneNumber) {
      refreshOrders();
      const interval = setInterval(refreshOrders, 30000);
      return () => clearInterval(interval);
    }
  }, [phoneNumber, refreshOrders]);

  const addOrder = useCallback(async (orderData: {
    items: CartItem[];
    total: number;
    deliveryFee: number;
    address: string;
    region: string;
  }): Promise<Order | null> => {
    if (!phoneNumber) return null;
    
    try {
      const response = await fetch(new URL("/api/orders", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
        }),
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
