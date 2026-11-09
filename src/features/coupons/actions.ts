"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/features/auth/actions";
import { requireStoreManager } from "@/features/permissions";
import { cleanDbError } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import { couponSchema } from "@/lib/validations";

export async function saveCouponAction(payload: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = couponSchema.safeParse(payload);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Cupom inválido." };
  const d = parsed.data;
  const guard = await requireStoreManager(d.storeId);
  if (!guard.ok) return { success: false, error: guard.error };

  const supabase = await createClient();
  const row = {
    store_id: d.storeId,
    code: d.code,
    description: d.description || null,
    kind: d.kind,
    value: d.value,
    max_discount_cents: d.kind === "PERCENT" ? d.maxDiscountCents ?? null : null,
    min_order_cents: d.minOrderCents,
    starts_at: d.startsAt || null,
    ends_at: d.endsAt || null,
    usage_limit: d.usageLimit ?? null,
    per_customer_limit: d.perCustomerLimit ?? null,
    is_active: d.isActive,
  };
  const query = d.id
    ? supabase.from("coupons").update(row).eq("id", d.id).eq("store_id", d.storeId).select("id").single()
    : supabase.from("coupons").insert(row).select("id").single();
  const { data, error } = await query;
  if (error || !data) {
    if (error?.message.includes("uq_coupons_store_code")) return { success: false, error: "Já existe um cupom com esse código." };
    return { success: false, error: cleanDbError(error?.message, "Não foi possível salvar o cupom.") };
  }
  revalidatePath("/settings");
  return { success: true, data: { id: data.id } };
}

export async function toggleCouponAction(storeId: string, couponId: string, isActive: boolean): Promise<ActionResult> {
  const guard = await requireStoreManager(storeId);
  if (!guard.ok) return { success: false, error: guard.error };
  const supabase = await createClient();
  const { error } = await supabase.from("coupons").update({ is_active: isActive }).eq("id", couponId).eq("store_id", storeId);
  if (error) return { success: false, error: cleanDbError(error.message, "Não foi possível atualizar o cupom.") };
  revalidatePath("/settings");
  return { success: true };
}

export async function deleteCouponAction(storeId: string, couponId: string): Promise<ActionResult> {
  const guard = await requireStoreManager(storeId);
  if (!guard.ok) return { success: false, error: guard.error };
  const supabase = await createClient();
  // Coupons with redemptions are deactivated instead of deleted, to keep order history intact.
  const { count } = await supabase.from("coupon_redemptions").select("id", { count: "exact", head: true }).eq("coupon_id", couponId);
  const { error } = count
    ? await supabase.from("coupons").update({ is_active: false }).eq("id", couponId).eq("store_id", storeId)
    : await supabase.from("coupons").delete().eq("id", couponId).eq("store_id", storeId);
  if (error) return { success: false, error: cleanDbError(error.message, "Não foi possível remover o cupom.") };
  revalidatePath("/settings");
  return { success: true };
}
