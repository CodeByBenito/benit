import { requireTenantContext } from "@/lib/permissions/tenant";
import { createClient } from "@/lib/supabase/server";
import { OrdersBoardClient } from "@/components/orders/orders-board-client";
import type {
  Order,
  OrderItem,
  OrderItemOption,
  OrderStatusHistory,
  Product,
} from "@/types/domain.types";

export default async function OrdersPage() {
  const tenant = await requireTenantContext();
  const supabase = await createClient();

  const [
    { data: ordersData },
    { data: itemsData },
    { data: itemOptionsData },
    { data: historyData },
    { data: productsData },
  ] = await Promise.all([
    supabase
      .from("orders")
      .select("*")
      .eq("store_id", tenant.store.id)
      .order("created_at", { ascending: false })
      .limit(150),
    supabase
      .from("order_items")
      .select("*")
      .eq("store_id", tenant.store.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("order_item_options")
      .select("*")
      .eq("store_id", tenant.store.id),
    supabase
      .from("order_status_history")
      .select("*")
      .eq("store_id", tenant.store.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("products")
      .select("*")
      .eq("store_id", tenant.store.id)
      .eq("is_archived", false)
      .order("name", { ascending: true }),
  ]);

  const items = (itemsData ?? []) as OrderItem[];
  const itemOptions = (itemOptionsData ?? []) as OrderItemOption[];
  const history = (historyData ?? []) as OrderStatusHistory[];

  const enrichedOrders: Order[] = ((ordersData ?? []) as Order[]).map((o) => ({
    ...o,
    items: items
      .filter((i) => i.order_id === o.id)
      .map((i) => ({
        ...i,
        options: itemOptions.filter((opt) => opt.order_item_id === i.id),
      })),
    status_history: history.filter((h) => h.order_id === o.id),
  }));

  return (
    <OrdersBoardClient
      storeId={tenant.store.id}
      storeName={tenant.store.name}
      initialOrders={enrichedOrders}
      products={(productsData ?? []) as Product[]}
    />
  );
}

