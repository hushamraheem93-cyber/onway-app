import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { CartItem } from "./CartContext";

export interface Order {
  id: string;
  items: CartItem[];
  total: number;
  customerName: string;
  phone: string;
  address: string;
  notes: string;
  status: "pending" | "confirmed" | "delivered";
  createdAt: Date;
}

interface OrderContextType {
  orders: Order[];
  addOrder: (order: Omit<Order, "id" | "createdAt" | "status">) => Order;
  getOrders: () => Order[];
}

const OrderContext = createContext<OrderContextType | undefined>(undefined);

export function OrderProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Order[]>([]);

  const addOrder = useCallback((orderData: Omit<Order, "id" | "createdAt" | "status">) => {
    const newOrder: Order = {
      ...orderData,
      id: `ORD-${Date.now()}`,
      status: "pending",
      createdAt: new Date(),
    };
    setOrders((prev) => [newOrder, ...prev]);
    return newOrder;
  }, []);

  const getOrders = useCallback(() => {
    return orders;
  }, [orders]);

  return (
    <OrderContext.Provider value={{ orders, addOrder, getOrders }}>
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
