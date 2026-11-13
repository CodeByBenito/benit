import type { Product, StockMovementType } from "@/types/domain.types";

/** Stock level rules shared by the inventory screen and its tests. */

export type StockLevel = "untracked" | "out" | "low" | "ok";

type StockFields = Pick<Product, "track_stock" | "stock_quantity" | "low_stock_threshold">;

export function stockLevel(p: StockFields): StockLevel {
  if (!p.track_stock) return "untracked";
  if (p.stock_quantity <= 0) return "out";
  if (p.stock_quantity <= p.low_stock_threshold) return "low";
  return "ok";
}

/** "Abaixo do mínimo" includes sold-out products: both need buying. */
export function isBelowMinimum(p: StockFields): boolean {
  const level = stockLevel(p);
  return level === "out" || level === "low";
}

/**
 * Geometry of the level bar. The scale goes up to three times the minimum (or
 * the current quantity when it is larger), so the minimum marker sits at one
 * third on a healthy product and the bar never overflows.
 */
export function levelBar(p: StockFields): { fill: number; marker: number | null } {
  if (!p.track_stock) return { fill: 0, marker: null };
  const scale = Math.max(p.low_stock_threshold * 3, p.stock_quantity, 1);
  return {
    fill: Math.min(100, Math.max(0, (p.stock_quantity / scale) * 100)),
    marker: p.low_stock_threshold > 0 ? Math.min(100, (p.low_stock_threshold / scale) * 100) : null,
  };
}

const ORDER: Record<StockLevel, number> = { out: 0, low: 1, ok: 2, untracked: 3 };

/** What needs attention first: sold out, then low, then the rest; untracked last. */
export function byUrgency<T extends StockFields & { name: string }>(a: T, b: T): number {
  const diff = ORDER[stockLevel(a)] - ORDER[stockLevel(b)];
  if (diff !== 0) return diff;
  if (a.track_stock && b.track_stock) {
    const ratio = (p: StockFields) => p.stock_quantity / Math.max(1, p.low_stock_threshold);
    const r = ratio(a) - ratio(b);
    if (r !== 0) return r;
  }
  return a.name.localeCompare(b.name, "pt-BR");
}

export type AdjustMode = "ENTRY" | "EXIT" | "ADJUSTMENT";

/** Quantity after an adjustment, or the reason it is not allowed. */
export function previewAdjustment(current: number, mode: AdjustMode, quantity: number): { next: number; error: string | null } {
  if (!Number.isInteger(quantity) || quantity < 0) return { next: current, error: "Informe uma quantidade inteira." };
  if (mode === "ADJUSTMENT") return { next: quantity, error: null };
  if (quantity === 0) return { next: current, error: "Informe uma quantidade maior que zero." };
  if (mode === "ENTRY") return { next: current + quantity, error: null };
  if (quantity > current) return { next: current, error: `Só há ${current} em estoque.` };
  return { next: current - quantity, error: null };
}

export const MOVEMENT_LABEL: Record<StockMovementType, string> = {
  INITIAL: "Saldo inicial",
  ENTRY: "Entrada",
  EXIT: "Saída",
  ADJUSTMENT: "Contagem",
  ORDER_DEDUCTION: "Pedido",
  ORDER_REVERSAL: "Pedido cancelado",
};
