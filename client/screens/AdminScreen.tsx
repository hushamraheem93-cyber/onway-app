import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import {
  View,
  ScrollView,
  Alert,
  Platform,
} from "react-native";
import * as Notifications from "expo-notifications";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { io, Socket } from "socket.io-client";
import * as Print from "expo-print";

import * as Haptics from "expo-haptics";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, AppColors } from "@/constants/theme";
import { LoadingState } from "@/components/ScreenState";
import { Banner, Category } from "@/constants/categories";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import {
  checkAdminSession,
  logoutAdmin,
  setAdminUnauthorizedHandler,
  type AdminSessionInfo,
} from "@/lib/adminAuth";
import { escapeHtml as esc } from "@/utils/escapeHtml";
import { processAndUploadImage } from "@/lib/imageUtils";
import { useSystemSettings } from "@/context/SystemSettingsContext";
import { playRepeatingAlert } from "@/lib/alertSound";
import { WebsiteCmsTab } from "@/screens/WebsiteCmsTab";
import { AdminTabBar, AdminTab } from "@/screens/admin/AdminTabBar";
import { TrackingModal } from "@/screens/admin/TrackingModal";
import { AssignDriverModal } from "@/screens/admin/AssignDriverModal";
import { NotificationsTab } from "@/screens/admin/NotificationsTab";
import { AreasTab } from "@/screens/admin/AreasTab";
import { CategoriesTab } from "@/screens/admin/CategoriesTab";
import { BannersTab } from "@/screens/admin/BannersTab";
import { UsersTab } from "@/screens/admin/UsersTab";
import { PromoCodesTab } from "@/screens/admin/PromoCodesTab";
import { ProductsTab } from "@/screens/admin/ProductsTab";
import { DriversTab } from "@/screens/admin/DriversTab";
import { OrdersTab } from "@/screens/admin/OrdersTab";
import { StorageTab } from "@/screens/admin/StorageTab";
import type {
  TabType,
  VendorPartner,
  VendorProduct,
} from "@/screens/admin/types";
import { SettlementsTab } from "@/screens/admin/SettlementsTab";
import { DashboardTab } from "@/screens/admin/DashboardTab";
import { SettingsTab } from "@/screens/admin/SettingsTab";
import { VendorsTab } from "@/screens/admin/VendorsTab";

interface AdminUser {
  id: string;
  phoneNumber: string;
  fullName: string;
  gender?: string;
  region?: string;
  address?: string;
  createdAt?: any;
  pushToken?: string;
}
type BannerType = "offer" | "slider";
type OrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "ready"
  | "picked_up"
  | "in_delivery"
  // C-1: never written by the server. Kept in the union only so a historical
  // document carrying it still type-checks; no branch tests for it any more.
  | "delivering"
  | "delivered"
  | "cancelled"
  | "issue";

interface AdminOrder {
  id: string;
  phoneNumber: string;
  items: {
    productId: string;
    name: string;
    price: number;
    quantity: number;
    image: string;
  }[];
  total: number;
  deliveryFee: number;
  address: string;
  region: string;
  status: OrderStatus;
  driverPhone?: string;
  createdAt: string;
  updatedAt: string;
}

interface Product {
  id: string;
  categoryId: string;
  name: string;
  price: number;
  originalPrice?: number;
  discount?: number;
  image: string;
  description: string;
  inStock: boolean;
}

interface DeliveryArea {
  id: string;
  name: string;
  fee: number;
  isActive: boolean;
}

interface PromoCode {
  id: string;
  code: string;
  type: "fixed" | "percentage";
  value: number;
  expiryDate: string;
  isActive: boolean;
  createdAt: string;
}

interface Driver {
  id: string;
  phoneNumber: string;
  fullName: string;
  firstName: string;
  secondName: string;
  thirdName: string;
  fourthName: string;
  nationalIdImage: string;
  driverLicenseImage?: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  updatedAt: string;
}

export default function AdminScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const navigation = useNavigation<any>();

  // H-12: "Admin" is a route on the SAME stack every customer and guest gets, and
  // this screen used to mount for anyone who reached it — the only protection was
  // that the network calls would fail. The panel's layout, the operation names and
  // the shape of every admin route were on display regardless.
  //
  // Nothing renders until a stored admin token is confirmed; without one the screen
  // is replaced by the login screen, so there is no back-stack entry to return to.
  const [adminAuthState, setAdminAuthState] = useState<"checking" | "ok">(
    "checking",
  );
  const [adminSession, setAdminSession] = useState<AdminSessionInfo | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // A-2: presence of a token is not a session. An expired or revoked one used
      // to pass this gate, render the whole panel, and then fail every query with
      // 401. The server is asked whether the session is still accepted.
      const result = await checkAdminSession();
      if (cancelled) return;
      if (!result.info && result.reachable) navigation.replace("AdminLogin");
      else if (result.info) {
        setAdminSession(result.info);
        const p = result.info.permissions;
        const firstAllowed = p.includes("*") ? "dashboard" : p.includes("operations.read") ? "dashboard" : p.includes("orders.read") ? "orders" : p.includes("products.read") ? "products" : p.includes("customers.read") ? "users" : p.includes("settings.read") ? "settings" : "dashboard";
        setActiveTab(firstAllowed as TabType);
        setAdminAuthState("ok");
      } else {
        setAdminAuthState("ok");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigation]);

  // #14: ANY admin request answering 401 tears the session down once, centrally,
  // and returns to the login screen — instead of leaving an empty dashboard behind
  // a repeating alert. The interceptor has already cleared the stored token.
  useEffect(() => {
    setAdminUnauthorizedHandler(() => {
      navigation.replace("AdminLogin");
    });
    return () => setAdminUnauthorizedHandler(null);
  }, [navigation]);

  // A-1: the panel had no sign-out at all — its own session-expiry message told the
  // admin to "sign out and back in" with no control to do it.
  const handleAdminLogout = useCallback(() => {
    Alert.alert("تسجيل الخروج", "هل تريد الخروج من لوحة التحكم؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "خروج",
        style: "destructive",
        onPress: async () => {
          await logoutAdmin();
          navigation.replace("AdminLogin");
        },
      },
    ]);
  }, [navigation]);

  // Real-time: refresh the orders list immediately when the server broadcasts an
  // order change, instead of waiting for the 6s refetch interval below. The
  // interval remains as a fallback. Additive only.
  useEffect(() => {
    const sock: Socket = io(getApiUrl(), {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 3000,
    });
    sock.on("orders:changed", () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
    });
    // Settlement requests appear instantly in the admin inbox.
    sock.on("settlements:changed", () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/settlement-requests"],
      });
    });
    return () => {
      sock.disconnect();
    };
  }, [queryClient]);

  // Pending settlement requests (drivers + vendors), live-refreshed via socket above.
  const { data: settlementRequests = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/settlement-requests"],
    queryFn: async () => {
      const res = await fetch(
        `${getApiUrl()}/api/admin/settlement-requests?status=pending`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      return data.requests ?? [];
    },
    refetchInterval: 15000,
  });

  const [activeTab, setActiveTab] = useState<TabType>("dashboard");

  // ── Settlement dashboard (6C) ───────────────────────────────────────────────
  const [settleView, setSettleView] = useState<
    "requests" | "driver" | "vendor" | "config"
  >("requests");
  const [completeTarget, setCompleteTarget] = useState<any | null>(null);
  const [completeAmount, setCompleteAmount] = useState("");
  const [completeBusy, setCompleteBusy] = useState(false);
  const [detailTarget, setDetailTarget] = useState<any | null>(null);
  const [detailData, setDetailData] = useState<any | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);

  const openSettlementDetails = useCallback(async (a: any) => {
    setDetailTarget(a);
    setDetailData(null);
    setDetailBusy(true);
    try {
      const res = await fetch(
        `${getApiUrl()}/api/admin/settlement-account?accountType=${a.accountType}&accountId=${encodeURIComponent(a.accountId)}`,
        { credentials: "include" },
      );
      if (res.ok) setDetailData(await res.json());
    } catch {
      /* ignore */
    } finally {
      setDetailBusy(false);
    }
  }, []);

  const { data: settlementAccounts = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/settlement-accounts", settleView],
    queryFn: async () => {
      const type = settleView === "vendor" ? "vendor" : "driver";
      const res = await fetch(
        `${getApiUrl()}/api/admin/settlement-accounts?accountType=${type}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("failed");
      return (await res.json()).accounts ?? [];
    },
    enabled:
      activeTab === "settlements" &&
      (settleView === "driver" || settleView === "vendor"),
    refetchInterval: 20000,
  });

  const { data: settlementConfig, refetch: refetchSettlementConfig } =
    useQuery<any>({
      queryKey: ["/api/admin/settlement-config"],
      queryFn: async () => {
        const res = await fetch(`${getApiUrl()}/api/admin/settlement-config`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error("failed");
        return res.json();
      },
      enabled: activeTab === "settlements",
    });

  const submitSettlement = useCallback(
    async (account: any, amount: number, requestId?: string) => {
      setCompleteBusy(true);
      try {
        const res = await fetch(
          `${getApiUrl()}/api/admin/settlements/complete`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              accountType: account.accountType,
              accountId: account.accountId,
              amount,
              requestId,
              method: "cash",
              adminName: "admin",
            }),
          },
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          Alert.alert("تعذّر إتمام التسوية", data?.error || "حاول مرة أخرى");
          return;
        }
        Alert.alert(
          "تمت التسوية",
          `تم تسجيل ${amount.toLocaleString("ar-IQ")} د.ع بنجاح`,
        );
        setCompleteTarget(null);
        setCompleteAmount("");
        queryClient.invalidateQueries({
          queryKey: ["/api/admin/settlement-accounts", settleView],
        });
        queryClient.invalidateQueries({
          queryKey: ["/api/admin/settlement-requests"],
        });
      } catch {
        Alert.alert("خطأ", "تعذّر الاتصال بالخادم");
      } finally {
        setCompleteBusy(false);
      }
    },
    [queryClient, settleView],
  );

  const saveSettlementConfig = useCallback(
    async (
      accountType: "driver" | "vendor",
      thresholdEnabled: boolean,
      thresholdAmount: number,
    ) => {
      try {
        const res = await fetch(`${getApiUrl()}/api/admin/settlement-config`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            accountType,
            thresholdEnabled,
            thresholdAmount,
          }),
        });
        if (res.ok) {
          refetchSettlementConfig();
          Alert.alert("تم الحفظ", "تم تحديث حدّ التسوية");
        } else Alert.alert("خطأ", "تعذّر حفظ الإعداد");
      } catch {
        Alert.alert("خطأ", "تعذّر الاتصال بالخادم");
      }
    },
    [refetchSettlementConfig],
  );

  // Same class as H-16: this report is assembled by string interpolation and then
  // handed to Print.printAsync. `accountName` is the store's or driver's own display
  // name — the very field H-15 showed can carry a payload — so an unescaped cell lets
  // a store inject markup into the report the supervisor prints. The status cell is a
  // ternary over three fixed Arabic literals and the header/date are static, so only
  // the data cells need escaping; they all get it.
  const printSettlementReport = useCallback(async () => {
    const type = settleView === "vendor" ? "vendor" : "driver";
    const rows = settlementAccounts
      .map(
        (a) => `
      <tr>
        <td>${esc(a.accountName ?? "")}</td>
        <td style="text-align:center">${esc(a.totalOrders ?? 0)}</td>
        <td style="text-align:center">${esc((a.outstanding ?? 0).toLocaleString("ar-IQ"))} د.ع</td>
        <td style="text-align:center">${a.status === "settled" ? "مسوّى" : a.status === "under_review" ? "قيد المراجعة" : "مستحق"}</td>
      </tr>`,
      )
      .join("");
    const html = `
      <html dir="rtl"><head><meta charset="utf-8"/>
      <style>body{font-family:sans-serif;padding:24px} h1{color:#FB5B21} table{width:100%;border-collapse:collapse} th,td{border:1px solid #ddd;padding:8px} th{background:#FFF1EC}</style>
      </head><body>
        <h1>تقرير التسويات — ${type === "vendor" ? "المتاجر" : "السائقون"}</h1>
        <p>التاريخ: ${new Date().toLocaleDateString("ar-IQ")}</p>
        <table><thead><tr><th>الاسم</th><th>الطلبات</th><th>المستحق</th><th>الحالة</th></tr></thead>
        <tbody>${rows || "<tr><td colspan=4 style='text-align:center'>لا توجد بيانات</td></tr>"}</tbody></table>
      </body></html>`;
    try {
      await Print.printAsync({ html });
    } catch {
      /* user cancelled */
    }
  }, [settleView, settlementAccounts]);

  const [isEditing, setIsEditing] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [hasCategoryChanges, setHasCategoryChanges] = useState(false);
  const [isSavingCategories, setIsSavingCategories] = useState(false);

  const [bannerForm, setBannerForm] = useState({
    title: "",
    type: "slider" as BannerType,
    imageUri: "",
    imageUrl: "",
  });

  const [categoryForm, setCategoryForm] = useState({
    name: "",
    imageUri: "",
    imageUrl: "",
  });

  const [productForm, setProductForm] = useState({
    name: "",
    categoryId: "",
    price: "",
    originalPrice: "",
    discount: "",
    description: "",
    inStock: true,
    imageUri: "",
    imageUrl: "",
    restaurant: "",
  });

  const [areaForm, setAreaForm] = useState({
    name: "",
    fee: "",
  });

  const [promoForm, setPromoForm] = useState({
    code: "",
    type: "fixed" as "fixed" | "percentage",
    value: "",
    expiryDate: "",
  });

  const [isSavingProduct, setIsSavingProduct] = useState(false);

  const [notifForm, setNotifForm] = useState({ title: "", body: "" });
  const [isSendingNotif, setIsSendingNotif] = useState(false);
  const [notifResult, setNotifResult] = useState<{
    sent: number;
    total: number;
  } | null>(null);
  const [notifError, setNotifError] = useState<string | null>(null);

  // ── Storage Stats ──────────────────────────────────────────────────────────
  const [storageStats, setStorageStats] = useState<any | null>(null);
  const [storageStatsLoading, setStorageStatsLoading] = useState(false);
  const [storageStatsError, setStorageStatsError] = useState<string | null>(
    null,
  );
  const loadStorageStats = useCallback(async () => {
    setStorageStatsLoading(true);
    setStorageStatsError(null);
    try {
      const res = await fetch(`${getApiUrl()}/api/admin/storage-stats`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setStorageStats(await res.json());
    } catch {
      setStorageStatsError("تعذر تحميل إحصائيات التخزين");
    } finally {
      setStorageStatsLoading(false);
    }
  }, []);
  useEffect(() => {
    if (activeTab === "storage" && !storageStats && !storageStatsLoading) {
      loadStorageStats();
    }
  }, [activeTab, storageStats, storageStatsLoading, loadStorageStats]);

  const [urgencyForm, setUrgencyForm] = useState({
    confirmed: "10",
    preparing: "25",
    ready: "15",
  });
  const [isSavingUrgency, setIsSavingUrgency] = useState(false);
  const [urgencySaveError, setUrgencySaveError] = useState<string | null>(null);
  const [urgencySaveOk, setUrgencySaveOk] = useState(false);

  const [usersSearch, setUsersSearch] = useState("");

  const [serviceFeeInput, setServiceFeeInput] = useState("");
  const [isSavingFee, setIsSavingFee] = useState(false);

  // ── System settings: online payment, driver payout rule, auto-suspend ───────
  const { settings: systemSettings, refresh: refreshSystemSettings } =
    useSystemSettings();
  const [payoutRuleType, setPayoutRuleType] = useState<"flat" | "percent">(
    "flat",
  );
  const [payoutFlatRestaurant, setPayoutFlatRestaurant] = useState("750");
  const [payoutFlatDefault, setPayoutFlatDefault] = useState("2000");
  const [payoutPercent, setPayoutPercent] = useState("15");
  const [autoSuspendInput, setAutoSuspendInput] = useState("100000");
  const [maxBatchInput, setMaxBatchInput] = useState(3);
  const [isSavingPayout, setIsSavingPayout] = useState(false);
  const [isSavingSuspend, setIsSavingSuspend] = useState(false);
  const [isSavingMaxBatch, setIsSavingMaxBatch] = useState(false);
  const [isRedistributing, setIsRedistributing] = useState(false);

  // ── Delivery revenue split (D-3) ──────────────────────────────────────────
  // Only the two percentages: the FEE is per delivery area and is edited in the
  // areas tab. Same endpoint and same shared split helper as the web dashboard —
  // this screen must not grow a second pricing rule.
  const [dpRestaurantShare, setDpRestaurantShare] = useState("");
  const [dpShoppingShare, setDpShoppingShare] = useState("");
  const [isSavingDeliveryPricing, setIsSavingDeliveryPricing] = useState(false);

  // Sync system settings from context whenever they load
  useEffect(() => {
    if (!systemSettings) return;
    setAutoSuspendInput(String(systemSettings.autoSuspendThreshold ?? 100000));
    setMaxBatchInput(systemSettings.maxBatchSize ?? 3);
    const r = systemSettings.driverPayoutRule;
    if (r) {
      setPayoutRuleType(r.type || "flat");
      setPayoutFlatRestaurant(String(r.flatRestaurant ?? 750));
      setPayoutFlatDefault(String(r.flatDefault ?? 2000));
      setPayoutPercent(String(r.percent ?? 15));
    }
    const dp = systemSettings.deliveryPricing;
    if (dp) {
      setDpRestaurantShare(String(dp.restaurant.appSharePercent));
      setDpShoppingShare(String(dp.shopping.appSharePercent));
    }
  }, [systemSettings]);

  const saveDeliveryPricing = useCallback(async () => {
    const parsed = {
      restaurant: { appSharePercent: parseInt(dpRestaurantShare, 10) },
      shopping: { appSharePercent: parseInt(dpShoppingShare, 10) },
    };
    for (const kind of ["restaurant", "shopping"] as const) {
      const { appSharePercent } = parsed[kind];
      if (
        !Number.isFinite(appSharePercent) ||
        appSharePercent < 0 ||
        appSharePercent > 100
      ) {
        Alert.alert("خطأ", "حصة التطبيق يجب أن تكون بين 0 و100");
        return;
      }
    }
    setIsSavingDeliveryPricing(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/admin/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ deliveryPricing: parsed }),
      });
      if (!res.ok) throw new Error("failed");
      await refreshSystemSettings();
      Alert.alert("تم", "تم تحديث تقسيم الأجرة — يسري على الطلبات الجديدة");
    } catch {
      Alert.alert("خطأ", "فشل حفظ الإعداد، حاول مجدداً");
    } finally {
      setIsSavingDeliveryPricing(false);
    }
  }, [dpRestaurantShare, dpShoppingShare, refreshSystemSettings]);

  const saveDriverPayoutRule = useCallback(async () => {
    setIsSavingPayout(true);
    const fr = parseInt(payoutFlatRestaurant, 10);
    const fd = parseInt(payoutFlatDefault, 10);
    const pct = parseFloat(payoutPercent);
    if (payoutRuleType === "flat" && (isNaN(fr) || isNaN(fd))) {
      Alert.alert("خطأ", "يرجى إدخال مبالغ صحيحة");
      setIsSavingPayout(false);
      return;
    }
    if (payoutRuleType === "percent" && (isNaN(pct) || pct <= 0 || pct > 100)) {
      Alert.alert("خطأ", "يرجى إدخال نسبة بين 1 و100");
      setIsSavingPayout(false);
      return;
    }
    try {
      const res = await fetch(`${getApiUrl()}/api/admin/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          driverPayoutRule: {
            type: payoutRuleType,
            flatRestaurant: fr || 750,
            flatDefault: fd || 2000,
            percent: pct || 15,
          },
        }),
      });
      if (!res.ok) throw new Error("failed");
      await refreshSystemSettings();
      Alert.alert("تم", "تم تحديث قاعدة مكافأة السائق بنجاح");
    } catch {
      Alert.alert("خطأ", "فشل حفظ الإعداد، حاول مجدداً");
    } finally {
      setIsSavingPayout(false);
    }
  }, [
    payoutRuleType,
    payoutFlatRestaurant,
    payoutFlatDefault,
    payoutPercent,
    refreshSystemSettings,
  ]);

  const saveAutoSuspendThreshold = useCallback(async () => {
    const val = parseInt(autoSuspendInput, 10);
    if (isNaN(val) || val < 0) {
      Alert.alert("خطأ", "يرجى إدخال رقم أكبر من أو يساوي صفر");
      return;
    }
    setIsSavingSuspend(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/admin/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ autoSuspendThreshold: val }),
      });
      if (!res.ok) throw new Error("failed");
      await refreshSystemSettings();
      Alert.alert("تم", "تم تحديث حد الحجب التلقائي بنجاح");
    } catch {
      Alert.alert("خطأ", "فشل حفظ الإعداد، حاول مجدداً");
    } finally {
      setIsSavingSuspend(false);
    }
  }, [autoSuspendInput, refreshSystemSettings]);

  const saveMaxBatchSize = useCallback(
    async (val: number) => {
      setMaxBatchInput(val);
      setIsSavingMaxBatch(true);
      try {
        const res = await fetch(`${getApiUrl()}/api/admin/settings`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ maxBatchSize: val }),
        });
        if (!res.ok) throw new Error("failed");
        await refreshSystemSettings();
      } catch {
        Alert.alert("خطأ", "فشل حفظ الإعداد، حاول مجدداً");
      } finally {
        setIsSavingMaxBatch(false);
      }
    },
    [refreshSystemSettings],
  );

  const emergencyRedistribute = useCallback(() => {
    Alert.alert(
      "إعادة توزيع طارئة",
      "ستُلغى الدفعات غير المقبولة وتُعاد للتوزيع الذكي. الدفعات قيد التوصيل لا تتأثر. متابعة؟",
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "متابعة",
          style: "destructive",
          onPress: async () => {
            setIsRedistributing(true);
            try {
              const res = await fetch(`${getApiUrl()}/api/admin/redistribute`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: "{}",
              });
              const data = await res.json();
              if (res.ok)
                Alert.alert(
                  "تم",
                  `أُعيد توزيع ${data.freedOrders || 0} طلب من ${data.batchesReleased || 0} دفعة`,
                );
              else Alert.alert("فشل", data.error || "تعذّرت إعادة التوزيع");
            } catch {
              Alert.alert("فشل", "تعذّر الاتصال بالخادم");
            } finally {
              setIsRedistributing(false);
            }
          },
        },
      ],
    );
  }, []);

  // Register admin push token so server can send new-order notifications
  useEffect(() => {
    (async () => {
      try {
        if (Platform.OS === "web") return;
        const { status: existing } = await Notifications.getPermissionsAsync();
        let finalStatus = existing;
        if (existing !== "granted") {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        if (finalStatus !== "granted") return;
        const tokenData = await Notifications.getExpoPushTokenAsync();
        const pushToken = tokenData.data;
        if (pushToken?.startsWith("ExponentPushToken")) {
          await fetch(`${getApiUrl()}/api/admin/push-token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include", // send the admin session cookie (endpoint is behind requireAdminAuth)
            body: JSON.stringify({ pushToken }),
          });
        }
      } catch (_) {}
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(
          `${getApiUrl()}/api/settings/urgency-thresholds`,
        );
        if (res.ok) {
          const data = await res.json();
          setUrgencyForm({
            confirmed: String(data.confirmed ?? 10),
            preparing: String(data.preparing ?? 25),
            ready: String(data.ready ?? 15),
          });
        }
      } catch (_) {}
    })();
  }, []);

  const saveUrgencyThresholds = async () => {
    const confirmed = parseInt(urgencyForm.confirmed, 10);
    const preparing = parseInt(urgencyForm.preparing, 10);
    const ready = parseInt(urgencyForm.ready, 10);
    if (
      isNaN(confirmed) ||
      isNaN(preparing) ||
      isNaN(ready) ||
      confirmed <= 0 ||
      preparing <= 0 ||
      ready <= 0
    ) {
      setUrgencySaveError("أدخل أرقاماً صحيحة وأكبر من صفر");
      setTimeout(() => setUrgencySaveError(null), 3000);
      return;
    }
    setIsSavingUrgency(true);
    setUrgencySaveError(null);
    setUrgencySaveOk(false);
    try {
      const res = await fetch(
        `${getApiUrl()}/api/admin/settings/urgency-thresholds`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include", // send the admin session cookie (endpoint is behind requireAdminAuth)
          body: JSON.stringify({ confirmed, preparing, ready }),
        },
      );
      if (res.ok) {
        setUrgencySaveOk(true);
        setTimeout(() => setUrgencySaveOk(false), 3000);
      } else {
        const err = await res.json().catch(() => ({}));
        setUrgencySaveError(err?.error ?? "فشل الحفظ");
        setTimeout(() => setUrgencySaveError(null), 3000);
      }
    } catch (_) {
      setUrgencySaveError("تعذّر الاتصال بالخادم");
      setTimeout(() => setUrgencySaveError(null), 3000);
    } finally {
      setIsSavingUrgency(false);
    }
  };

  // H-43: the full user list is fetched ONLY by the tab that lists users.
  //
  // The dashboard used to pull every user document over the wire — phone numbers,
  // names, addresses, push tokens — to render one number, `adminUsers.length`.
  // That number now comes from /api/admin/dashboard-stats below, which reports it
  // with Firestore's server-side count() aggregation. The endpoint already existed
  // and already did this (its own comment calls it out); no client had adopted it.
  const {
    data: adminUsers = [],
    isLoading: usersLoading,
    refetch: refetchUsers,
  } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
    enabled: activeTab === "users",
  });

  // Aggregate counters for the dashboard tiles. Small, fixed-size response; the
  // heavy per-row datasets stay behind their own tabs. Not polled — the dashboard's
  // live figures come from /api/admin/orders, which is polled for the alert anyway.
  const { data: dashboardStats } = useQuery<{
    users: number;
    products: number;
  }>({
    queryKey: ["/api/admin/dashboard-stats"],
    enabled: activeTab === "dashboard",
  });

  // H-43: the queries below are fetched only by the tabs that actually read them.
  //
  // Every query on this screen used to run on mount regardless of the open tab, so
  // opening the panel to look at one order downloaded the whole product catalogue,
  // every vendor's products, every promo code, the banners, the categories and the
  // delivery areas — none of which the dashboard displays. The consumers were
  // traced one by one before gating; the ones that stayed ungated did so because
  // something outside their own tab reads them (a tab-bar badge, or the dashboard).
  //
  // `enabled` only defers the fetch; react-query still serves the cached value for
  // 5 minutes (staleTime), so switching back to a tab does not refetch.

  const { data: banners = [], isLoading: bannersLoading } = useQuery<Banner[]>({
    queryKey: ["/api/admin/banners"],
    enabled: activeTab === "banners",
  });

  const { data: categories = [], isLoading: categoriesLoading } = useQuery<
    Category[]
  >({
    queryKey: ["/api/categories"],
    // The products tab renders the category picker, so it needs these too.
    enabled: activeTab === "categories" || activeTab === "products",
  });

  const { data: products = [], isLoading: productsLoading } = useQuery<
    Product[]
  >({
    queryKey: ["/api/admin/products"],
    // The vendors tab cross-references platform products against vendor ones.
    enabled: activeTab === "products" || activeTab === "vendors",
  });

  const { data: deliveryAreas = [], isLoading: areasLoading } = useQuery<
    DeliveryArea[]
  >({
    queryKey: ["/api/admin/delivery-areas"],
    // D-3: the settings tab previews the split against every area's real fee, so it
    // reads the same dataset the areas tab edits.
    enabled: activeTab === "areas" || activeTab === "settings",
  });

  const { data: adminOrders = [], isLoading: ordersLoading } = useQuery<
    AdminOrder[]
  >({
    queryKey: ["/api/admin/orders"],
    refetchInterval: 6000,
  });

  // ── New-order sound alert ─────────────────────────────────────────────────
  // Play a repeating alert whenever a genuinely new pending order appears in
  // the list. Skip the first load so we don't beep for orders that were already
  // there when the admin opened the screen.
  const prevPendingIdsRef = useRef<Set<string>>(new Set());
  const isFirstAdminOrderLoad = useRef(true);
  useEffect(() => {
    const pendingOrders = adminOrders.filter((o) => o.status === "pending");
    if (isFirstAdminOrderLoad.current) {
      isFirstAdminOrderLoad.current = false;
      prevPendingIdsRef.current = new Set(pendingOrders.map((o) => o.id));
      return;
    }
    const newOrders = pendingOrders.filter(
      (o) => !prevPendingIdsRef.current.has(o.id),
    );
    prevPendingIdsRef.current = new Set(pendingOrders.map((o) => o.id));
    if (newOrders.length > 0) {
      playRepeatingAlert(3, 4000);
    }
  }, [adminOrders]);

  const { data: drivers = [], isLoading: driversLoading } = useQuery<Driver[]>({
    queryKey: ["/api/admin/drivers"],
  });

  const { data: promoCodes = [], isLoading: promoCodesLoading } = useQuery<
    PromoCode[]
  >({
    queryKey: ["/api/admin/promo-codes"],
    enabled: activeTab === "promoCodes",
  });

  const { data: ownerEarnings } = useQuery<{
    totalOwnerEarnings: number;
    totalDriverEarnings: number;
    totalDeliveryFees: number;
    ordersWithEarnings: number;
    totalDeliveredOrders: number;
  }>({
    queryKey: ["/api/admin/owner-earnings"],
    enabled: activeTab === "dashboard" || activeTab === "orders",
  });

  const {
    data: vendorPartnersRaw,
    isLoading: vendorsLoading,
    refetch: refetchVendors,
  } = useQuery<{ vendors: VendorPartner[]; total: number }>({
    queryKey: ["/api/admin/vendor-partners"],
    queryFn: async () => {
      const res = await fetch(`${getApiUrl()}/api/admin/vendor-partners`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
  });
  // H-65: `?? []` allocated a fresh array on every render while the query was
  // loading or errored, which changed the identity feeding the tab-bar badge and
  // the vendors tab filters. Memoising pins it to one empty array.
  const vendorPartners: VendorPartner[] = useMemo(
    () => vendorPartnersRaw?.vendors ?? [],
    [vendorPartnersRaw],
  );

  const { data: allVendorProducts, refetch: refetchVendorProducts } = useQuery<{
    products: VendorProduct[];
    total: number;
  }>({
    queryKey: ["/api/admin/vendor-products"],
    queryFn: async () => {
      const res = await fetch(
        `${getApiUrl()}/api/admin/vendor-products?status=all`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
    enabled: activeTab === "vendors",
  });

  const { data: feesSettings, refetch: refetchFees } = useQuery<{
    serviceFee: number;
  }>({
    queryKey: ["/api/settings/fees"],
    enabled: activeTab === "settings",
  });

  const [selectedVendor, setSelectedVendor] = useState<VendorPartner | null>(
    null,
  );
  const [vendorStatusFilter, setVendorStatusFilter] = useState<
    "all" | "active" | "pending" | "rejected" | "suspended"
  >("all");
  const [isUpdatingVendorStatus, setIsUpdatingVendorStatus] = useState(false);
  const [deletingImageKey, setDeletingImageKey] = useState<string | null>(null);
  const [addVendorProductOpen, setAddVendorProductOpen] = useState(false);
  const [vendorProductForm, setVendorProductForm] = useState({
    name: "",
    category: "",
    price: "",
    description: "",
    stock: "0",
    unit: "قطعة",
    imageUri: "",
    imageUrl: "",
  });
  const [savingVendorProduct, setSavingVendorProduct] = useState(false);

  const saveVendorProduct = async (vendorId: string) => {
    if (savingVendorProduct) return;
    const { name, price, category } = vendorProductForm;
    if (!name.trim()) {
      Alert.alert("خطأ", "يرجى إدخال اسم المنتج");
      return;
    }
    if (!price || isNaN(parseFloat(price))) {
      Alert.alert("خطأ", "يرجى إدخال سعر صحيح");
      return;
    }
    if (!category) {
      Alert.alert("خطأ", "يرجى اختيار الفئة");
      return;
    }
    setSavingVendorProduct(true);
    try {
      let finalImageUrl = vendorProductForm.imageUrl;
      if (vendorProductForm.imageUri) {
        finalImageUrl = await processAndUploadImage(
          vendorProductForm.imageUri,
          "product",
        );
      }
      const res = await fetch(
        `${getApiUrl()}/api/admin/vendors/${vendorId}/products`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            name: name.trim(),
            price,
            category,
            description: vendorProductForm.description.trim(),
            stock: vendorProductForm.stock || "0",
            unit: vendorProductForm.unit || "قطعة",
            imageUrl: finalImageUrl || undefined,
          }),
        },
      );
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "فشل الحفظ");
      }
      Alert.alert("تم", "تم إضافة المنتج بنجاح");
      setAddVendorProductOpen(false);
      setVendorProductForm({
        name: "",
        category: "",
        price: "",
        description: "",
        stock: "0",
        unit: "قطعة",
        imageUri: "",
        imageUrl: "",
      });
      refetchVendorProducts();
    } catch (err: any) {
      Alert.alert("خطأ", err.message || "حدث خطأ");
    } finally {
      setSavingVendorProduct(false);
    }
  };

  const deleteProductImage = useMutation({
    mutationFn: async ({
      pid,
      imageUrl,
    }: {
      pid: string;
      imageUrl: string;
    }) => {
      const res = await fetch(
        `${getApiUrl()}/api/admin/vendor-products/${pid}/image`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ imageUrl }),
        },
      );
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "فشل الحذف");
      }
      return res.json();
    },
    onSuccess: () => {
      refetchVendorProducts();
    },
    onError: (err: Error) => {
      Alert.alert("خطأ", err.message);
    },
    onSettled: () => {
      setDeletingImageKey(null);
    },
  });

  const [rechargeDriver, setRechargeDriver] = useState<string | null>(null);
  const [rechargeAmount, setRechargeAmount] = useState("");

  // Manual driver assignment
  const [assigningOrderId, setAssigningOrderId] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);

  // Driver tracking modal
  const [trackingOrderId, setTrackingOrderId] = useState<string | null>(null);
  const [trackingMapHtml, setTrackingMapHtml] = useState<string | null>(null);
  const [trackingDriverName, setTrackingDriverName] = useState<string>("");
  const trackingWebViewRef = useRef<any>(null);
  const trackingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );

  const assignDriverMutation = useMutation({
    mutationFn: async ({
      orderId,
      driverPhone,
    }: {
      orderId: string;
      driverPhone: string;
    }) => {
      const res = await fetch(
        `${getApiUrl()}/api/admin/orders/${orderId}/assign-driver`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include", // send the admin session cookie (endpoint is behind requireAdminAuth)
          body: JSON.stringify({ driverPhone }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل التعيين");
      return data;
    },
    onSuccess: () => {
      setAssigningOrderId(null);
      setAssignError(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
    },
    onError: (err: Error) => {
      setAssignError(err.message);
    },
  });

  const updateDriverStatusMutation = useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: "pending" | "approved" | "rejected";
    }) => {
      await apiRequest("PUT", `/api/admin/drivers/${id}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/drivers"] });
    },
    onError: (err: Error) => {
      const msg = err.message || "تعذّر تحديث حالة السائق";
      const isAuth = msg.includes("401") || msg.includes("غير مصرح");
      Alert.alert(
        "خطأ",
        isAuth ? "انتهت صلاحية الجلسة — سيتم إرجاعك لتسجيل الدخول" : msg,
      );
    },
  });

  const rechargeWalletMutation = useMutation({
    mutationFn: async ({
      phoneNumber,
      amount,
    }: {
      phoneNumber: string;
      amount: number;
    }) => {
      const res = await fetch(
        `${getApiUrl()}/api/admin/driver-wallet/payment`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include", // send the admin session cookie (endpoint is behind requireAdminAuth)
          body: JSON.stringify({
            phoneNumber,
            amount,
            notes: "دفعة من الإدارة",
          }),
        },
      );
      if (!res.ok) throw new Error("فشل في تسجيل الدفعة");
      return res.json();
    },
    onSuccess: () => {
      setRechargeDriver(null);
      setRechargeAmount("");
    },
  });

  const updateOrderStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: OrderStatus }) => {
      await fetch(`${getApiUrl()}/api/admin/orders/${id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // send the admin session cookie (endpoint is behind requireAdminAuth)
        body: JSON.stringify({ status }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
    },
  });

  const deleteBanner = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/banners/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/banners"] });
      queryClient.invalidateQueries({ queryKey: ["/api/banners"] });
    },
  });

  const deleteCategory = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/categories/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/categories"] });
      setHasCategoryChanges(true);
    },
  });

  const deleteProduct = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/products/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    },
  });

  const deleteArea = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/delivery-areas/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/delivery-areas"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-areas"] });
    },
  });

  const deletePromoCode = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/promo-codes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/promo-codes"] });
    },
  });

  const deleteVendor = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/vendor-partners/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/vendor-partners"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stores"] });
      setSelectedVendor(null);
    },
    onError: () => {
      Alert.alert("خطأ", "فشل حذف المتجر");
    },
  });

  const pickImage = async (setter: (uri: string) => void) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setter(result.assets[0].uri);
    }
  };

  const saveBanner = async () => {
    try {
      let imageUrl = bannerForm.imageUrl;

      if (bannerForm.imageUri) {
        imageUrl = await processAndUploadImage(bannerForm.imageUri, "banner");
      }

      const body = {
        title: bannerForm.title,
        type: bannerForm.type,
        isActive: true,
        image: imageUrl,
      };

      const url = editItem
        ? `/api/admin/banners/${editItem.id}`
        : "/api/admin/banners";
      const method = editItem ? "PUT" : "POST";

      await fetch(`${getApiUrl()}${url}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      queryClient.invalidateQueries({ queryKey: ["/api/admin/banners"] });
      queryClient.invalidateQueries({ queryKey: ["/api/banners"] });
      resetForm();
    } catch (error) {
      Alert.alert("خطأ", "فشل في حفظ البانر");
    }
  };

  const saveCategory = async () => {
    try {
      let imageUrl = categoryForm.imageUrl;

      if (categoryForm.imageUri) {
        imageUrl = await processAndUploadImage(
          categoryForm.imageUri,
          "category",
        );
      }

      const body = {
        name: categoryForm.name,
        image: imageUrl,
      };

      const url = editItem
        ? `/api/admin/categories/${editItem.id}`
        : "/api/admin/categories";
      const method = editItem ? "PUT" : "POST";

      const res = await fetch(`${getApiUrl()}${url}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        // /api/admin/* requires the admin session cookie (requireAdminAuth).
        // This raw fetch was missing it, so the save was rejected (401) and the
        // category never persisted.
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `HTTP ${res.status}`);
      }

      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/categories"] });
      setHasCategoryChanges(true);
      resetForm();
    } catch (error: any) {
      Alert.alert(
        "خطأ",
        error?.message
          ? `فشل في حفظ القسم: ${error.message}`
          : "فشل في حفظ القسم",
      );
    }
  };

  const saveProduct = async () => {
    if (isSavingProduct) return;

    const url = editItem
      ? `/api/admin/products/${editItem.id}`
      : "/api/admin/products";
    const fullUrl = `${getApiUrl()}${url}`;

    setIsSavingProduct(true);
    try {
      let imageUrl: string | null = productForm.imageUrl || null;

      if (productForm.imageUri) {
        imageUrl = await processAndUploadImage(productForm.imageUri, "product");
      }

      const body: any = {
        name: productForm.name,
        categoryId: productForm.categoryId,
        price: productForm.price,
        description: productForm.description || "",
        inStock: productForm.inStock,
      };

      if (productForm.originalPrice)
        body.originalPrice = productForm.originalPrice;
      if (productForm.discount) body.discount = productForm.discount;
      if (imageUrl) body.image = imageUrl;
      if (productForm.categoryId === "restaurants" && productForm.restaurant) {
        body.restaurant = productForm.restaurant;
      }

      const method = editItem ? "PUT" : "POST";

      const response = await fetch(fullUrl, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const responseText = await response.text();

      if (!response.ok) {
        throw new Error(`${response.status}: ${responseText}`);
      }

      Alert.alert("تم", "تم حفظ المنتج بنجاح");

      queryClient.invalidateQueries({ queryKey: ["/api/admin/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      resetForm();
    } catch (error: any) {
      Alert.alert(
        "خطأ",
        `فشل في حفظ المنتج: ${error?.message || "خطأ غير معروف"}`,
      );
    } finally {
      setIsSavingProduct(false);
    }
  };

  const saveArea = async () => {
    try {
      const url = editItem
        ? `/api/admin/delivery-areas/${editItem.id}`
        : "/api/admin/delivery-areas";
      const method = editItem ? "PUT" : "POST";

      const response = await fetch(`${getApiUrl()}${url}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: areaForm.name,
          fee: areaForm.fee,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "فشل في حفظ منطقة التوصيل");
      }

      queryClient.invalidateQueries({
        queryKey: ["/api/admin/delivery-areas"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-areas"] });
      resetForm();
    } catch (error: any) {
      Alert.alert("خطأ", error?.message || "فشل في حفظ منطقة التوصيل");
    }
  };

  const savePromoCode = async () => {
    try {
      const url = editItem
        ? `/api/admin/promo-codes/${editItem.id}`
        : "/api/admin/promo-codes";
      const method = editItem ? "PUT" : "POST";

      const response = await fetch(`${getApiUrl()}${url}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: promoForm.code,
          type: promoForm.type,
          value: promoForm.value,
          expiryDate: promoForm.expiryDate,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "فشل في حفظ كود الخصم");
      }

      queryClient.invalidateQueries({ queryKey: ["/api/admin/promo-codes"] });
      resetForm();
    } catch (error: any) {
      Alert.alert("خطأ", error?.message || "فشل في حفظ كود الخصم");
    }
  };

  // H-65: wrapped so the tab bar's `onSelect` can be stable. The body only calls
  // `useState` setters, which React guarantees are stable, so `[]` is correct.
  const resetForm = useCallback(() => {
    setIsEditing(false);
    setEditItem(null);
    setBannerForm({ title: "", type: "slider", imageUri: "", imageUrl: "" });
    setCategoryForm({ name: "", imageUri: "", imageUrl: "" });
    setProductForm({
      name: "",
      categoryId: "",
      price: "",
      originalPrice: "",
      discount: "",
      description: "",
      inStock: true,
      imageUri: "",
      imageUrl: "",
      restaurant: "",
    });
    setAreaForm({ name: "", fee: "" });
    setPromoForm({ code: "", type: "fixed", value: "", expiryDate: "" });
  }, []);

  const saveCategoryChanges = async () => {
    if (isSavingCategories) return;
    setIsSavingCategories(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      await queryClient.invalidateQueries({
        queryKey: ["/api/admin/categories"],
      });
      await queryClient.refetchQueries({ queryKey: ["/api/categories"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setHasCategoryChanges(false);
    } catch (_e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSavingCategories(false);
    }
  };

  const handleEditBanner = (banner: Banner) => {
    setEditItem(banner);
    setBannerForm({
      title: banner.title || "",
      type: banner.type,
      imageUri: "",
      imageUrl: banner.image,
    });
    setIsEditing(true);
  };

  const handleEditCategory = (category: Category) => {
    setEditItem(category);
    setCategoryForm({
      name: category.name,
      imageUri: "",
      imageUrl: category.image,
    });
    setIsEditing(true);
  };

  const handleEditProduct = (product: Product) => {
    setEditItem(product);
    setProductForm({
      name: product.name,
      categoryId: product.categoryId,
      price: product.price.toString(),
      originalPrice: product.originalPrice?.toString() || "",
      discount: product.discount?.toString() || "",
      description: product.description,
      inStock: product.inStock,
      imageUri: "",
      imageUrl: product.image,
      restaurant: (product as any).restaurant || "",
    });
    setIsEditing(true);
  };

  const handleEditArea = (area: DeliveryArea) => {
    setEditItem(area);
    setAreaForm({
      name: area.name,
      fee: area.fee.toString(),
    });
    setIsEditing(true);
  };

  const handleEditPromo = (promo: PromoCode) => {
    setEditItem(promo);
    setPromoForm({
      code: promo.code,
      type: promo.type,
      value: promo.value.toString(),
      expiryDate: promo.expiryDate,
    });
    setIsEditing(true);
  };

  const confirmDelete = (
    id: string,
    type: "banner" | "category" | "product" | "area" | "promoCode",
  ) => {
    if (Platform.OS === "web") {
      if (window.confirm("هل أنت متأكد من الحذف؟")) {
        if (type === "banner") deleteBanner.mutate(id);
        else if (type === "category") deleteCategory.mutate(id);
        else if (type === "product") deleteProduct.mutate(id);
        else if (type === "area") deleteArea.mutate(id);
        else if (type === "promoCode") deletePromoCode.mutate(id);
      }
    } else {
      Alert.alert("تأكيد الحذف", "هل أنت متأكد من الحذف؟", [
        { text: "إلغاء", style: "cancel" },
        {
          text: "حذف",
          style: "destructive",
          onPress: () => {
            if (type === "banner") deleteBanner.mutate(id);
            else if (type === "category") deleteCategory.mutate(id);
            else if (type === "product") deleteProduct.mutate(id);
            else if (type === "area") deleteArea.mutate(id);
            else if (type === "promoCode") deletePromoCode.mutate(id);
          },
        },
      ]);
    }
  };

  // H-65: moved verbatim to client/screens/admin/BannersTab.tsx.

  // H-65: moved verbatim to client/screens/admin/CategoriesTab.tsx.

  // H-65: moved verbatim to client/screens/admin/ProductsTab.tsx.

  // H-65: moved verbatim to client/screens/admin/AreasTab.tsx.

  const getStatusLabel = (status: OrderStatus) => {
    const labels: Record<OrderStatus, string> = {
      pending: "قيد الانتظار",
      confirmed: "تم التأكيد",
      preparing: "جاري التحضير",
      ready: "جاهز للاستلام",
      picked_up: "استُلم من المتجر",
      in_delivery: "في الطريق",
      delivering: "جاري التوصيل",
      delivered: "تم التوصيل",
      cancelled: "ملغي",
      issue: "مشكلة",
    };
    return labels[status] ?? status;
  };

  const getStatusColor = (status: OrderStatus) => {
    const colors: Record<OrderStatus, string> = {
      pending: AppColors.warning,
      confirmed: AppColors.info,
      preparing: AppColors.statusPurple,
      ready: AppColors.statusPurple,
      picked_up: AppColors.statusCyan,
      in_delivery: AppColors.statusCyan,
      delivering: AppColors.statusCyan,
      delivered: AppColors.success,
      cancelled: AppColors.error,
      issue: AppColors.warning,
    };
    return colors[status] ?? AppColors.gray400;
  };

  // Approved drivers for assignment picker
  // H-65: this scan ran on every render of a 9k-line component (any keystroke in
  // any admin form). It only depends on the drivers query result.
  const approvedDrivers = useMemo(
    () => drivers.filter((d) => d.status === "approved"),
    [drivers],
  );

  const getAdminTrackingMapHTML = (
    driverLat: number,
    driverLng: number,
    driverName: string,
  ) => `
<!DOCTYPE html><html dir="rtl" lang="ar"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;background:#f0f0f0}
#map{width:100%;height:100%}
.leaflet-control-attribution{display:none!important}
.driver-pulse{width:48px;height:48px;position:relative;display:flex;align-items:center;justify-content:center}
.driver-pulse::before{content:'';position:absolute;width:48px;height:48px;border-radius:50%;background:rgba(251,91,33,0.25);animation:pulse 1.8s ease-out infinite}
.driver-inner{width:32px;height:32px;background:#FB5B21;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 10px rgba(251,91,33,0.6);display:flex;align-items:center;justify-content:center;position:relative;z-index:1}
@keyframes pulse{0%{transform:scale(0.5);opacity:1}100%{transform:scale(2.2);opacity:0}}
.info-pill{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);background:rgba(255,255,255,0.96);border-radius:24px;padding:8px 18px;font-family:sans-serif;font-size:13px;color:#333;box-shadow:0 2px 12px rgba(0,0,0,0.15);white-space:nowrap;z-index:1000;pointer-events:none}
.dot{width:8px;height:8px;background:#FB5B21;border-radius:50%;display:inline-block;margin-left:6px;animation:blink 1.2s ease-in-out infinite}
@keyframes blink{0%,100%{opacity:1}50%{opacity:0.2}}
</style></head><body>
<div id="map"></div>
<div class="info-pill"><span class="dot"></span> ${esc(driverName || "المندوب")} - موقع مباشر</div>
<script>
var map=L.map('map',{zoomControl:true,attributionControl:false}).setView([${driverLat},${driverLng}],15);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
var icon=L.divIcon({className:'',html:'<div class="driver-pulse"><div class="driver-inner"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={AppColors.white} stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg></div></div>',iconSize:[48,48],iconAnchor:[24,24]});
var marker=L.marker([${driverLat},${driverLng}],{icon}).addTo(map);
function updateDriverLocation(lat,lng){var ll=L.latLng(lat,lng);marker.setLatLng(ll);map.panTo(ll,{animate:true,duration:0.8});}
document.addEventListener('message',function(e){try{var d=JSON.parse(e.data);if(d.type==='updateDriver')updateDriverLocation(d.lat,d.lng);}catch(err){}});
window.addEventListener('message',function(e){try{var d=JSON.parse(e.data);if(d.type==='updateDriver')updateDriverLocation(d.lat,d.lng);}catch(err){}});
</script></body></html>`;

  const openTrackingModal = useCallback(async (orderId: string) => {
    setTrackingOrderId(orderId);
    setTrackingMapHtml(null);
    setTrackingDriverName("");
    try {
      const res = await fetch(
        new URL(
          `/api/orders/${orderId}/driver-location`,
          getApiUrl(),
        ).toString(),
      );
      const data = await res.json();
      if (data.available) {
        setTrackingDriverName(data.fullName || "المندوب");
        setTrackingMapHtml(
          getAdminTrackingMapHTML(
            data.lat,
            data.lng,
            data.fullName || "المندوب",
          ),
        );
        if (trackingIntervalRef.current)
          clearInterval(trackingIntervalRef.current);
        trackingIntervalRef.current = setInterval(async () => {
          try {
            const r2 = await fetch(
              new URL(
                `/api/orders/${orderId}/driver-location`,
                getApiUrl(),
              ).toString(),
            );
            const d2 = await r2.json();
            if (d2.available && trackingWebViewRef.current) {
              trackingWebViewRef.current.injectJavaScript(
                `updateDriverLocation(${d2.lat},${d2.lng});true;`,
              );
            }
          } catch {}
        }, 8000);
      }
    } catch {}
  }, []);

  const closeTrackingModal = useCallback(() => {
    setTrackingOrderId(null);
    setTrackingMapHtml(null);
    if (trackingIntervalRef.current) {
      clearInterval(trackingIntervalRef.current);
      trackingIntervalRef.current = null;
    }
  }, []);

  // H-65: moved verbatim to client/screens/admin/TrackingModal.tsx.

  // H-65: moved verbatim to client/screens/admin/AssignDriverModal.tsx.

  // H-65: moved verbatim to client/screens/admin/OrdersTab.tsx.

  const getDriverStatusColor = (status: string) => {
    switch (status) {
      case "approved":
        return AppColors.success;
      case "rejected":
        return AppColors.error;
      default:
        return AppColors.warning;
    }
  };

  const getDriverStatusText = (status: string) => {
    switch (status) {
      case "approved":
        return "مقبول";
      case "rejected":
        return "مرفوض";
      default:
        return "قيد المراجعة";
    }
  };

  // H-65: moved verbatim to client/screens/admin/DriversTab.tsx.

  // H-65: moved verbatim to client/screens/admin/PromoCodesTab.tsx.

  // H-65: moved verbatim to client/screens/admin/UsersTab.tsx.

  const handleSendNotification = async () => {
    if (!notifForm.title.trim() || !notifForm.body.trim()) {
      setNotifError("يرجى إدخال العنوان والرسالة");
      return;
    }
    setIsSendingNotif(true);
    setNotifResult(null);
    setNotifError(null);
    try {
      const res = await fetch(`${getApiUrl()}/api/admin/send-notification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // send the admin session cookie (endpoint is behind requireAdminAuth)
        body: JSON.stringify({ title: notifForm.title, body: notifForm.body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل الإرسال");
      setNotifResult({ sent: data.sent, total: data.total ?? data.sent });
      setNotifForm({ title: "", body: "" });
    } catch (e: any) {
      setNotifError(e.message);
    } finally {
      setIsSendingNotif(false);
    }
  };

  // H-65: moved verbatim to client/screens/admin/NotificationsTab.tsx.

  // H-65: the dashboard tab moved verbatim to client/screens/admin/DashboardTab.tsx.

  // H-65: the vendors tab — the largest block in this file — moved verbatim to
  // client/screens/admin/VendorsTab.tsx, together with the three label/colour
  // maps that only it used (now module constants instead of per-render objects).

  // H-65: the settings tab moved verbatim to client/screens/admin/SettingsTab.tsx.

  // H-65: the settlements tab and its private card helper moved verbatim to
  // client/screens/admin/SettlementsTab.tsx, where they are memoised together.

  // H-65: the storage tab moved verbatim to client/screens/admin/StorageTab.tsx.
  // It is memoised there; the five bindings it needs are passed as props below.

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard":
        return (
          <DashboardTab
            adminOrders={adminOrders}
            drivers={drivers}
            approvedDrivers={approvedDrivers}
            dashboardStats={dashboardStats}
            ownerEarnings={ownerEarnings}
            getStatusColor={getStatusColor}
            getStatusLabel={getStatusLabel}
            urgencyForm={urgencyForm}
            setUrgencyForm={setUrgencyForm}
            saveUrgencyThresholds={saveUrgencyThresholds}
            isSavingUrgency={isSavingUrgency}
            urgencySaveOk={urgencySaveOk}
            urgencySaveError={urgencySaveError}
            setActiveTab={setActiveTab}
            resetForm={resetForm}
            ADMIN_RED={ADMIN_RED}
            theme={theme}
          />
        );
      case "settlements":
        return (
          <SettlementsTab
            settleView={settleView}
            setSettleView={setSettleView}
            settlementRequests={settlementRequests}
            settlementAccounts={settlementAccounts}
            settlementConfig={settlementConfig}
            saveSettlementConfig={saveSettlementConfig}
            submitSettlement={submitSettlement}
            openSettlementDetails={openSettlementDetails}
            printSettlementReport={printSettlementReport}
            detailTarget={detailTarget}
            setDetailTarget={setDetailTarget}
            detailData={detailData}
            detailBusy={detailBusy}
            completeTarget={completeTarget}
            setCompleteTarget={setCompleteTarget}
            completeAmount={completeAmount}
            setCompleteAmount={setCompleteAmount}
            completeBusy={completeBusy}
            theme={theme}
          />
        );
      case "banners":
        return (
          <BannersTab
            banners={banners}
            bannersLoading={bannersLoading}
            bannerForm={bannerForm}
            setBannerForm={setBannerForm}
            saveBanner={saveBanner}
            handleEditBanner={handleEditBanner}
            confirmDelete={confirmDelete}
            pickImage={pickImage}
            isEditing={isEditing}
            editItem={editItem}
            resetForm={resetForm}
            theme={theme}
          />
        );
      case "categories":
        return (
          <CategoriesTab
            categories={categories}
            categoriesLoading={categoriesLoading}
            categoryForm={categoryForm}
            setCategoryForm={setCategoryForm}
            saveCategory={saveCategory}
            handleEditCategory={handleEditCategory}
            confirmDelete={confirmDelete}
            saveCategoryChanges={saveCategoryChanges}
            hasCategoryChanges={hasCategoryChanges}
            isSavingCategories={isSavingCategories}
            pickImage={pickImage}
            isEditing={isEditing}
            editItem={editItem}
            resetForm={resetForm}
            theme={theme}
          />
        );
      case "products":
        return (
          <ProductsTab
            products={products}
            productsLoading={productsLoading}
            categories={categories}
            productForm={productForm}
            setProductForm={setProductForm}
            saveProduct={saveProduct}
            isSavingProduct={isSavingProduct}
            handleEditProduct={handleEditProduct}
            confirmDelete={confirmDelete}
            pickImage={pickImage}
            isEditing={isEditing}
            editItem={editItem}
            resetForm={resetForm}
            theme={theme}
          />
        );
      case "areas":
        return (
          <AreasTab
            deliveryAreas={deliveryAreas}
            areasLoading={areasLoading}
            areaForm={areaForm}
            setAreaForm={setAreaForm}
            saveArea={saveArea}
            handleEditArea={handleEditArea}
            confirmDelete={confirmDelete}
            isEditing={isEditing}
            editItem={editItem}
            resetForm={resetForm}
            theme={theme}
          />
        );
      case "orders":
        return (
          <OrdersTab
            adminOrders={adminOrders}
            ordersLoading={ordersLoading}
            ownerEarnings={ownerEarnings}
            getStatusColor={getStatusColor}
            getStatusLabel={getStatusLabel}
            updateOrderStatus={updateOrderStatus}
            setAssigningOrderId={setAssigningOrderId}
            setAssignError={setAssignError}
            openTrackingModal={openTrackingModal}
            theme={theme}
          />
        );
      case "drivers":
        return (
          <DriversTab
            drivers={drivers}
            driversLoading={driversLoading}
            getDriverStatusColor={getDriverStatusColor}
            getDriverStatusText={getDriverStatusText}
            updateDriverStatusMutation={updateDriverStatusMutation}
            rechargeDriver={rechargeDriver}
            setRechargeDriver={setRechargeDriver}
            rechargeAmount={rechargeAmount}
            setRechargeAmount={setRechargeAmount}
            rechargeWalletMutation={rechargeWalletMutation}
            theme={theme}
          />
        );
      case "promoCodes":
        return (
          <PromoCodesTab
            promoCodes={promoCodes}
            promoCodesLoading={promoCodesLoading}
            promoForm={promoForm}
            setPromoForm={setPromoForm}
            savePromoCode={savePromoCode}
            handleEditPromo={handleEditPromo}
            confirmDelete={confirmDelete}
            isEditing={isEditing}
            editItem={editItem}
            resetForm={resetForm}
            theme={theme}
          />
        );
      case "notifications":
        return (
          <NotificationsTab
            notifForm={notifForm}
            setNotifForm={setNotifForm}
            handleSendNotification={handleSendNotification}
            isSendingNotif={isSendingNotif}
            notifError={notifError}
            notifResult={notifResult}
            theme={theme}
          />
        );
      case "users":
        return (
          <UsersTab
            adminUsers={adminUsers}
            usersLoading={usersLoading}
            refetchUsers={refetchUsers}
            usersSearch={usersSearch}
            setUsersSearch={setUsersSearch}
            theme={theme}
          />
        );
      case "vendors":
        return (
          <VendorsTab
            vendorPartners={vendorPartners}
            vendorsLoading={vendorsLoading}
            refetchVendors={refetchVendors}
            vendorStatusFilter={vendorStatusFilter}
            setVendorStatusFilter={setVendorStatusFilter}
            selectedVendor={selectedVendor}
            setSelectedVendor={setSelectedVendor}
            isUpdatingVendorStatus={isUpdatingVendorStatus}
            setIsUpdatingVendorStatus={setIsUpdatingVendorStatus}
            deleteVendor={deleteVendor}
            allVendorProducts={allVendorProducts}
            refetchVendorProducts={refetchVendorProducts}
            products={products}
            deleteProductImage={deleteProductImage}
            deletingImageKey={deletingImageKey}
            setDeletingImageKey={setDeletingImageKey}
            addVendorProductOpen={addVendorProductOpen}
            setAddVendorProductOpen={setAddVendorProductOpen}
            vendorProductForm={vendorProductForm}
            setVendorProductForm={setVendorProductForm}
            saveVendorProduct={saveVendorProduct}
            savingVendorProduct={savingVendorProduct}
            pickImage={pickImage}
            queryClient={queryClient}
            ADMIN_RED={ADMIN_RED}
            theme={theme}
          />
        );
      case "settings":
        return (
          <SettingsTab
            feesSettings={feesSettings}
            refetchFees={refetchFees}
            serviceFeeInput={serviceFeeInput}
            setServiceFeeInput={setServiceFeeInput}
            isSavingFee={isSavingFee}
            setIsSavingFee={setIsSavingFee}
            deliveryAreas={deliveryAreas}
            dpRestaurantShare={dpRestaurantShare}
            setDpRestaurantShare={setDpRestaurantShare}
            dpShoppingShare={dpShoppingShare}
            setDpShoppingShare={setDpShoppingShare}
            saveDeliveryPricing={saveDeliveryPricing}
            isSavingDeliveryPricing={isSavingDeliveryPricing}
            payoutRuleType={payoutRuleType}
            setPayoutRuleType={setPayoutRuleType}
            payoutFlatRestaurant={payoutFlatRestaurant}
            setPayoutFlatRestaurant={setPayoutFlatRestaurant}
            payoutFlatDefault={payoutFlatDefault}
            setPayoutFlatDefault={setPayoutFlatDefault}
            payoutPercent={payoutPercent}
            setPayoutPercent={setPayoutPercent}
            saveDriverPayoutRule={saveDriverPayoutRule}
            isSavingPayout={isSavingPayout}
            autoSuspendInput={autoSuspendInput}
            setAutoSuspendInput={setAutoSuspendInput}
            saveAutoSuspendThreshold={saveAutoSuspendThreshold}
            isSavingSuspend={isSavingSuspend}
            maxBatchInput={maxBatchInput}
            saveMaxBatchSize={saveMaxBatchSize}
            isSavingMaxBatch={isSavingMaxBatch}
            emergencyRedistribute={emergencyRedistribute}
            isRedistributing={isRedistributing}
            handleAdminLogout={handleAdminLogout}
            queryClient={queryClient}
            theme={theme}
          />
        );
      case "storage":
        return (
          <StorageTab
            storageStats={storageStats}
            storageStatsLoading={storageStatsLoading}
            storageStatsError={storageStatsError}
            loadStorageStats={loadStorageStats}
            theme={theme}
          />
        );
      case "websiteCms":
        return <WebsiteCmsTab />;
    }
  };

  const ADMIN_RED = AppColors.error;

  // H-65: the four badge counts are four full array scans. They used to re-run on
  // every render of this component — i.e. on every keystroke in any admin form,
  // and on every one of the ~40 pieces of form state. Each now depends only on the
  // query result it actually reads.
  const pendingOrdersBadge = useMemo(
    () => adminOrders.filter((o) => o.status === "pending").length,
    [adminOrders],
  );
  const pendingDriversBadge = useMemo(
    () => drivers.filter((d) => d.status === "pending").length,
    [drivers],
  );
  const pendingVendorsBadge = useMemo(
    () => vendorPartners.filter((v) => v.status === "pending").length,
    [vendorPartners],
  );

  const TABS: AdminTab<TabType>[] = useMemo(
    (): AdminTab<TabType>[] => ([
      { key: "dashboard", label: "الرئيسية", icon: "home" },
      {
        key: "orders",
        label: "الطلبات",
        icon: "shopping-bag",
        badge: pendingOrdersBadge,
      },
      {
        key: "drivers",
        label: "السائقون",
        icon: "truck",
        badge: pendingDriversBadge,
      },
      { key: "users", label: "المستخدمون", icon: "users" },
      { key: "banners", label: "البانرات", icon: "image" },
      { key: "categories", label: "الأقسام", icon: "grid" },
      { key: "products", label: "المنتجات", icon: "package" },
      { key: "areas", label: "المناطق", icon: "map-pin" },
      { key: "promoCodes", label: "الخصومات", icon: "tag" },
      { key: "notifications", label: "الإشعارات", icon: "bell" },
      {
        key: "vendors",
        label: "المتاجر",
        icon: "briefcase",
        badge: pendingVendorsBadge,
      },
      {
        key: "settlements",
        label: "التسويات",
        icon: "dollar-sign",
        badge: settlementRequests.length,
      },
      { key: "settings", label: "الإعدادات", icon: "settings" },
      { key: "storage", label: "التخزين", icon: "hard-drive" },
      { key: "websiteCms", label: "الموقع", icon: "globe" },
    ] as AdminTab<TabType>[]).filter((tab) => {
      const required: Partial<Record<TabType, string>> = {
        dashboard: "operations.read",
        orders: "orders.read",
        drivers: "drivers.read",
        users: "customers.read",
        banners: "banners.read",
        categories: "categories.read",
        products: "products.read",
        areas: "delivery.read",
        promoCodes: "promotions.read",
        notifications: "notifications.read",
        vendors: "merchants.read",
        settlements: "settlements.read",
        settings: "settings.read",
        storage: "storage.read",
        websiteCms: "website_cms.read",
      };
      const permission = required[tab.key];
      return !permission || !!adminSession?.permissions.includes("*") || !!adminSession?.permissions.includes(permission);
    }),
    [
      pendingOrdersBadge,
      pendingDriversBadge,
      pendingVendorsBadge,
      settlementRequests.length,
      adminSession,
    ],
  );

  // Same two statements the inline `onPress` ran; stabilised so the memoised tab
  // bar is not invalidated by a new closure on every render.
  const handleSelectTab = useCallback(
    (key: TabType) => {
      setActiveTab(key);
      resetForm();
    },
    [resetForm],
  );

  // H-12: hold the whole panel back until the stored admin token is confirmed.
  // Rendering the tab bar first would already leak the operation structure.
  if (adminAuthState === "checking") {
    return (
      <LoadingState
        label="جاري التحقق من جلسة الإدارة..."
        style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.backgroundRoot }}>
      {/* Sticky tab bar — H-65: extracted to a memoised component. */}
      <AdminTabBar
        tabs={TABS}
        activeTab={activeTab}
        onSelect={handleSelectTab}
        accent={ADMIN_RED}
        theme={theme}
        paddingTop={headerHeight}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: Spacing.lg,
          paddingBottom: insets.bottom + Spacing.xl,
          paddingHorizontal: Spacing.lg,
        }}
      >
        {renderContent()}
      </ScrollView>

      <AssignDriverModal
        assigningOrderId={assigningOrderId}
        setAssigningOrderId={setAssigningOrderId}
        assignError={assignError}
        setAssignError={setAssignError}
        approvedDrivers={approvedDrivers}
        assignDriverMutation={assignDriverMutation}
        theme={theme}
      />
      <TrackingModal
        trackingOrderId={trackingOrderId}
        trackingMapHtml={trackingMapHtml}
        trackingDriverName={trackingDriverName}
        trackingWebViewRef={trackingWebViewRef}
        closeTrackingModal={closeTrackingModal}
      />
    </View>
  );
}
