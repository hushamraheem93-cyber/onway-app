/**
 * OnWay — Shared types between client and server.
 * Database: Firebase Firestore (not PostgreSQL).
 */

// NOTE (2026-07-04): "delivering" was a duplicate of "in_delivery" that only the
// admin panel's manual status button ever set. Several driver-facing screens and
// server checks only recognized "in_delivery", so an order manually flipped to
// "delivering" by an admin could silently disappear from the driver's active-order
// view. Standardized on "in_delivery" everywhere — see AdminScreen.tsx fix.
export type OrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "ready"
  | "picked_up"
  | "in_delivery"
  | "delivered"
  | "cancelled"
  | "issue";

export type UserRole = "customer" | "vendor" | "driver" | "admin";
export type BatchStatus = "pending" | "in_progress" | "completed";
export type VendorCategoryType = "restaurant" | "store" | "grocery" | "cafe" | "pharmacy";
export type PromoCodeType = "fixed" | "percentage";
export type DriverActivityType = "earning" | "withdrawal" | "bonus" | "deduction";

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface OrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
  restaurant?: string;
}

export interface DeliveryAddress {
  label?: string;
  street?: string;
  area?: string;
  city: string;
  coordinates?: { lat: number; lng: number };
  notes?: string;
}

export interface DeliveryBatch {
  id: string;
  driverId: string;
  status: BatchStatus;
  orderIds: string[];
  totalOrders: number;
  completedOrders: number;
  totalDistance?: number;
  totalEarnings: number;
  createdAt: string;
  updatedAt: string;
}

export interface DriverStats {
  totalDeliveries: number;
  totalEarnings: number;
  balance: number;
  rating?: number;
  ratingCount?: number;
}
