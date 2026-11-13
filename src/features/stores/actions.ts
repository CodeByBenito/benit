"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { storeBrandImageSchema, storeSettingsSchema } from "@/lib/validations";
import { ASSETS_BUCKET, assetPathFromPublicUrl, isBrandImagePath, publicAssetUrl, shareVariantPath } from "@/lib/images/brand-assets";
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


/**
 * Points the store's logo or cover at an object the browser has just uploaded
 * to `benit-assets` (or clears it with `path: null`).
 *
 * The client sends only the storage path. It must be `<storeId>/<kind>-<ts>.<ext>`,
 * so a manager can never set an image from another store or an external URL.
 * The previous file is deleted afterwards (best effort).
 */
export async function setStoreBrandImageAction(
  payload: unknown
): Promise<ActionResult<{ url: string | null }>> {
  const parsed = storeBrandImageSchema.safeParse(payload);
  if (!parsed.success) {
    return { success: false, error: "Imagem inválida." };
  }
  const { storeId, kind, path } = parsed.data;

  const guard = await requireStoreManager(storeId);
  if (!guard.ok) return { success: false, error: guard.error };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return { success: false, error: "Supabase não configurado." };
  if (path !== null && !isBrandImagePath(path, storeId, kind)) {
    return { success: false, error: "Caminho de imagem inválido para esta loja." };
  }

  const supabase = await createClient();
  const column = kind === "logo" ? "logo_url" : "banner_url";

  const { data: current, error: readError } = await supabase
    .from("stores")
    .select("slug, logo_url, banner_url")
    .eq("id", storeId)
    .single();
  if (readError || !current) {
    return { success: false, error: "Loja não encontrada." };
  }

  const url = path ? publicAssetUrl(supabaseUrl, path) : null;
  const { error } = await supabase.from("stores").update({ [column]: url }).eq("id", storeId);
  if (error) return { success: false, error: error.message };

  const previousPath = assetPathFromPublicUrl(current[column], supabaseUrl);
  if (previousPath && previousPath !== path && isBrandImagePath(previousPath, storeId, kind)) {
    const twin = shareVariantPath(previousPath);
    const { error: removeError } = await supabase.storage.from(ASSETS_BUCKET).remove(twin ? [previousPath, twin] : [previousPath]);
    if (removeError) console.error("[stores] could not delete replaced image:", removeError.message);
  }

  revalidatePath("/", "layout");
  revalidatePath(`/menu/${current.slug}`);
  return { success: true, data: { url } };
}
