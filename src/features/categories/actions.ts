"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { categorySchema } from "@/lib/validations";
import type { ActionResult } from "@/features/auth/actions";

export async function createCategoryAction(
  payload: unknown
): Promise<ActionResult<{ id: string }>> {
  const parsed = categorySchema.safeParse(payload);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dados da categoria inválidos.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .insert({
      store_id: parsed.data.storeId,
      name: parsed.data.name,
      description: parsed.data.description || null,
      sort_order: parsed.data.sortOrder,
      is_active: parsed.data.isActive,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { success: false, error: error?.message ?? "Erro ao criar categoria." };
  }

  revalidatePath("/menu-manager");
  revalidatePath("/menu", "layout");
  return { success: true, data: { id: data.id } };
}

export async function updateCategoryAction(
  categoryId: string,
  payload: unknown
): Promise<ActionResult> {
  const parsed = categorySchema.safeParse(payload);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("categories")
    .update({
      name: parsed.data.name,
      description: parsed.data.description || null,
      sort_order: parsed.data.sortOrder,
      is_active: parsed.data.isActive,
    })
    .eq("id", categoryId)
    .eq("store_id", parsed.data.storeId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/menu-manager");
  revalidatePath("/menu", "layout");
  return { success: true };
}

export async function setCategoryActiveAction(
  storeId: string,
  categoryId: string,
  isActive: boolean
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("categories")
    .update({ is_active: isActive })
    .eq("id", categoryId)
    .eq("store_id", storeId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/menu-manager");
  revalidatePath("/menu", "layout");
  return { success: true };
}

export async function deleteCategoryAction(
  storeId: string,
  categoryId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", categoryId)
    .eq("store_id", storeId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/menu-manager");
  revalidatePath("/menu", "layout");
  return { success: true };
}

