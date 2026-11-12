import { KitchenBoard } from "@/components/orders/kitchen-board";
import { OrdersBoardClient } from "@/components/orders/orders-board-client";
import { toKitchenOrders } from "@/lib/orders/kitchen";
import { ordersBoardMode } from "@/lib/permissions/roles";
import { requireArea } from "@/lib/permissions/tenant";
import { createClient } from "@/lib/supabase/server";
import type { Order, OrderItem, OrderItemOption, OrderStatusHistory, Product } from "@/types/domain.types";

export default async function OrdersPage() {
  const tenant = await requireArea("orders");
  const supabase = await createClient();
  const storeId = tenant.store.id;
  const kitchen = ordersBoardMode(tenant.role) === "kitchen";

  if (kitchen) {
    // Kitchen staff get the tickets to cook and nothing else: no prices,
    // phones, addresses or payment data leave the server.
    const [{ data: ordersData }, { count: waiting }] = await Promise.all([
      supabase
        .from("orders")
        .select("id, order_number, status, fulfillment_type, table_or_reference, customer_name_snapshot, notes, created_at")
        .eq("store_id", storeId)
        .in("status", ["CONFIRMED", "PREPARING", "READY"])
        .order("created_at", { ascending: true })
        .limit(150),
      supabase.from("orders").select("id", { count: "exact", head: true }).eq("store_id", storeId).eq("status", "NEW"),
    ]);
    const orders = (ordersData ?? []) as Order[];
    const ids = orders.map((o) => o.id);
    const { data: itemsData } = ids.length
      ? await supabase
          .from("order_items")
          .select("id, order_id, quantity, product_name_snapshot, notes, created_at, options:order_item_options(option_name_snapshot)")
          .in("order_id", ids)
          .order("created_at", { ascending: true })
      : { data: [] };
    const items = (itemsData ?? []) as unknown as (OrderItem & { options: OrderItemOption[] })[];
    const tickets = toKitchenOrders(orders.map((o) => ({ ...o, items: items.filter((i) => i.order_id === o.id) })));

    return <KitchenBoard storeId={storeId} storeName={tenant.store.name} orders={tickets} waitingConfirmation={waiting ?? 0} />;
  }

  const [{ data: ordersData }, { data: productsData }] = await Promise.all([
    supabase.from("orders").select("*").eq("store_id", storeId).order("created_at", { ascending: false }).limit(150),
    supabase.from("products").select("*").eq("store_id", storeId).eq("is_archived", false).order("name", { ascending: true }),
  ]);

  const orders = (ordersData ?? []) as Order[];
  const ids = orders.map((o) => o.id);

  // Only the children of the loaded orders (not the whole history of the store).
  const [{ data: itemsData }, { data: historyData }] = ids.length
    ? await Promise.all([
        supabase.from("order_items").select("*, options:order_item_options(*)").in("order_id", ids).order("created_at", { ascending: true }),
        supabase.from("order_status_history").select("*").in("order_id", ids).order("created_at", { ascending: false }),
      ])
    : [{ data: [] }, { data: [] }];

  const items = (itemsData ?? []) as (OrderItem & { options: OrderItemOption[] })[];
  const history = (historyData ?? []) as OrderStatusHistory[];
  const enriched: Order[] = orders.map((o) => ({
    ...o,
    items: items.filter((i) => i.order_id === o.id),
    status_history: history.filter((h) => h.order_id === o.id),
  }));

  return (
    <OrdersBoardClient storeId={storeId} storeName={tenant.store.name} initialOrders={enriched} products={(productsData ?? []) as Product[]} />
  );
}
