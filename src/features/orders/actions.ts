"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  createOrderSchema,
  transitionOrderStatusSchema,
} from "@/lib/validations";
import type { ActionResult } from "@/features/auth/actions";

export interface CreatedOrderReceipt {
  order_id: string;
  order_number: number;
  status: string;
  subtotal_cents: number;
  total_cents: number;
  stock_deducted: boolean;
}

export async function createOrderAction(
  payload: unknown
): Promise<ActionResult<CreatedOrderReceipt>> {
  const parsed = createOrderSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      success: false,
      error:
        parsed.error.issues[0]?.message ?? "Verifique os itens do pedido.",
    };
  }

  const supabase = await createClient();
  const d = parsed.data;

  const { data, error } = await supabase.rpc("create_order_atomic", {
    p_store_id: d.storeId,
    p_source: d.source,
    p_fulfillment_type: d.fulfillmentType,
    p_customer_name: d.customerName,
    p_customer_phone: d.customerPhone,
    p_items: d.items,
    p_table_or_reference: d.tableOrReference || null,
    p_notes: d.notes || null,
    p_discount_cents: d.source === "MANUAL" ? d.discountCents : 0,
    p_fee_cents: d.source === "MANUAL" ? d.feeCents : 0,
    p_initial_status: d.source === "MANUAL" ? d.initialStatus : "NEW",
    p_idempotency_key: d.idempotencyKey || null,
  });

  if (error) {
    const cleanMsg = error.message.replace(/^[A-Z_]+:\s*/, "");
    return {
      success: false,
      error: cleanMsg || "Não foi possível registrar o pedido.",
    };
  }

  revalidatePath("/orders");
  revalidatePath("/dashboard");
  revalidatePath("/inventory");
  revalidatePath("/customers");

  return {
    success: true,
    data: data as CreatedOrderReceipt,
  };
}

export async function transitionOrderStatusAction(
  payload: unknown
): Promise<ActionResult> {
  const parsed = transitionOrderStatusSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Status inválido.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("transition_order_status_atomic", {
    p_store_id: parsed.data.storeId,
    p_order_id: parsed.data.orderId,
    p_new_status: parsed.data.newStatus,
    p_reason: parsed.data.reason || null,
  });

  if (error) {
    const cleanMsg = error.message.replace(/^[A-Z_]+:\s*/, "");
    return {
      success: false,
      error: cleanMsg || "Erro ao atualizar status do pedido.",
    };
  }

  revalidatePath("/orders");
  revalidatePath("/dashboard");
  revalidatePath("/inventory");
  revalidatePath("/customers");

  return { success: true };
}

