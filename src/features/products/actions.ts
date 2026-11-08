"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { productSchema } from "@/lib/validations";
import type { ActionResult } from "@/features/auth/actions";

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
  const {
    storeId,
    categoryId,
    sku,
    name,
    description,
    priceCents,
    imageUrl,
    isAvailable,
    trackStock,
    stockQuantity,
    lowStockThreshold,
    sortOrder,
    optionGroups,
  } = parsed.data;

  let savedProductId = productId;

  if (productId) {
    // Update existing product (stock_quantity is managed via atomic stock RPC if changed)
    const { error } = await supabase
      .from("products")
      .update({
        category_id: categoryId || null,
        sku: sku || null,
        name,
        description: description || null,
        price_cents: priceCents,
        image_url: imageUrl || null,
        is_available: isAvailable,
        track_stock: trackStock,
        low_stock_threshold: lowStockThreshold,
        sort_order: sortOrder,
      })
      .eq("id", productId)
      .eq("store_id", storeId);

    if (error) {
      return { success: false, error: error.message };
    }
  } else {
    // Insert new product
    const { data, error } = await supabase
      .from("products")
      .insert({
        store_id: storeId,
        category_id: categoryId || null,
        sku: sku || null,
        name,
        description: description || null,
        price_cents: priceCents,
        image_url: imageUrl || null,
        is_available: isAvailable,
        track_stock: trackStock,
        stock_quantity: 0,
        low_stock_threshold: lowStockThreshold,
        sort_order: sortOrder,
      })
      .select("id")
      .single();

    if (error || !data) {
      return {
        success: false,
        error: error?.message ?? "Erro ao criar produto.",
      };
    }

    savedProductId = data.id;

    // Record initial stock movement if stockQuantity > 0
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

  // Sync product option groups if provided
  if (savedProductId && optionGroups) {
    await supabase
      .from("product_option_groups")
      .delete()
      .eq("product_id", savedProductId)
      .eq("store_id", storeId);

    for (let gIdx = 0; gIdx < optionGroups.length; gIdx++) {
      const group = optionGroups[gIdx];
      const { data: createdGroup, error: groupError } = await supabase
        .from("product_option_groups")
        .insert({
          store_id: storeId,
          product_id: savedProductId,
          name: group.name,
          min_select: group.minSelect,
          max_select: Math.max(group.maxSelect, group.minSelect, 1),
          is_required: group.isRequired,
          sort_order: gIdx,
        })
        .select("id")
        .single();

      if (!groupError && createdGroup && group.options.length > 0) {
        await supabase.from("product_options").insert(
          group.options.map((opt, oIdx) => ({
            store_id: storeId,
            group_id: createdGroup.id,
            name: opt.name,
            price_cents: opt.priceCents,
            is_available: opt.isAvailable,
            sort_order: oIdx,
          }))
        );
      }
    }
  }

  revalidatePath("/menu-manager");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  revalidatePath("/menu", "layout");

  return {
    success: true,
    data: { id: savedProductId! },
  };
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
    return { success: false, error: error.message };
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

  // Soft-archive so historical order items retain foreign key integrity
  const { error } = await supabase
    .from("products")
    .update({ is_archived: true, is_available: false })
    .eq("id", productId)
    .eq("store_id", storeId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/menu-manager");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  revalidatePath("/menu", "layout");
  return { success: true };
}

