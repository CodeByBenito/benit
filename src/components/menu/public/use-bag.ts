"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CartItem } from "./types";

function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Bag persisted per store (survives refresh / accidental back). Storage may be
 * unavailable (private mode) — every access is guarded and the bag still works
 * in memory. The idempotency key is created once per checkout session so a
 * double tap or network retry can never create two orders.
 */
export function useBag(storeId: string) {
  const storageKey = `benit:bag:${storeId}`;
  const [items, setItems] = useState<CartItem[]>([]);
  const [checkoutKey, setCheckoutKey] = useState<string>(() => newKey());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { items?: CartItem[]; checkoutKey?: string };
        if (Array.isArray(parsed.items)) setItems(parsed.items);
        if (parsed.checkoutKey) setCheckoutKey(parsed.checkoutKey);
      }
    } catch {
      /* storage unavailable */
    }
    setHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ items, checkoutKey }));
    } catch {
      /* storage unavailable */
    }
  }, [items, checkoutKey, hydrated, storageKey]);

  const add = useCallback((item: Omit<CartItem, "key">) => {
    setItems((prev) => {
      const sig = (i: Pick<CartItem, "productId" | "options" | "notes">) =>
        `${i.productId}|${i.options.map((o) => o.id).sort().join(",")}|${i.notes.trim()}`;
      const existing = prev.find((p) => sig(p) === sig(item));
      if (existing) return prev.map((p) => (p === existing ? { ...p, quantity: p.quantity + item.quantity } : p));
      return [...prev, { ...item, key: newKey() }];
    });
  }, []);

  const setQuantity = useCallback((key: string, quantity: number) => {
    setItems((prev) => (quantity <= 0 ? prev.filter((p) => p.key !== key) : prev.map((p) => (p.key === key ? { ...p, quantity } : p))));
  }, []);

  /** After a successful order: empty bag, fresh idempotency key for the next one. */
  const reset = useCallback(() => {
    setItems([]);
    setCheckoutKey(newKey());
  }, []);

  const count = useMemo(() => items.reduce((n, i) => n + i.quantity, 0), [items]);
  const subtotalCents = useMemo(() => items.reduce((n, i) => n + i.unitCents * i.quantity, 0), [items]);
  const apiItems = useMemo(
    () => items.map((i) => ({ product_id: i.productId, quantity: i.quantity, option_ids: i.options.map((o) => o.id), notes: i.notes || undefined })),
    [items]
  );

  return { items, add, setQuantity, reset, count, subtotalCents, apiItems, checkoutKey, hydrated };
}
