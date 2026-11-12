import { OverviewView } from "@/components/dashboard/overview-view";
import { getPaymentAccountStatus } from "@/features/payments/actions";
import { buildOverview, type OverviewOrder, type OverviewProduct } from "@/lib/dashboard/overview";
import { requireArea } from "@/lib/permissions/tenant";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const tenant = await requireArea("overview");
  const supabase = await createClient();
  const store = tenant.store;
  const tz = store.timezone || "America/Sao_Paulo";
  const since = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: ordersData }, { data: productsData }, { count: zonesCount }, { count: hoursCount }, account] = await Promise.all([
    supabase
      .from("orders")
      .select("id, order_number, status, total_cents, created_at, customer_name_snapshot, fulfillment_type, payment_status")
      .eq("store_id", store.id)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(2000),
    supabase.from("products").select("id, name, track_stock, stock_quantity, low_stock_threshold, is_available").eq("store_id", store.id).eq("is_archived", false),
    supabase.from("delivery_zones").select("id", { count: "exact", head: true }).eq("store_id", store.id),
    supabase.from("store_business_hours").select("id", { count: "exact", head: true }).eq("store_id", store.id),
    getPaymentAccountStatus(store.id),
  ]);

  const overview = buildOverview({
    orders: (ordersData ?? []) as OverviewOrder[],
    products: (productsData ?? []) as OverviewProduct[],
    timezone: tz,
    store,
    zonesCount: zonesCount ?? 0,
    hoursCount: hoursCount ?? 0,
    paymentConnected: account.connected,
  });

  return (
    <OverviewView
      overview={overview}
      dateLabel={new Intl.DateTimeFormat("pt-BR", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(new Date())}
      firstName={tenant.user.full_name.split(" ")[0]}
      storeName={store.name}
      storeSlug={store.slug}
      paymentIssue={account.status === "REFRESH_FAILED"}
    />
  );
}
