"use server";

import type { ActionResult } from "@/features/auth/actions";
import { createClient } from "@/lib/supabase/server";
import type { Order } from "@/types/domain.types";

/** Last orders of one customer, with items (RLS limits it to members of the store). */
export async function getCustomerOrdersAction(storeId: string, customerId: string): Promise<ActionResult<Order[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, store_id, customer_id, order_number, status, fulfillment_type, payment_status, total_cents, created_at, items:order_items(id, quantity, product_name_snapshot)"
    )
    .eq("store_id", storeId)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    return { success: false, error: "Não foi possível carregar os pedidos." };
  }
  return { success: true, data: (data ?? []) as unknown as Order[] };
}
