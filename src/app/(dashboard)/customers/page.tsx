import { requireTenantContext } from "@/lib/permissions/tenant";
import { createClient } from "@/lib/supabase/server";
import { CustomersClient } from "@/components/customers/customers-client";
import type { Customer, Order } from "@/types/domain.types";

export default async function CustomersPage() {
  const tenant = await requireTenantContext();
  const supabase = await createClient();

  const [{ data: customersData }, { data: ordersData }] = await Promise.all([
    supabase
      .from("customers")
      .select("*")
      .eq("store_id", tenant.store.id)
      .order("last_order_at", { ascending: false, nullsFirst: false }),
    supabase
      .from("orders")
      .select("*")
      .eq("store_id", tenant.store.id)
      .order("created_at", { ascending: false })
      .limit(250),
  ]);

  return (
    <CustomersClient
      storeName={tenant.store.name}
      customers={(customersData ?? []) as Customer[]}
      orders={(ordersData ?? []) as Order[]}
    />
  );
}

