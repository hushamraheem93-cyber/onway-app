import { useState, useEffect, useCallback, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { useAuth } from "@/context/AuthContext";
import { getApiUrl } from "@/lib/query-client";

export type SettlementAccountType = "driver" | "vendor";
export type SettlementStatus = "outstanding" | "under_review" | "settled";

export interface SettlementView {
  accountType: SettlementAccountType;
  direction: "collect" | "payout";
  outstanding: number;
  totalOrders: number;
  totalGross: number;
  totalCommission: number;
  totalSettled: number;
  pendingOrderCount: number;
  status: SettlementStatus;
  activeRequest: { id: string; status: string; createdAt?: any } | null;
}

export interface SettlementHistory {
  settlements: any[];
  requests: any[];
}

/**
 * One reusable settlement data hook for BOTH drivers and vendors. It resolves the
 * correct authenticated endpoints per account type (driver = phone query, vendor =
 * bearer token), exposes the account view + history, a requestSettlement() action,
 * and live-refreshes on the server's real-time settlements:changed broadcast.
 */
export function useSettlement(accountType: SettlementAccountType) {
  const { phoneNumber, vendorToken } = useAuth();
  const [view, setView] = useState<SettlementView | null>(null);
  const [history, setHistory] = useState<SettlementHistory>({ settlements: [], requests: [] });
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const ready = accountType === "driver" ? !!phoneNumber : !!vendorToken;

  const buildRequest = useCallback(
    (suffix: string): { url: string; headers: Record<string, string> } | null => {
      if (accountType === "driver") {
        if (!phoneNumber) return null;
        const q = `phoneNumber=${encodeURIComponent(phoneNumber)}`;
        const sep = suffix.includes("?") ? "&" : "?";
        return {
          url: new URL(`/api/driver/settlement${suffix}${sep}${q}`, getApiUrl()).toString(),
          headers: { "Content-Type": "application/json" },
        };
      }
      if (!vendorToken) return null;
      return {
        url: new URL(`/api/vendor/settlement${suffix}`, getApiUrl()).toString(),
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${vendorToken}` },
      };
    },
    [accountType, phoneNumber, vendorToken],
  );

  const refresh = useCallback(async () => {
    const v = buildRequest("");
    const h = buildRequest("/history");
    if (!v || !h) return;
    try {
      const [vr, hr] = await Promise.all([
        fetch(v.url, { headers: v.headers }),
        fetch(h.url, { headers: h.headers }),
      ]);
      if (vr.ok) setView(await vr.json());
      if (hr.ok) setHistory(await hr.json());
    } catch {
      // keep last-known values; a transient network error should not blank the UI
    } finally {
      setLoading(false);
    }
  }, [buildRequest]);

  const requestSettlement = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    const r = buildRequest("/request");
    if (!r) return { ok: false, error: "غير مسجّل الدخول" };
    setRequesting(true);
    setError(null);
    try {
      const body = accountType === "driver" ? JSON.stringify({ phoneNumber }) : JSON.stringify({});
      const res = await fetch(r.url, { method: "POST", headers: r.headers, body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data?.error || "تعذّر إرسال الطلب";
        setError(msg);
        return { ok: false, error: msg };
      }
      await refresh();
      return { ok: true };
    } catch {
      const msg = "تعذّر الاتصال بالخادم";
      setError(msg);
      return { ok: false, error: msg };
    } finally {
      setRequesting(false);
    }
  }, [buildRequest, accountType, phoneNumber, refresh]);

  useEffect(() => {
    if (!ready) return;
    refresh();
  }, [ready, refresh]);

  // Live refresh when the server broadcasts any settlement change (request or complete).
  useEffect(() => {
    if (!ready) return;
    const sock = io(getApiUrl(), {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 3000,
    });
    socketRef.current = sock;
    sock.on("settlements:changed", () => { refresh(); });
    return () => {
      sock.disconnect();
      socketRef.current = null;
    };
  }, [ready, refresh]);

  return { view, history, loading, requesting, error, refresh, requestSettlement };
}
