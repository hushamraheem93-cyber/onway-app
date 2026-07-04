/**
 * useProducts — Product fetching by category, vendor, or promotional section.
 */

import { useQuery } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/query-client";

function apiUrl(path: string) {
  return new URL(path, getApiUrl()).toString();
}

export interface Product {
  id: string;
  name: string;
  price: number;
  image?: string;
  description?: string;
  inStock: boolean;
  categoryId?: string;
  vendorId?: string;
  discount?: number;
  originalPrice?: number;
  weight?: string;
  restaurant?: string;
  isAvailable?: boolean;
}

export interface PromotionalSection {
  id: string;
  label: string;
  type: "bestSellers" | "featured" | "discounts";
  productIds: string[];
  isActive: boolean;
  order: number;
}

// ── Products by category ──────────────────────────────────────────────────────
export function useProductsByCategory(categoryId: string | null) {
  const { data = [], isLoading, refetch } = useQuery<Product[]>({
    queryKey: ["/api/products", categoryId],
    queryFn: async () => {
      if (!categoryId) return [];
      const res = await fetch(apiUrl(`/api/products?categoryId=${encodeURIComponent(categoryId)}`));
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    enabled: !!categoryId,
    staleTime: 5 * 60_000,
  });

  return { products: data, productsLoading: isLoading, refetchProducts: refetch };
}

// ── All products ──────────────────────────────────────────────────────────────
export function useAllProducts() {
  const { data = [], isLoading } = useQuery<Product[]>({
    queryKey: ["/api/products"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/products"));
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    staleTime: 5 * 60_000,
  });

  return { allProducts: data, allProductsLoading: isLoading };
}

// ── Vendor store products ─────────────────────────────────────────────────────
export function useStoreProducts(vendorId: string | null) {
  const { data = [], isLoading } = useQuery<Product[]>({
    queryKey: ["/api/stores", vendorId, "products"],
    queryFn: async () => {
      if (!vendorId) return [];
      const res = await fetch(apiUrl(`/api/stores/${vendorId}/products`));
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    enabled: !!vendorId,
    staleTime: 5 * 60_000,
  });

  return { storeProducts: data, storeProductsLoading: isLoading };
}

// ── Promotional sections + products ──────────────────────────────────────────
export function usePromotionalSections() {
  const { data = [], isLoading } = useQuery<PromotionalSection[]>({
    queryKey: ["/api/promotional-sections"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/promotional-sections"));
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    staleTime: 10 * 60_000,
  });

  return { promotionalSections: data, sectionsLoading: isLoading };
}
