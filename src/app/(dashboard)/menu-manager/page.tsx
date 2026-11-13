import { requireArea } from "@/lib/permissions/tenant";
import { createClient } from "@/lib/supabase/server";
import { MenuManagerClient } from "@/components/menu/menu-manager-client";
import type { Category, Product, ProductOption, ProductOptionGroup } from "@/types/domain.types";

export default async function MenuManagerPage() {
  const tenant = await requireArea("menu");
  const supabase = await createClient();

  const [
    { data: categoriesData },
    { data: productsData },
    { data: groupsData },
    { data: optionsData },
  ] = await Promise.all([
    supabase
      .from("categories")
      .select("*")
      .eq("store_id", tenant.store.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("products")
      .select("*")
      .eq("store_id", tenant.store.id)
      .eq("is_archived", false)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false }),
    supabase
      .from("product_option_groups")
      .select("*")
      .eq("store_id", tenant.store.id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("product_options")
      .select("*")
      .eq("store_id", tenant.store.id)
      .order("sort_order", { ascending: true }),
  ]);

  const categories = (categoriesData ?? []) as Category[];
  const groups = (groupsData ?? []) as ProductOptionGroup[];
  const options = (optionsData ?? []) as ProductOption[];

  const enrichedProducts = ((productsData ?? []) as Product[]).map((p) => ({
    ...p,
    option_groups: groups
      .filter((g) => g.product_id === p.id)
      .map((g) => ({
        ...g,
        options: options.filter((o) => o.group_id === g.id),
      })),
  }));

  return (
    <MenuManagerClient
      storeId={tenant.store.id}
      storeSlug={tenant.store.slug}
      categories={categories}
      products={enrichedProducts}
    />
  );
}

