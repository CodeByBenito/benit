import { requireTenantContext } from "@/lib/permissions/tenant";
import { createClient } from "@/lib/supabase/server";
import { InventoryControlClient } from "@/components/inventory/inventory-control-client";
import type { Category, Product, StockMovement } from "@/types/domain.types";

export default async function InventoryPage() {
  const tenant = await requireTenantContext();
  const supabase = await createClient();

  const [
    { data: categoriesData },
    { data: productsData },
    { data: movementsData },
  ] = await Promise.all([
    supabase
      .from("categories")
      .select("*")
      .eq("store_id", tenant.store.id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("products")
      .select("*")
      .eq("store_id", tenant.store.id)
      .eq("is_archived", false)
      .order("stock_quantity", { ascending: true }),
    supabase
      .from("stock_movements")
      .select("*")
      .eq("store_id", tenant.store.id)
      .order("created_at", { ascending: false })
      .limit(60),
  ]);

  return (
    <InventoryControlClient
      storeId={tenant.store.id}
      categories={(categoriesData ?? []) as Category[]}
      products={(productsData ?? []) as Product[]}
      movements={(movementsData ?? []) as StockMovement[]}
    />
  );
}

