"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { stockAdjustmentSchema } from "@/lib/validations";
import type { ActionResult } from "@/features/auth/actions";

export async function adjustProductStockAction(
  payload: unknown
): Promise<ActionResult> {
  const parsed = stockAdjustmentSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      success: false,
      error:
        parsed.error.issues[0]?.message ??
        "Dados de movimentação de estoque inválidos.",
    };
  }

  const supabase = await createClient();
  const { storeId, productId, movementType, quantity, reason } = parsed.data;

  const { error } = await supabase.rpc("adjust_product_stock_atomic", {
    p_store_id: storeId,
    p_product_id: productId,
    p_movement_type: movementType,
    p_quantity: quantity,
    p_reason: reason || null,
    p_reference_key: `manual:${storeId}:${productId}:${Date.now()}`,
  });

  if (error) {
    const cleanMsg = error.message.replace(/^[A-Z_]+:\s*/, "");
    return {
      success: false,
      error: cleanMsg || "Erro ao registrar movimentação de estoque.",
    };
  }

  revalidatePath("/inventory");
  revalidatePath("/menu-manager");
  revalidatePath("/dashboard");
  revalidatePath("/menu", "layout");

  return { success: true };
}

