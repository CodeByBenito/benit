"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionResult } from "@/features/auth/actions";
import { assetPathFromPublicUrl } from "@/lib/images/brand-assets";
import { cleanDbError } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import { productSchema, reorderCatalogSchema } from "@/lib/validations";
import type { z } from "zod";

type ProductInput = z.infer<typeof productSchema>;

function revalidateCatalog() {
  revalidatePath("/menu-manager");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  revalidatePath("/menu", "layout");
}

/**
 * Syncs the option groups of a product with the editor's state, keeping the
 * ids of groups and options that still exist. Ids matter: a customer with the
 * menu open has them in the bag, and recreating everything on each save would
 * make that order fail with "invalid option".
 */
async function syncOptionGroups(supabase: SupabaseClient, storeId: string, productId: string, groups: ProductInput["optionGroups"]): Promise<string | null> {
  const { data: existingGroups, error: readError } = await supabase
    .from("product_option_groups")
    .select("id, options:product_options(id)")
    .eq("product_id", productId)
    .eq("store_id", storeId);
  if (readError) return readError.message;

  const existing = new Map((existingGroups ?? []).map((g) => [g.id as string, new Set(((g.options ?? []) as { id: string }[]).map((o) => o.id))]));
  const keptGroupIds = new Set<string>();

  for (let gIdx = 0; gIdx < groups.length; gIdx++) {
    const group = groups[gIdx];
    const row = {
      name: group.name,
      min_select: group.isRequired ? Math.max(1, group.minSelect) : group.minSelect,
      max_select: Math.max(group.maxSelect, group.minSelect, 1),
      is_required: group.isRequired,
      sort_order: gIdx,
    };

    let groupId = group.id && existing.has(group.id) ? group.id : null;
    if (groupId) {
      const { error } = await supabase.from("product_option_groups").update(row).eq("id", groupId).eq("store_id", storeId);
      if (error) return error.message;
    } else {
      const { data, error } = await supabase
        .from("product_option_groups")
        .insert({ ...row, store_id: storeId, product_id: productId })
        .select("id")
        .single();
      if (error || !data) return error?.message ?? "Erro ao salvar grupo de adicionais.";
      groupId = data.id as string;
    }
    keptGroupIds.add(groupId);

    const existingOptions = existing.get(groupId) ?? new Set<string>();
    const keptOptionIds = new Set<string>();
    const toInsert: Record<string, unknown>[] = [];
    for (let oIdx = 0; oIdx < group.options.length; oIdx++) {
      const option = group.options[oIdx];
      const optionRow = { name: option.name, price_cents: option.priceCents, is_available: option.isAvailable, sort_order: oIdx };
      if (option.id && existingOptions.has(option.id)) {
        keptOptionIds.add(option.id);
        const { error } = await supabase.from("product_options").update(optionRow).eq("id", option.id).eq("store_id", storeId);
        if (error) return error.message;
      } else {
        toInsert.push({ ...optionRow, store_id: storeId, group_id: groupId });
      }
    }
    if (toInsert.length) {
      const { error } = await supabase.from("product_options").insert(toInsert);
      if (error) return error.message;
    }
    const removedOptions = [...existingOptions].filter((id) => !keptOptionIds.has(id));
    if (removedOptions.length) {
      const { error } = await supabase.from("product_options").delete().in("id", removedOptions).eq("store_id", storeId);
      if (error) return error.message;
    }
  }

  const removedGroups = [...existing.keys()].filter((id) => !keptGroupIds.has(id));
  if (removedGroups.length) {
    const { error } = await supabase.from("product_option_groups").delete().in("id", removedGroups).eq("store_id", storeId);
    if (error) return error.message;
  }
  return null;
}

export async function saveProductAction(
  payload: unknown,
  productId?: string
): Promise<ActionResult<{ id: string }>> {
  const parsed = productSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dados do produto inválidos.",
    };
  }

  const supabase = await createClient();
  const { storeId, categoryId, sku, name, description, priceCents, imageUrl, isAvailable, trackStock, stockQuantity, lowStockThreshold, optionGroups } = parsed.data;

  // A new photo must be a file of this store in our bucket. An address that
  // was already saved (older catalogs) may stay as it is.
  const nextImage = imageUrl || null;
  let currentImage: string | null = null;
  let currentCategory: string | null = null;
  if (productId) {
    const { data: current, error } = await supabase.from("products").select("image_url, category_id").eq("id", productId).eq("store_id", storeId).single();
    if (error || !current) return { success: false, error: "Produto não encontrado." };
    currentImage = current.image_url;
    currentCategory = current.category_id;
  }
  if (nextImage && nextImage !== currentImage) {
    const path = assetPathFromPublicUrl(nextImage, process.env.NEXT_PUBLIC_SUPABASE_URL);
    if (!path || !path.startsWith(`${storeId}/`)) {
      return { success: false, error: "Envie a foto pelo botão de upload." };
    }
  }

  const nextCategory = categoryId || null;
  /** Last position of a category (new products and products that change category go to the end). */
  const endOfCategory = async () => {
    let query = supabase.from("products").select("sort_order").eq("store_id", storeId).eq("is_archived", false).order("sort_order", { ascending: false }).limit(1);
    query = nextCategory ? query.eq("category_id", nextCategory) : query.is("category_id", null);
    const { data } = await query;
    return (data?.[0]?.sort_order ?? -10) + 10;
  };

  let savedProductId = productId;

  if (productId) {
    // stock_quantity only changes through the atomic stock RPC.
    const update: Record<string, unknown> = {
      category_id: nextCategory,
      sku: sku || null,
      name,
      description: description || null,
      price_cents: priceCents,
      image_url: nextImage,
      is_available: isAvailable,
      track_stock: trackStock,
      low_stock_threshold: lowStockThreshold,
    };
    if (nextCategory !== currentCategory) update.sort_order = await endOfCategory();

    const { error } = await supabase.from("products").update(update).eq("id", productId).eq("store_id", storeId);
    if (error) return { success: false, error: cleanDbError(error.message, "Erro ao salvar produto.") };
  } else {
    const { data, error } = await supabase
      .from("products")
      .insert({
        store_id: storeId,
        category_id: nextCategory,
        sku: sku || null,
        name,
        description: description || null,
        price_cents: priceCents,
        image_url: nextImage,
        is_available: isAvailable,
        track_stock: trackStock,
        stock_quantity: 0,
        low_stock_threshold: lowStockThreshold,
        sort_order: await endOfCategory(),
      })
      .select("id")
      .single();

    if (error || !data) {
      return { success: false, error: cleanDbError(error?.message, "Erro ao criar produto.") };
    }
    savedProductId = data.id;

    if (trackStock && stockQuantity > 0) {
      await supabase.rpc("adjust_product_stock_atomic", {
        p_store_id: storeId,
        p_product_id: savedProductId,
        p_movement_type: "INITIAL",
        p_quantity: stockQuantity,
        p_reason: "Estoque inicial no cadastro do produto",
      });
    }
  }

  const syncError = await syncOptionGroups(supabase, storeId, savedProductId!, optionGroups);
  revalidateCatalog();
  if (syncError) {
    return { success: false, error: `O produto foi salvo, mas os adicionais não: ${cleanDbError(syncError, "erro desconhecido")}` };
  }

  return { success: true, data: { id: savedProductId! } };
}

export async function toggleProductAvailabilityAction(
  storeId: string,
  productId: string,
  isAvailable: boolean
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({ is_available: isAvailable })
    .eq("id", productId)
    .eq("store_id", storeId);

  if (error) {
    return { success: false, error: cleanDbError(error.message, "Não foi possível alterar a disponibilidade.") };
  }

  revalidatePath("/menu-manager");
  revalidatePath("/dashboard");
  revalidatePath("/menu", "layout");
  return { success: true };
}

export async function deleteOrArchiveProductAction(
  storeId: string,
  productId: string
): Promise<ActionResult> {
  const supabase = await createClient();

  // Soft-archive so historical order items keep their reference.
  const { error } = await supabase
    .from("products")
    .update({ is_archived: true, is_available: false })
    .eq("id", productId)
    .eq("store_id", storeId);

  if (error) {
    return { success: false, error: cleanDbError(error.message, "Não foi possível remover o produto.") };
  }

  revalidateCatalog();
  return { success: true };
}

/** Saves a drag-and-drop order: `ids` is the complete new order of one list. */
export async function reorderCatalogAction(payload: unknown): Promise<ActionResult> {
  const parsed = reorderCatalogSchema.safeParse(payload);
  if (!parsed.success) return { success: false, error: "Ordem inválida." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("reorder_catalog", {
    p_store_id: parsed.data.storeId,
    p_kind: parsed.data.kind,
    p_ids: parsed.data.ids,
  });
  if (error) return { success: false, error: cleanDbError(error.message, "Não foi possível salvar a ordem.") };

  revalidatePath("/menu-manager");
  revalidatePath("/menu", "layout");
  return { success: true };
}
