/**
 * useVendor — Vendor stats, notifications, and profile management.
 * Abstracts all vendor merchant-side API calls from screens.
 */

import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/query-client";

function apiUrl(path: string) {
  return new URL(path, getApiUrl()).toString();
}

export interface VendorStats {
  totalOrders: number;
  pendingOrders: number;
  preparingOrders: number;
  readyOrders: number;
  totalRevenue: number;
  rating: number | null;
  ratingCount: number;
}

export interface VendorNotification {
  id: string;
  title: string;
  body: string;
  type: string;
  createdAt: string;
  isRead: boolean;
  orderId?: string;
}

export interface VendorProduct {
  id: string;
  name: string;
  price: number;
  image?: string;
  description?: string;
  isAvailable: boolean;
  categoryId?: string;
  vendorId: string;
}

// ── Stats ─────────────────────────────────────────────────────────────────────
export function useVendorStats(vendorToken: string | null) {
  const { data, isLoading, refetch } = useQuery<VendorStats>({
    queryKey: ["/api/vendor/stats", vendorToken],
    queryFn: async () => {
      if (!vendorToken) throw new Error("no token");
      const res = await fetch(apiUrl("/api/vendor/stats"), {
        headers: { Authorization: `Bearer ${vendorToken}` },
      });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    enabled: !!vendorToken,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  return { stats: data ?? null, statsLoading: isLoading, refreshStats: refetch };
}

// ── Notifications ─────────────────────────────────────────────────────────────
export function useVendorNotifications(vendorToken: string | null) {
  const [notifications, setNotifications] = useState<VendorNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!vendorToken) return;
    try {
      const res = await fetch(apiUrl("/api/vendor/notifications"), {
        headers: { Authorization: `Bearer ${vendorToken}` },
      });
      if (!res.ok) return;
      const json = await res.json();
      setNotifications(json.notifications ?? []);
    } finally {
      setLoading(false);
    }
  }, [vendorToken]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const markRead = useCallback(
    async (ids: string[]) => {
      if (!vendorToken) return;
      await fetch(apiUrl("/api/vendor/notifications/mark-read"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${vendorToken}` },
        body: JSON.stringify({ ids }),
      }).catch(() => {});
      setNotifications((prev) => prev.map((n) => (ids.includes(n.id) ? { ...n, isRead: true } : n)));
    },
    [vendorToken]
  );

  return { notifications, notificationsLoading: loading, refreshNotifications: fetchNotifications, markRead };
}

// ── Products ──────────────────────────────────────────────────────────────────
export function useVendorProducts(vendorToken: string | null) {
  const queryClient = useQueryClient();

  const { data = [], isLoading, refetch } = useQuery<VendorProduct[]>({
    queryKey: ["/api/vendor/products", vendorToken],
    queryFn: async () => {
      if (!vendorToken) throw new Error("no token");
      const url = new URL("/api/vendor/products", getApiUrl());
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${vendorToken}` },
      });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    enabled: !!vendorToken,
    staleTime: 60_000,
  });

  const toggleAvailability = useCallback(
    async (productId: string, isAvailable: boolean) => {
      if (!vendorToken) return;
      await fetch(apiUrl(`/api/vendor/products/${productId}/availability`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${vendorToken}` },
        body: JSON.stringify({ isAvailable }),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/products", vendorToken] });
    },
    [vendorToken, queryClient]
  );

  const deleteProduct = useCallback(
    async (productId: string) => {
      if (!vendorToken) return false;
      try {
        const res = await fetch(apiUrl(`/api/vendor/products/${productId}`), {
          method: "DELETE",
          headers: { Authorization: `Bearer ${vendorToken}` },
        });
        if (!res.ok) return false;
        queryClient.invalidateQueries({ queryKey: ["/api/vendor/products", vendorToken] });
        return true;
      } catch {
        return false;
      }
    },
    [vendorToken, queryClient]
  );

  const bulkDelete = useCallback(
    async (productIds: string[]) => {
      if (!vendorToken) return false;
      try {
        const res = await fetch(apiUrl("/api/vendor/products/bulk-delete"), {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${vendorToken}` },
          body: JSON.stringify({ productIds }),
        });
        if (!res.ok) return false;
        queryClient.invalidateQueries({ queryKey: ["/api/vendor/products", vendorToken] });
        return true;
      } catch {
        return false;
      }
    },
    [vendorToken, queryClient]
  );

  return { products: data, productsLoading: isLoading, refetchProducts: refetch, toggleAvailability, deleteProduct, bulkDelete };
}

// ── Profile update ────────────────────────────────────────────────────────────
export function useVendorProfile(vendorToken: string | null) {
  const queryClient = useQueryClient();

  const updateProfile = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!vendorToken) return false;
      try {
        const res = await fetch(apiUrl("/api/vendor/profile"), {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${vendorToken}` },
          body: JSON.stringify(payload),
        });
        if (!res.ok) return false;
        queryClient.invalidateQueries({ queryKey: ["/api/vendor/profile"] });
        return true;
      } catch {
        return false;
      }
    },
    [vendorToken, queryClient]
  );

  const uploadImages = useCallback(
    async (payload: { profileImageBase64?: string; coverImageBase64?: string }) => {
      if (!vendorToken) return false;
      try {
        const res = await fetch(apiUrl("/api/vendor/profile/images"), {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${vendorToken}` },
          body: JSON.stringify(payload),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
    [vendorToken]
  );

  return { updateProfile, uploadImages };
}
