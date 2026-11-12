"use client";

import { MenuManagerClient } from "@/components/menu/menu-manager-client";
import type { CatalogActions } from "@/components/menu/manager/catalog-actions";
import type { Category, Product } from "@/types/domain.types";

const wait = () => new Promise((r) => setTimeout(r, 250));
const ok = async () => {
  await wait();
  return { success: true as const };
};

/** Preview-only: answers like the server, keeps everything in the page. */
const previewActions: CatalogActions = {
  async saveProduct(payload, productId) {
    await wait();
    if (payload.name.toLowerCase().includes("erro")) return { success: false, error: "Prévia: erro simulado ao salvar." };
    return { success: true, data: { id: productId ?? `prod-new-${Date.now()}` } };
  },
  toggleAvailability: ok,
  archiveProduct: ok,
  reorder: ok,
  async createCategory() {
    await wait();
    return { success: true, data: { id: `cat-new-${Date.now()}` } };
  },
  updateCategory: ok,
  setCategoryActive: ok,
  deleteCategory: ok,
  async uploadPhoto(_storeId, file) {
    await wait();
    return { ok: true, url: URL.createObjectURL(file) };
  },
};

export function MenuPreview({ storeId, storeSlug, categories, products }: { storeId: string; storeSlug: string; categories: Category[]; products: Product[] }) {
  return <MenuManagerClient storeId={storeId} storeSlug={storeSlug} categories={categories} products={products} actions={previewActions} />;
}
