"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

type FavoritesContextValue = { ids: string[]; toggleFavorite: (id: string) => void };
const FavoritesContext = createContext<FavoritesContextValue | null>(null);
const storageKey = "almadar-favorites";
const emptyIds: string[] = [];
let favoriteIds = emptyIds;
let hasReadStorage = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!hasReadStorage && typeof window !== "undefined") {
    hasReadStorage = true;
    try {
      const stored = window.localStorage.getItem(storageKey);
      favoriteIds = stored ? JSON.parse(stored) as string[] : emptyIds;
    } catch {
      window.localStorage.removeItem(storageKey);
      favoriteIds = emptyIds;
    }
    listener();
  }
  return () => listeners.delete(listener);
}

function getSnapshot() { return favoriteIds; }
function getServerSnapshot() { return emptyIds; }

function updateFavorites(id: string) {
  favoriteIds = favoriteIds.includes(id)
    ? favoriteIds.filter((favoriteId) => favoriteId !== id)
    : [...favoriteIds, id];
  if (typeof window !== "undefined") {
    try { window.localStorage.setItem(storageKey, JSON.stringify(favoriteIds)); }
    catch { /* Keep the in-memory list if browser storage is unavailable. */ }
  }
  listeners.forEach((listener) => listener());
}

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const ids = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return <FavoritesContext.Provider value={{ ids, toggleFavorite: updateFavorites }}>{children}</FavoritesContext.Provider>;
}

export function useFavorites() {
  const context = useContext(FavoritesContext);
  if (!context) throw new Error("useFavorites must be used inside FavoritesProvider");
  return context;
}
