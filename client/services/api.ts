/**
 * OnWay — API service layer.
 * Centralises all HTTP calls. Screens import functions, not raw fetch().
 */

import { apiRequest, getApiUrl } from "@/lib/query-client";
import type { ApiResponse } from "@/types";

// ── Helpers ───────────────────────────────────────────────────────────────────
function url(path: string) {
  return new URL(path, getApiUrl()).toString();
}

async function get<T>(path: string, token?: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(url(path), { headers, credentials: "include" });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

async function post<T>(path: string, body: unknown, token?: string): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(url(path), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    credentials: "include",
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

async function patch<T>(path: string, body: unknown, token?: string): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(url(path), {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
    credentials: "include",
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

async function del<T>(path: string, token?: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(url(path), {
    method: "DELETE",
    headers,
    credentials: "include",
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export const AuthService = {
  sendOtp: (phoneNumber: string) =>
    post<ApiResponse>("/api/auth/send-otp", { phoneNumber }),

  verifyOtp: (phoneNumber: string, code: string) =>
    post<{ success: boolean; customerToken: string }>("/api/auth/verify-otp", {
      phoneNumber,
      code,
    }),
};

// ── Categories ────────────────────────────────────────────────────────────────
export const CategoryService = {
  getAll: () => get<unknown[]>("/api/categories"),
};

// ── Vendors ───────────────────────────────────────────────────────────────────
export const VendorService = {
  getAll: () => get<unknown[]>("/api/vendors"),
  getById: (id: string) => get<unknown>(`/api/vendors/${id}`),
  getProducts: (vendorId: string) => get<unknown[]>(`/api/vendors/${vendorId}/products`),
};

// ── Products ──────────────────────────────────────────────────────────────────
export const ProductService = {
  getByCategory: (categoryId: string) =>
    get<unknown[]>(`/api/products?categoryId=${categoryId}`),
};

// ── Orders ────────────────────────────────────────────────────────────────────
export const OrderService = {
  getByPhone: (phoneNumber: string, token: string) =>
    get<unknown[]>(`/api/orders?phone=${encodeURIComponent(phoneNumber)}`, token),

  create: (orderData: unknown, token: string) =>
    post<{ success: boolean; orderId: string }>("/api/orders", orderData, token),

  getById: (orderId: string, token: string) =>
    get<unknown>(`/api/orders/${orderId}`, token),

  rate: (orderId: string, rating: number, token: string) =>
    post<ApiResponse>(`/api/orders/${orderId}/rate`, { rating }, token),

  cancel: (orderId: string, token: string) =>
    patch<ApiResponse>(`/api/orders/${orderId}/status`, { status: "cancelled" }, token),
};

// ── Promo codes ───────────────────────────────────────────────────────────────
export const PromoService = {
  validate: (code: string, phoneNumber: string, token: string) =>
    post<{ valid: boolean; discount?: number; type?: string; value?: number }>(
      "/api/promo/validate",
      { code, phoneNumber },
      token
    ),
};

// ── Push tokens ───────────────────────────────────────────────────────────────
export const PushService = {
  saveCustomerToken: (phoneNumber: string, pushToken: string) =>
    post<ApiResponse>("/api/user/push-token", { phoneNumber, pushToken }),

  saveDriverToken: (phoneNumber: string, pushToken: string) =>
    post<ApiResponse>("/api/driver/refresh-push-token", { phoneNumber, pushToken }),
};

// ── Driver ────────────────────────────────────────────────────────────────────
export const DriverService = {
  check: (phoneNumber: string) =>
    get<{ exists: boolean }>(`/api/drivers/check/${encodeURIComponent(phoneNumber)}`),

  getStatus: (phoneNumber: string) =>
    get<unknown>(`/api/driver/status/${encodeURIComponent(phoneNumber)}`),

  setOnline: (phoneNumber: string, isOnline: boolean) =>
    post<ApiResponse>("/api/driver/toggle-online", { phoneNumber, isOnline }),

  acceptBatch: (batchId: string, phoneNumber: string) =>
    post<ApiResponse>("/api/driver/batch/accept", { batchId, phoneNumber }),

  pickupOrder: (batchId: string, orderId: string, phoneNumber: string) =>
    post<ApiResponse>("/api/driver/batch/pickup-order", { batchId, orderId, phoneNumber }),

  completeOrder: (batchId: string, orderId: string, phoneNumber: string) =>
    post<ApiResponse>("/api/driver/batch/complete-order", { batchId, orderId, phoneNumber }),
};

// ── Vendor (merchant portal) ──────────────────────────────────────────────────
export const MerchantService = {
  getOrders: (vendorId: string, token: string) =>
    get<unknown[]>(`/api/vendor/orders?vendorId=${vendorId}`, token),

  updateOrderStatus: (orderId: string, status: string, token: string) =>
    patch<ApiResponse>(`/api/vendor/orders/${orderId}/status`, { status }, token),

  getProducts: (vendorId: string, token: string) =>
    get<unknown[]>(`/api/vendor/products?vendorId=${vendorId}`, token),
};

// ── Admin ─────────────────────────────────────────────────────────────────────
export const AdminService = {
  login: (username: string, password: string) =>
    post<{ token: string }>("/api/admin/login", { username, password }),

  getBanners: () => get<unknown[]>("/api/admin/banners"),
  getOrders: () => get<unknown[]>("/api/admin/orders"),
  getDrivers: () => get<unknown[]>("/api/admin/drivers"),
  getCustomers: () => get<unknown[]>("/api/admin/customers"),
};
