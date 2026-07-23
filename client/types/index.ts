/**
 * OnWay — Client-side TypeScript types.
 * Re-exports shared types and defines client-specific interfaces.
 */

export type {
  OrderStatus,
  UserRole,
  BatchStatus,
  VendorCategoryType,
  PromoCodeType,
  DriverActivityType,
  ApiResponse,
  OrderItem,
  DeliveryAddress,
} from "@shared/schema";

import type { VendorCategoryType, PromoCodeType, UserRole } from "@shared/schema";

// ── Navigation param lists ────────────────────────────────────────────────────
export type RootStackRoutes =
  | "Splash"
  | "UserType"
  | "PhoneLogin"
  | "OtpVerification"
  | "ProfileCompletion"
  | "Main"
  | "DriverTab"
  | "VendorTab"
  | "Admin";

// ── Vendor (store/restaurant) ─────────────────────────────────────────────────
export interface Vendor {
  id: string;
  name: string;
  image?: string;
  coverImage?: string;
  rating?: number | null;
  ratingCount?: number;
  deliveryTime?: string;
  isOpen?: boolean;
  location?: string;
  description?: string;
  categoryType?: VendorCategoryType;
  hasDelivery?: boolean;
  minOrder?: number;
  openTime?: string;
  closeTime?: string;
  sortOrder?: number;
  isVacation?: boolean;
  isBusy?: boolean;
}

// ── Driver ───────────────────────────────────────────────────────────────────
export interface Driver {
  id: string;
  phoneNumber: string;
  name: string;
  vehicleType?: string;
  plateNumber?: string;
  isOnline?: boolean;
  currentBatchId?: string | null;
  balance?: number;
  rating?: number;
  ratingCount?: number;
  pushToken?: string;
  lastSeenAt?: string;
  status?: "active" | "inactive" | "suspended";
  joinedAt?: string;
}

// ── Promo code ────────────────────────────────────────────────────────────────
export interface PromoCode {
  id: string;
  code: string;
  type: PromoCodeType;
  value: number;
  expiryDate: string;
  isActive: boolean;
  usageCount?: number;
  maxUsage?: number;
}

// ── Notification ──────────────────────────────────────────────────────────────
export interface AppNotification {
  id: string;
  title: string;
  body: string;
  type: "order" | "promo" | "system" | "vendor" | "driver";
  isRead: boolean;
  createdAt: string;
  data?: Record<string, unknown>;
}

// ── Support message ───────────────────────────────────────────────────────────
export interface SupportMessage {
  id: string;
  senderId: string;
  senderRole: UserRole;
  text?: string;
  imageUrl?: string;
  createdAt: string;
  isRead?: boolean;
}

// ── Delivery area ─────────────────────────────────────────────────────────────
export interface DeliveryArea {
  id: string;
  name: string;
  fee: number;
  isActive: boolean;
  minOrder?: number;
  estimatedMinutes?: number;
}

// ── Promotional section ───────────────────────────────────────────────────────
export interface PromotionalSection {
  id: string;
  label: string;
  type: "bestSellers" | "featured" | "discounts";
  productIds: string[];
  isActive: boolean;
  order: number;
}
