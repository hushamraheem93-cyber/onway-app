/**
 * useVendors — Public vendor/store listing and detail fetching.
 */

import { useQuery } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/query-client";
import type { VendorCategoryType } from "@/types";

function apiUrl(path: string) {
  return new URL(path, getApiUrl()).toString();
}

export interface VendorListItem {
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
  businessType?: string;
}

// ── All vendors/stores ────────────────────────────────────────────────────────
export function useVendors(businessType?: string) {
  const endpoint = businessType
    ? `/api/stores?businessType=${encodeURIComponent(businessType)}`
    : "/api/stores";

  const { data = [], isLoading, refetch } = useQuery<VendorListItem[]>({
    queryKey: ["/api/stores", businessType ?? "all"],
    queryFn: async () => {
      const res = await fetch(apiUrl(endpoint));
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    staleTime: 5 * 60_000,
  });

  return { vendors: data, vendorsLoading: isLoading, refetchVendors: refetch };
}

// ── Single vendor detail ──────────────────────────────────────────────────────
export function useVendorDetail(vendorId: string | null) {
  const { data, isLoading } = useQuery<VendorListItem>({
    queryKey: ["/api/stores", vendorId],
    queryFn: async () => {
      if (!vendorId) throw new Error("no id");
      const res = await fetch(apiUrl(`/api/stores/${vendorId}`));
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    enabled: !!vendorId,
    staleTime: 5 * 60_000,
  });

  return { vendor: data ?? null, vendorLoading: isLoading };
}
