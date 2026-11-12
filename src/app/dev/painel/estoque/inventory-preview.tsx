"use client";

import { InventoryControlClient, type InventoryActions } from "@/components/inventory/inventory-control-client";
import type { Category, Product, StockMovement } from "@/types/domain.types";

const wait = () => new Promise((r) => setTimeout(r, 250));

export function InventoryPreview({ storeId, categories, products, movements }: { storeId: string; categories: Category[]; products: Product[]; movements: StockMovement[] }) {
  /** Preview-only: answers like the server and serves the history from the fixtures. */
  const actions: InventoryActions = {
    async adjust({ reason }) {
      await wait();
      if (reason === "falha") return { success: false, error: "Prévia: erro simulado ao lançar." };
      return { success: true };
    },
    async history(_storeId, productId) {
      await wait();
      return { success: true, data: movements.filter((m) => m.product_id === productId) };
    },
  };
  return <InventoryControlClient storeId={storeId} categories={categories} products={products} movements={movements} actions={actions} />;
}
