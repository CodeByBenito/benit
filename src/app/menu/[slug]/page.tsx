import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  PublicMenuClient,
  type PublicCategory,
  type PublicProduct,
  type PublicStoreInfo,
} from "@/components/menu/public-menu-client";

interface PublicMenuRpcResponse {
  store: PublicStoreInfo;
  categories: PublicCategory[];
  products: PublicProduct[];
}

export default async function PublicMenuPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  // Fetch public menu exclusively via the controlled database projection RPC.
  // Base tables (`stores`, `products`, `categories`) are never readable directly by `anon`,
  // guaranteeing zero leakage of internal stock counts, SKUs, or order counters.
  const { data, error } = await supabase.rpc("get_public_menu_by_slug", {
    p_slug: slug.toLowerCase(),
  });

  if (error || !data) {
    notFound();
  }

  const payload = data as unknown as PublicMenuRpcResponse;
  if (!payload.store?.id) {
    notFound();
  }

  return (
    <PublicMenuClient
      store={payload.store}
      categories={payload.categories ?? []}
      products={payload.products ?? []}
    />
  );
}
