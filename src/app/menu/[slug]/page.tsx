import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import {
  PublicMenuClient,
  type PublicCategory,
  type PublicDeliveryZone,
  type PublicProduct,
  type PublicStoreInfo,
} from "@/components/menu/public-menu-client";
import { createClient } from "@/lib/supabase/server";

interface PublicMenuRpcResponse {
  store: PublicStoreInfo;
  categories: PublicCategory[];
  products: PublicProduct[];
  delivery_zones: PublicDeliveryZone[];
}

// Always fresh: open/closed status and stock change minute to minute.
export const dynamic = "force-dynamic";

/**
 * The public menu is read exclusively through the controlled projection RPC.
 * Base tables are never readable by `anon` — no stock counts, SKUs or secrets leak.
 */
const loadMenu = cache(async (slug: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_menu_by_slug", { p_slug: slug.toLowerCase() });
  if (error || !data) return null;
  const payload = data as unknown as PublicMenuRpcResponse;
  return payload.store?.id ? payload : null;
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const menu = await loadMenu(slug);
  if (!menu) return { title: "Cardápio não encontrado" };
  return {
    title: { absolute: `${menu.store.name} · Cardápio` },
    description: menu.store.description ?? `Peça online em ${menu.store.name}.`,
    openGraph: { title: menu.store.name, images: menu.store.banner_url ? [menu.store.banner_url] : undefined },
  };
}

export default async function PublicMenuPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const menu = await loadMenu(slug);
  if (!menu) notFound();

  return (
    <PublicMenuClient
      store={menu.store}
      categories={menu.categories ?? []}
      products={menu.products ?? []}
      zones={menu.delivery_zones ?? []}
    />
  );
}
