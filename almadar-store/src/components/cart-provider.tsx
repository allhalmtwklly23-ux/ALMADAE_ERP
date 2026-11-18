"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import type { Product } from "@/data/products";

export type CartItem = { key: string; product: Product; color: Product["colors"][number]; size: string; quantity: number };
type CartContextValue = {
  items: CartItem[];
  count: number;
  addItem: (product: Product, color: Product["colors"][number], size: string) => void;
  removeItem: (key: string) => void;
  changeQuantity: (key: string, amount: number) => void;
};
const CartContext = createContext<CartContextValue | null>(null);
const storageKey = "almadar-cart";
const emptyItems: CartItem[] = [];
let cartItems = emptyItems;
let hasReadStorage = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!hasReadStorage && typeof window !== "undefined") {
    hasReadStorage = true;
    try {
      const stored = window.localStorage.getItem(storageKey);
      const parsed = stored ? JSON.parse(stored) as CartItem[] : [];
      cartItems = parsed.filter((item) => item.key && item.color && item.size && item.product);
    } catch {
      window.localStorage.removeItem(storageKey);
      cartItems = emptyItems;
    }
    listener();
  }
  return () => listeners.delete(listener);
}

function getSnapshot() { return cartItems; }
function getServerSnapshot() { return emptyItems; }

function updateCart(update: (current: CartItem[]) => CartItem[]) {
  cartItems = update(cartItems);
  if (typeof window !== "undefined") {
    try { window.localStorage.setItem(storageKey, JSON.stringify(cartItems)); }
    catch { /* Keep the in-memory cart if browser storage is unavailable. */ }
  }
  listeners.forEach((listener) => listener());
}

export function CartProvider({ children }: { children: ReactNode }) {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const addItem = (product: Product, color: Product["colors"][number], size: string) => {
    const key = `${product.id}:${color.hex}:${size}`;
    updateCart((current) => {
      const existing = current.find((item) => item.key === key);
      return existing
        ? current.map((item) => item.key === key ? { ...item, quantity: item.quantity + 1 } : item)
        : [...current, { key, product, color, size, quantity: 1 }];
    });
  };
  const removeItem = (key: string) => updateCart((current) => current.filter((item) => item.key !== key));
  const changeQuantity = (key: string, amount: number) => updateCart((current) => current
    .map((item) => item.key === key ? { ...item, quantity: item.quantity + amount } : item)
    .filter((item) => item.quantity > 0));
  const count = items.reduce((total, item) => total + item.quantity, 0);

  return <CartContext.Provider value={{ items, count, addItem, removeItem, changeQuantity }}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside CartProvider");
  return context;
}
