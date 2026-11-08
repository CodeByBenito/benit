import { requireTenantContext } from "@/lib/permissions/tenant";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const tenant = await requireTenantContext();
  const supabase = await createClient();

  // Fetch live operational badge counts for sidebar
  const [{ count: newOrdersCount }, { data: stockProducts }] =
    await Promise.all([
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("store_id", tenant.store.id)
        .eq("status", "NEW"),
      supabase
        .from("products")
        .select("stock_quantity, low_stock_threshold, track_stock")
        .eq("store_id", tenant.store.id)
        .eq("is_archived", false)
        .eq("track_stock", true),
    ]);

  const lowStockCount = (stockProducts ?? []).filter(
    (p) => p.stock_quantity <= p.low_stock_threshold
  ).length;

  return (
    <DashboardShell
      tenant={tenant}
      newOrdersCount={newOrdersCount ?? 0}
      lowStockCount={lowStockCount}
    >
      {children}
    </DashboardShell>
  );
}

