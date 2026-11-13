import { CustomersClient } from "@/components/customers/customers-client";
import { requireArea } from "@/lib/permissions/tenant";
import { createClient } from "@/lib/supabase/server";
import type { Customer } from "@/types/domain.types";

export default async function CustomersPage() {
  const tenant = await requireArea("customers");
  const supabase = await createClient();

  // Order history is loaded per customer, when its panel opens.
  const { data } = await supabase
    .from("customers")
    .select("*")
    .eq("store_id", tenant.store.id)
    .order("last_order_at", { ascending: false, nullsFirst: false })
    .limit(1000);

  return <CustomersClient storeId={tenant.store.id} storeName={tenant.store.name} customers={(data ?? []) as Customer[]} />;
}
