import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  PublicMenuClient,
  type PublicCategory,
  type PublicProduct,
  type PublicStoreInfo,
} from "@/components/menu/public-menu-client";

export default async function PublicMenuPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  // Only select explicitly public store fields
  const { data: storeData } = await supabase
    .from("stores")
    .select(
      "id, name, slug, description, logo_url, banner_url, phone, whatsapp, address, is_open, is_published"
    )
    .eq("slug", slug.toLowerCase())
    .eq("is_published", true)
    .maybeSingle();

  if (!storeData) {
    notFound();
  }

  const [
    { data: categoriesData },
    { data: productsData },
    { data: groupsData },
    { data: optionsData },
  ] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, description, sort_order")
      .eq("store_id", storeData.id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("products")
      .select(
        "id, category_id, name, description, price_cents, image_url, is_available, track_stock, stock_quantity, sort_order"
      )
      .eq("store_id", storeData.id)
      .eq("is_archived", false)
      .order("sort_order", { ascending: true }),
    supabase
      .from("product_option_groups")
      .select("id, product_id, name, min_select, max_select, is_required, sort_order")
      .eq("store_id", storeData.id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("product_options")
      .select("id, group_id, name, price_cents, sort_order")
      .eq("store_id", storeData.id)
      .eq("is_available", true)
      .order("sort_order", { ascending: true }),
  ]);

  const publicStore: PublicStoreInfo = {
    id: storeData.id,
    name: storeData.name,
    slug: storeData.slug,
    description: storeData.description,
    logo_url: storeData.logo_url,
    banner_url: storeData.banner_url,
    phone: storeData.phone,
    whatsapp: storeData.whatsapp,
    address: storeData.address,
    is_open: storeData.is_open,
  };

  const publicCategories: PublicCategory[] = (categoriesData ?? []).map(
    (c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
    })
  );

  // Strip internal stock_quantity and only expose boolean in_stock
  const publicProducts: PublicProduct[] = (productsData ?? []).map((p) => ({
    id: p.id,
    category_id: p.category_id,
    name: p.name,
    description: p.description,
    price_cents: p.price_cents,
    image_url: p.image_url,
    is_available: p.is_available,
    in_stock: !p.track_stock || p.stock_quantity > 0,
    option_groups: (groupsData ?? [])
      .filter((g) => g.product_id === p.id)
      .map((g) => ({
        id: g.id,
        name: g.name,
        min_select: g.min_select,
        max_select: g.max_select,
        is_required: g.is_required,
        options: (optionsData ?? [])
          .filter((o) => o.group_id === g.id)
          .map((o) => ({
            id: o.id,
            name: o.name,
            price_cents: o.price_cents,
          })),
      })),
  }));

  return (
    <PublicMenuClient
      store={publicStore}
      categories={publicCategories}
      products={publicProducts}
    />
  );
}

