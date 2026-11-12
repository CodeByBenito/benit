import { DashboardShell } from "@/components/layout/dashboard-shell";
import { getPaymentAccountStatus } from "@/features/payments/actions";
import { canManageStore } from "@/lib/permissions/roles";
import { requireTenantContext } from "@/lib/permissions/tenant";
import { createClient } from "@/lib/supabase/server";

// Per-user, per-tenant data: never prerender.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const tenant = await requireTenantContext();
  const supabase = await createClient();

  // Live badge counts for the sidebar, plus the payment health for whoever can fix it.
  const [{ count: newOrdersCount }, { data: stockProducts }, account] =
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
      canManageStore(tenant.role) ? getPaymentAccountStatus(tenant.store.id) : null,
    ]);

  const lowStockCount = (stockProducts ?? []).filter(
    (p) => p.stock_quantity <= p.low_stock_threshold
  ).length;

  return (
    <DashboardShell
      tenant={tenant}
      newOrdersCount={newOrdersCount ?? 0}
      lowStockCount={lowStockCount}
      paymentIssue={account?.status === "REFRESH_FAILED"}
    >
      {children}
    </DashboardShell>
  );
}
