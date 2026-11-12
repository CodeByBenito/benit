import type { FulfillmentType, Order } from "@/types/domain.types";

/**
 * What the kitchen needs to cook an order, and nothing else: no phone, no
 * address, no prices, no payment. The orders page builds this on the server,
 * so the rest never reaches a kitchen screen.
 */
export interface KitchenOrder {
  id: string;
  order_number: number;
  status: "CONFIRMED" | "PREPARING" | "READY";
  fulfillment_type: FulfillmentType;
  table_or_reference: string | null;
  /** First name only, to call at the counter. */
  customer_first_name: string;
  notes: string | null;
  created_at: string;
  items: { id: string; quantity: number; name: string; notes: string | null; options: string[] }[];
}

const KITCHEN_STATUSES = ["CONFIRMED", "PREPARING", "READY"] as const;

export function toKitchenOrders(orders: Order[]): KitchenOrder[] {
  return orders
    .filter((o): o is Order & { status: KitchenOrder["status"] } => (KITCHEN_STATUSES as readonly string[]).includes(o.status))
    .map((o) => ({
      id: o.id,
      order_number: o.order_number,
      status: o.status,
      fulfillment_type: o.fulfillment_type,
      table_or_reference: o.table_or_reference,
      customer_first_name: o.customer_name_snapshot.trim().split(/\s+/)[0] ?? "",
      notes: o.notes,
      created_at: o.created_at,
      items: (o.items ?? []).map((i) => ({
        id: i.id,
        quantity: i.quantity,
        name: i.product_name_snapshot,
        notes: i.notes,
        options: (i.options ?? []).map((x) => x.option_name_snapshot),
      })),
    }));
}
