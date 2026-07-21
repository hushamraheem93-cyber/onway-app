/**
 * useDriver — Driver status, online toggle, batch management, earnings.
 * Abstracts all driver-related API calls from screens.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { getApiUrl } from "@/lib/query-client";

const DRIVER_POLL_INTERVAL = 5_000; // ms
import type { BatchStatus } from "@/types";

export interface DriverStatusData {
  isOnline: boolean;
  status: string;
  currentBatch: CurrentBatch | null;
  queuePosition: number | null;
  walletBalance: number;
  todayEarnings: number;
}

export interface CurrentBatch {
  id: string;
  status: BatchStatus;
  orders: BatchOrder[];
  totalOrders: number;
  completedOrders: number;
  totalEarnings: number;
  countdown?: number;
}

export interface BatchOrder {
  id: string;
  customerName: string;
  address: string;
  status: string;
  items?: unknown[];
  totalAmount?: number;
  coordinates?: { lat: number; lng: number };
  phoneNumber?: string;
}

function apiUrl(path: string) {
  return new URL(path, getApiUrl()).toString();
}

export function useDriver(phoneNumber: string | null) {
  const [data, setData] = useState<DriverStatusData>({
    isOnline: false,
    status: "pending",
    currentBatch: null,
    queuePosition: null,
    walletBalance: 0,
    todayEarnings: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isToggling, setIsToggling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!phoneNumber) return;
    try {
      const res = await fetch(
        apiUrl(`/api/driver/status?phoneNumber=${encodeURIComponent(phoneNumber)}`)
      );
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      setData({
        isOnline: json.isOnline ?? false,
        status: json.status ?? "pending",
        currentBatch: json.currentBatch ?? null,
        queuePosition: json.queuePosition ?? null,
        walletBalance: json.walletBalance ?? 0,
        todayEarnings: json.todayEarnings ?? 0,
      });
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "خطأ في الاتصال");
    } finally {
      setLoading(false);
    }
  }, [phoneNumber]);

  useEffect(() => {
    fetchStatus();
    pollRef.current = setInterval(fetchStatus, DRIVER_POLL_INTERVAL);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchStatus]);

  const toggleOnline = useCallback(
    async (targetState: boolean) => {
      if (!phoneNumber || isToggling) return;
      setIsToggling(true);
      try {
        const res = await fetch(apiUrl("/api/driver/toggle-online"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phoneNumber, isOnline: targetState }),
        });
        if (!res.ok) throw new Error(`${res.status}`);
        await fetchStatus();
      } finally {
        setIsToggling(false);
      }
    },
    [phoneNumber, isToggling, fetchStatus]
  );

  const acceptBatch = useCallback(
    async (batchId: string) => {
      if (!phoneNumber) return false;
      try {
        const res = await fetch(apiUrl("/api/driver/batch/accept"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batchId, phoneNumber }),
        });
        if (!res.ok) throw new Error(`${res.status}`);
        await fetchStatus();
        return true;
      } catch {
        return false;
      }
    },
    [phoneNumber, fetchStatus]
  );

  const rejectBatch = useCallback(
    async (batchId: string) => {
      if (!phoneNumber) return;
      await fetch(apiUrl("/api/driver/reject-order"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId, phoneNumber }),
      }).catch(() => {});
      await fetchStatus();
    },
    [phoneNumber, fetchStatus]
  );

  const reportIssue = useCallback(
    async (orderId: string, issue: string) => {
      if (!phoneNumber) return false;
      try {
        const res = await fetch(apiUrl("/api/driver/report-issue"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phoneNumber, orderId, issue }),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
    [phoneNumber]
  );

  const updateLocation = useCallback(
    async (latitude: number, longitude: number) => {
      if (!phoneNumber) return;
      await fetch(apiUrl("/api/driver/location"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber, latitude, longitude }),
      }).catch(() => {});
    },
    [phoneNumber]
  );

  const refreshToken = useCallback(
    async (pushToken: string) => {
      if (!phoneNumber || !pushToken) return;
      await fetch(apiUrl("/api/driver/refresh-push-token"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber, pushToken }),
      }).catch(() => {});
    },
    [phoneNumber]
  );

  return {
    ...data,
    loading,
    error,
    isToggling,
    refresh: fetchStatus,
    toggleOnline,
    acceptBatch,
    rejectBatch,
    reportIssue,
    updateLocation,
    refreshToken,
  };
}
