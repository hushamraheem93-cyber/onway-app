/**
 * useNotifications — Customer notification list + read management.
 */

import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/query-client";
import type { AppNotification } from "@/types";

function apiUrl(path: string) {
  return new URL(path, getApiUrl()).toString();
}

export function useNotifications(phoneNumber: string | null, token: string | null) {
  const queryClient = useQueryClient();

  const { data = [], isLoading, refetch } = useQuery<AppNotification[]>({
    queryKey: ["/api/notifications", phoneNumber],
    queryFn: async () => {
      if (!phoneNumber || !token) throw new Error("unauthenticated");
      const res = await fetch(
        apiUrl(`/api/notifications?phone=${encodeURIComponent(phoneNumber)}`),
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    enabled: !!phoneNumber && !!token,
    staleTime: 30_000,
  });

  const unreadCount = data.filter((n) => !n.isRead).length;

  const markAllRead = useCallback(async () => {
    if (!token || !phoneNumber) return;
    await fetch(apiUrl("/api/notifications/mark-all-read"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ phoneNumber }),
    }).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ["/api/notifications", phoneNumber] });
  }, [token, phoneNumber, queryClient]);

  return { notifications: data, notificationsLoading: isLoading, unreadCount, refreshNotifications: refetch, markAllRead };
}
