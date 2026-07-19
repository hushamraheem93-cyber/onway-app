import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef, ReactNode } from "react";
import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Product } from "@/constants/categories";

const CART_STORAGE_KEY = "@onway_cart";

export interface CartItem {
  product: Product;
  quantity: number;
}

interface CartContextType {
  items: CartItem[];
  addToCart: (product: Product) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
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

  const addToCart = useCallback((product: Product) => {
    // A single order maps to a single vendor. If the cart already holds items from a
    // different vendor, don't silently mix them (which produced malformed orders with
    // the wrong vendorId/delivery fee) — prompt to start a fresh cart for the new store.
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
            onPress: () => setItems([{ product, quantity: 1 }]),
          },
        ],
      );
      return;
    }
    setItems((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  }, [items]);

  const removeFromCart = useCallback((productId: string) => {
    setItems((prev) => prev.filter((item) => item.product.id !== productId));
  }, []);

  const updateQuantity = useCallback((productId: string, quantity: number) => {
    if (quantity <= 0) {
      setItems((prev) => prev.filter((item) => item.product.id !== productId));
      return;
    }
    setItems((prev) =>
      prev.map((item) =>
        item.product.id === productId ? { ...item, quantity } : item
      )
    );
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const getItemCount = useCallback(() => {
    return items.reduce((total, item) => total + item.quantity, 0);
  }, [items]);

  const getTotal = useCallback(() => {
    return items.reduce(
      (total, item) => total + item.product.price * item.quantity,
      0
    );
  }, [items]);

  // Stable context value — consumers (product cards, cart bar, checkout) no
  // longer re-render on unrelated provider renders.
  const value = useMemo(
    () => ({
      items,
      addToCart,
      removeFromCart,
      updateQuantity,
      clearCart,
      getItemCount,
      getTotal,
      cartVendorId: items.find((i) => i.product.vendorId)?.product.vendorId ?? null,
    }),
    [items, addToCart, removeFromCart, updateQuantity, clearCart, getItemCount, getTotal],
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
