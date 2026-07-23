import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef, ReactNode } from "react";
import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Product, ProductVariant, ProductAddon } from "@/constants/categories";

const CART_STORAGE_KEY = "@onway_cart";

export interface CartItem {
  product: Product;
  quantity: number;
  selectedVariant?: ProductVariant;
  selectedAddons?: ProductAddon[];
}

/** Unique key per cart entry — same product with different variants = different entries. */
export const getCartKey = (item: Pick<CartItem, "product" | "selectedVariant">): string =>
  item.product.id + "__" + (item.selectedVariant?.id || "base");

/** Effective price of a single unit (base + variant adjustment + addons). */
export const getItemUnitPrice = (item: CartItem): number =>
  item.product.price +
  (item.selectedVariant?.priceAdjustment ?? 0) +
  (item.selectedAddons ?? []).reduce((s, a) => s + a.price, 0);

interface CartContextType {
  items: CartItem[];
  addToCart: (product: Product, selectedVariant?: ProductVariant, selectedAddons?: ProductAddon[]) => void;
  removeFromCart: (productIdOrCartKey: string) => void;
  updateQuantity: (productIdOrCartKey: string, quantity: number) => void;
  clearCart: () => void;
  replaceCart: (newItems: CartItem[]) => void;
  getItemCount: () => number;
  getTotal: () => number;
  /** Vendor the current cart belongs to (undefined when empty or vendor-less items). */
  cartVendorId: string | null;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const hydrated = useRef(false);

  // Load the persisted cart once on mount so it survives app restarts / crashes.
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(CART_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) setItems(parsed);
        }
      } catch {
        // ignore corrupt/absent storage — start with an empty cart
      } finally {
        hydrated.current = true;
      }
    })();
  }, []);

  // Persist on every change, but only after the initial load so we never clobber a
  // stored cart with the empty initial state.
  useEffect(() => {
    if (!hydrated.current) return;
    AsyncStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items)).catch(() => {});
  }, [items]);

  const addToCart = useCallback((
    product: Product,
    selectedVariant?: ProductVariant,
    selectedAddons?: ProductAddon[]
  ) => {
    // A single order maps to a single vendor. If the cart already holds items from a
    // different vendor, don't silently mix them — prompt to start a fresh cart.
    const cartVendorId = items.find((i) => i.product.vendorId)?.product.vendorId;
    const newVendorId = product.vendorId;
    if (items.length > 0 && cartVendorId && newVendorId && cartVendorId !== newVendorId) {
      Alert.alert(
        "منتجات من متجر آخر",
        "سلّتك تحتوي منتجات من متجر مختلف. لا يمكن الطلب من متجرين في طلب واحد. هل تريد إفراغ السلّة والبدء بهذا المتجر؟",
        [
          { text: "إلغاء", style: "cancel" },
          {
            text: "إفراغ والبدء من جديد",
            style: "destructive",
            onPress: () => setItems([{ product, quantity: 1, selectedVariant, selectedAddons }]),
          },
        ],
      );
      return;
    }
    const key = product.id + "__" + (selectedVariant?.id || "base");
    setItems((prev) => {
      const existing = prev.find((item) => getCartKey(item) === key);
      if (existing) {
        return prev.map((item) =>
          getCartKey(item) === key ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { product, quantity: 1, selectedVariant, selectedAddons }];
    });
  }, [items]);

  /**
   * Remove an item. Accepts either:
   * - a cartKey string (contains "__"): removes the exact variant entry
   * - a plain productId: removes the first matching entry (backward compatible)
   */
  const removeFromCart = useCallback((productIdOrCartKey: string) => {
    setItems((prev) => prev.filter((item) => {
      if (productIdOrCartKey.includes("__")) {
        return getCartKey(item) !== productIdOrCartKey;
      }
      return item.product.id !== productIdOrCartKey;
    }));
  }, []);

  /**
   * Update quantity. Same dual-key convention as removeFromCart.
   */
  const updateQuantity = useCallback((productIdOrCartKey: string, quantity: number) => {
    const isKey = productIdOrCartKey.includes("__");
    if (quantity <= 0) {
      setItems((prev) => prev.filter((item) =>
        isKey ? getCartKey(item) !== productIdOrCartKey : item.product.id !== productIdOrCartKey
      ));
      return;
    }
    setItems((prev) =>
      prev.map((item) => {
        const matches = isKey
          ? getCartKey(item) === productIdOrCartKey
          : item.product.id === productIdOrCartKey;
        return matches ? { ...item, quantity } : item;
      })
    );
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  /** Replace entire cart (used for re-order). */
  const replaceCart = useCallback((newItems: CartItem[]) => {
    setItems(newItems);
  }, []);

  const getItemCount = useCallback(() => {
    return items.reduce((total, item) => total + item.quantity, 0);
  }, [items]);

  const getTotal = useCallback(() => {
    return items.reduce((total, item) => total + getItemUnitPrice(item) * item.quantity, 0);
  }, [items]);

  const value = useMemo(
    () => ({
      items,
      addToCart,
      removeFromCart,
      updateQuantity,
      clearCart,
      replaceCart,
      getItemCount,
      getTotal,
      cartVendorId: items.find((i) => i.product.vendorId)?.product.vendorId ?? null,
    }),
    [items, addToCart, removeFromCart, updateQuantity, clearCart, replaceCart, getItemCount, getTotal],
  );

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
