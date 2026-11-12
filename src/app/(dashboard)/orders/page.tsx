import { OrdersBoardClient } from "@/components/orders/orders-board-client";
import { requireArea } from "@/lib/permissions/tenant";
import { createClient } from "@/lib/supabase/server";
import type { Order, OrderItem, OrderItemOption, OrderStatusHistory, Product } from "@/types/domain.types";

export default async function OrdersPage() {
  const tenant = await requireArea("orders");
  const supabase = await createClient();
  const storeId = tenant.store.id;

  const [{ data: ordersData }, { data: productsData }] = await Promise.all([
    supabase.from("orders").select("*").eq("store_id", storeId).order("created_at", { ascending: false }).limit(150),
    supabase.from("products").select("*").eq("store_id", storeId).eq("is_archived", false).order("name", { ascending: true }),
  ]);

  const orders = (ordersData ?? []) as Order[];
  const ids = orders.map((o) => o.id);

  // Only the children of the loaded orders (not the store's whole history).
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
