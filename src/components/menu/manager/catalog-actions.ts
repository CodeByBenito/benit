"use client";

import type { ActionResult } from "@/features/auth/actions";
import { createCategoryAction, deleteCategoryAction, setCategoryActiveAction, updateCategoryAction } from "@/features/categories/actions";
import { deleteOrArchiveProductAction, reorderCatalogAction, saveProductAction, toggleProductAvailabilityAction } from "@/features/products/actions";
import { ACCEPTED_IMAGE_TYPES, ASSETS_BUCKET } from "@/lib/images/brand-assets";
import { resizeToFit } from "@/lib/images/encode";
import { createClient } from "@/lib/supabase/client";

export interface CategoryPayload {
  storeId: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface ProductPayload {
  storeId: string;
  categoryId: string | null;
  sku: string | null;
  name: string;
  description: string | null;
  priceCents: number;
  imageUrl: string | null;
  isAvailable: boolean;
  trackStock: boolean;
  stockQuantity: number;
  lowStockThreshold: number;
  optionGroups: {
    id?: string;
    name: string;
    minSelect: number;
    maxSelect: number;
    isRequired: boolean;
    options: { id?: string; name: string; priceCents: number; isAvailable: boolean }[];
  }[];
}

export type PhotoResult = { ok: true; url: string } | { ok: false; error: string };

/** Everything the menu manager does on the server. Injectable so /dev previews run on fixtures. */
export interface CatalogActions {
  saveProduct: (payload: ProductPayload, productId?: string) => Promise<ActionResult<{ id: string }>>;
  toggleAvailability: (storeId: string, productId: string, isAvailable: boolean) => Promise<ActionResult>;
  archiveProduct: (storeId: string, productId: string) => Promise<ActionResult>;
  reorder: (payload: { storeId: string; kind: "category" | "product"; ids: string[] }) => Promise<ActionResult>;
  createCategory: (payload: CategoryPayload) => Promise<ActionResult<{ id: string }>>;
  updateCategory: (categoryId: string, payload: CategoryPayload) => Promise<ActionResult>;
  setCategoryActive: (storeId: string, categoryId: string, isActive: boolean) => Promise<ActionResult>;
  deleteCategory: (storeId: string, categoryId: string) => Promise<ActionResult>;
  uploadPhoto: (storeId: string, file: File) => Promise<PhotoResult>;
}

/** Phone photos are large; they are resized before upload, so the input cap is generous. */
export const MAX_PHOTO_INPUT_BYTES = 12 * 1024 * 1024;
const PHOTO_MAX_SIDE = 1200;
const EXTENSION: Record<string, string> = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };

export function validatePhotoFile(file: { type: string; size: number }): string | null {
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) return "Envie uma foto JPG, PNG ou WebP.";
  if (file.size > MAX_PHOTO_INPUT_BYTES) return "A foto precisa ter no máximo 12 MB.";
  if (file.size === 0) return "O arquivo está vazio.";
  return null;
}

/** Resizes to 1200px (WebP) in the browser and uploads to `<store_id>/products/`. */
async function uploadPhoto(storeId: string, file: File): Promise<PhotoResult> {
  const invalid = validatePhotoFile(file);
  if (invalid) return { ok: false, error: invalid };
  try {
    const blob = await resizeToFit(file, PHOTO_MAX_SIDE);
    const supabase = createClient();
    const path = `${storeId}/products/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${EXTENSION[blob.type] ?? "webp"}`;
    const { error } = await supabase.storage.from(ASSETS_BUCKET).upload(path, blob, { contentType: blob.type, cacheControl: "31536000", upsert: false });
    if (error) return { ok: false, error: "Não foi possível enviar a foto. Confira sua conexão e tente de novo." };
    return { ok: true, url: supabase.storage.from(ASSETS_BUCKET).getPublicUrl(path).data.publicUrl };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Não foi possível processar a foto." };
  }
}

export const serverCatalogActions: CatalogActions = {
  saveProduct: saveProductAction,
  toggleAvailability: toggleProductAvailabilityAction,
  archiveProduct: deleteOrArchiveProductAction,
  reorder: reorderCatalogAction,
  createCategory: createCategoryAction,
  updateCategory: updateCategoryAction,
  setCategoryActive: setCategoryActiveAction,
  deleteCategory: deleteCategoryAction,
  uploadPhoto,
};
