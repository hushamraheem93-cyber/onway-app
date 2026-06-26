/**
 * useOrders — Customer order fetching, rating, and status tracking.
 */

import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/query-client";
import type { OrderStatus } from "@/types";

function apiUrl(path: string) {
  return new URL(path, getApiUrl()).toString();
}

export interface CustomerOrder {
  id: string;
  status: OrderStatus;
  items: OrderItem[];
  totalAmount: number;
  deliveryFee: number;
  createdAt: string;
  updatedAt?: string;
  customerName: string;
  phoneNumber: string;
  address: string;
  area?: string;
  notes?: string;
  paymentMethod?: string;
  rating?: number;
  promoCode?: string;
  promoDiscount?: number;
  vendorId?: string;
  vendorName?: string;
}

interface OrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
}

// ── Customer orders list ──────────────────────────────────────────────────────
export function useOrders(phoneNumber: string | null, token: string | null) {
  const queryClient = useQueryClient();

  const { data = [], isLoading, refetch } = useQuery<CustomerOrder[]>({
    queryKey: ["/api/orders", phoneNumber],
    queryFn: async () => {
      if (!phoneNumber || !token) throw new Error("unauthenticated");
      const res = await fetch(
        apiUrl(`/api/orders?phone=${encodeURIComponent(phoneNumber)}`),
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    enabled: !!phoneNumber && !!token,
    staleTime: 30_000,
  });

  const rateOrder = useCallback(
    async (orderId: string, rating: number) => {
      if (!token) return false;
      try {
        const res = await fetch(apiUrl(`/api/orders/${orderId}/rate`), {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ rating }),
        });
        if (!res.ok) return false;
        queryClient.invalidateQueries({ queryKey: ["/api/orders", phoneNumber] });
        return true;
      } catch {
        return false;
      }
    },
    [token, phoneNumber, queryClient]
  );

  const cancelOrder = useCallback(
    async (orderId: string) => {
      if (!token) return false;
      try {
        const res = await fetch(apiUrl(`/api/orders/${orderId}/cancel`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ status: "cancelled" }),
        });
        if (!res.ok) return false;
        queryClient.invalidateQueries({ queryKey: ["/api/orders", phoneNumber] });
        return true;
      } catch {
        return false;
      }
    },
    [token, phoneNumber, queryClient]
  );

  return { orders: data, ordersLoading: isLoading, refreshOrders: refetch, rateOrder, cancelOrder };
}

// ── Single order tracking ─────────────────────────────────────────────────────
export function useOrderTracking(orderId: string | null, token: string | null) {
  const { data, isLoading, error } = useQuery<CustomerOrder>({
    queryKey: ["/api/orders", orderId, "tracking"],
    queryFn: async () => {
      if (!orderId || !token) throw new Error("missing params");
      const res = await fetch(apiUrl(`/api/orders/${orderId}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    enabled: !!orderId && !!token,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  return { order: data ?? null, trackingLoading: isLoading, trackingError: error };
}

// ── Create order ──────────────────────────────────────────────────────────────
export function useCreateOrder(token: string | null, phoneNumber: string | null) {
  const queryClient = useQueryClient();

  const { mutateAsync: placeOrder, isPending } = useMutation({
    mutationFn: async (orderData: Record<string, unknown>) => {
      if (!token) throw new Error("unauthenticated");
      const res = await fetch(apiUrl("/api/orders"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(orderData),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `${res.status}`);
      }
      return res.json() as Promise<{ success: boolean; orderId: string }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", phoneNumber] });
    },
  });

  return { placeOrder, isPlacing: isPending };
}
