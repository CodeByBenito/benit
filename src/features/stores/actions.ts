"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { storeSettingsSchema } from "@/lib/validations";
import { ACTIVE_STORE_COOKIE } from "@/lib/permissions/tenant";
import type { ActionResult } from "@/features/auth/actions";
import { requireStoreManager } from "@/features/permissions";

export async function switchActiveStoreAction(storeId: string) {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_STORE_COOKIE, storeId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}

export async function toggleStoreOpenStatusAction(
  storeId: string,
  isOpen: boolean
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("stores")
    .update({ is_open: isOpen })
    .eq("id", storeId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/", "layout");
  return { success: true };
}

export async function updateStoreSettingsAction(
  payload: unknown
): Promise<ActionResult> {
  const parsed = storeSettingsSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dados da loja inválidos.",
    };
  }

  const guard = await requireStoreManager(parsed.data.storeId);
  if (!guard.ok) return { success: false, error: guard.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("stores")
    .update({
      name: parsed.data.name,
      slug: parsed.data.slug,
      description: parsed.data.description || null,
      phone: parsed.data.phone || null,
      whatsapp: parsed.data.whatsapp || null,
      address: parsed.data.address || null,
      logo_url: parsed.data.logoUrl || null,
      banner_url: parsed.data.bannerUrl || null,
      is_open: parsed.data.isOpen,
      is_published: parsed.data.isPublished,
    })
    .eq("id", parsed.data.storeId);

  if (error) {
    if (error.message.includes("stores_slug_key")) {
      return {
        success: false,
        error: "Este slug já está em uso por outro estabelecimento.",
      };
    }
    return { success: false, error: error.message };
  }

  revalidatePath("/", "layout");
  revalidatePath(`/menu/${parsed.data.slug}`);
  return { success: true };
}

