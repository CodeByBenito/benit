"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/features/auth/actions";
import { requireStoreManager } from "@/features/permissions";
import { cleanDbError } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import { businessHoursSchema, checkoutSettingsSchema, deliveryZoneSchema } from "@/lib/validations";

function revalidateStore() {
  revalidatePath("/settings");
  revalidatePath("/menu/[slug]", "page");
}

export async function saveCheckoutSettingsAction(payload: unknown): Promise<ActionResult> {
  const parsed = checkoutSettingsSchema.safeParse(payload);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Configuração inválida." };
  const d = parsed.data;
  const guard = await requireStoreManager(d.storeId);
  if (!guard.ok) return { success: false, error: guard.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("stores")
    .update({
      min_order_cents: d.minOrderCents,
      default_eta_minutes: d.defaultEtaMinutes,
      accepts_delivery: d.acceptsDelivery,
      accepts_pickup: d.acceptsPickup,
      accepts_dine_in: d.acceptsDineIn,
      offline_methods: d.offlineMethods,
      pix_key: d.pixKey || null,
      online_payment_enabled: d.onlinePaymentEnabled,
      payment_window_minutes: d.paymentWindowMinutes,
      notify_owner_email: d.notifyOwnerEmail,
    })
    .eq("id", d.storeId);
  if (error) return { success: false, error: cleanDbError(error.message, "Não foi possível salvar.") };
  revalidateStore();
  return { success: true };
}

/** Replaces the whole weekly schedule atomically from the client's point of view. */
export async function saveBusinessHoursAction(payload: unknown): Promise<ActionResult> {
  const parsed = businessHoursSchema.safeParse(payload);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Horários inválidos." };
  const { storeId, slots } = parsed.data;
  const guard = await requireStoreManager(storeId);
  if (!guard.ok) return { success: false, error: guard.error };

  const supabase = await createClient();
  const { error: delError } = await supabase.from("store_business_hours").delete().eq("store_id", storeId);
  if (delError) return { success: false, error: cleanDbError(delError.message, "Não foi possível salvar os horários.") };
  if (slots.length) {
    const { error } = await supabase.from("store_business_hours").insert(
      slots.map((s) => ({ store_id: storeId, weekday: s.weekday, opens_at: s.opensAt, closes_at: s.closesAt }))
    );
    if (error) {
      const msg = error.message.includes("uq_store_business_hours") ? "Há dois horários começando no mesmo minuto no mesmo dia." : error.message;
      return { success: false, error: cleanDbError(msg, "Não foi possível salvar os horários.") };
    }
  }
  revalidateStore();
  return { success: true };
}

export async function saveDeliveryZoneAction(payload: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = deliveryZoneSchema.safeParse(payload);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Zona inválida." };
  const d = parsed.data;
  const guard = await requireStoreManager(d.storeId);
  if (!guard.ok) return { success: false, error: guard.error };

  const supabase = await createClient();
  const row = {
    store_id: d.storeId,
    name: d.name,
    neighborhoods: d.neighborhoods,
    fee_cents: d.feeCents,
    min_order_cents: d.minOrderCents ?? null,
    eta_minutes: d.etaMinutes ?? null,
    is_active: d.isActive,
  };
  const query = d.id
    ? supabase.from("delivery_zones").update(row).eq("id", d.id).eq("store_id", d.storeId).select("id").single()
    : supabase.from("delivery_zones").insert(row).select("id").single();
  const { data, error } = await query;
  if (error || !data) return { success: false, error: cleanDbError(error?.message, "Não foi possível salvar a zona.") };
  revalidateStore();
  return { success: true, data: { id: data.id } };
}

export async function deleteDeliveryZoneAction(storeId: string, zoneId: string): Promise<ActionResult> {
  const guard = await requireStoreManager(storeId);
  if (!guard.ok) return { success: false, error: guard.error };
  const supabase = await createClient();
  const { error } = await supabase.from("delivery_zones").delete().eq("id", zoneId).eq("store_id", storeId);
  if (error) return { success: false, error: cleanDbError(error.message, "Não foi possível remover a zona.") };
  revalidateStore();
  return { success: true };
}
