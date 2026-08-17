/**
 * Types shared between AdminScreen and the tab components split out of it (H-65).
 *
 * `TabType` lived inside AdminScreen.tsx. Once tabs became their own files they
 * needed it too, and importing it back from AdminScreen would make the module
 * graph circular — the parent already imports the children. Moving the union
 * here keeps the single source of truth without the cycle. The union itself is
 * unchanged: same fifteen keys, same order.
 */
/**
 * `VendorPartner` and `VendorProduct` moved here for the same reason: the vendors
 * tab now lives in its own file and annotates with both, while AdminScreen still
 * needs them for the queries it owns. Field-for-field identical to the interfaces
 * that were declared in AdminScreen.tsx.
 */
export interface VendorPartner {
  id: string;
  storeName: string;
  businessType: string;
  phoneNumber: string;
  status: "pending" | "active" | "rejected" | "suspended";
  address?: string;
  bio?: string;
  profileImageUrl?: string;
  coverImageUrl?: string;
  totalProducts?: number;
  rating?: number;
  deliveryTime?: string;
  deliveryPrice?: number;
  createdAt?: string;
  approvedAt?: string;
}

export interface VendorProduct {
  id: string;
  vendorId: string;
  name: string;
  price: number;
  imageUrl?: string;
  imageUrls?: string[];
  imageThumbs?: string[];
  status: "approved" | "pending" | "rejected" | "deleted";
  stock?: number;
  category?: string;
  description?: string;
}

export type TabType =
  | "dashboard"
  | "orders"
  | "drivers"
  | "users"
  | "banners"
  | "categories"
  | "products"
  | "areas"
  | "promoCodes"
  | "notifications"
  | "vendors"
  | "settlements"
  | "settings"
  | "storage"
  | "websiteCms";
