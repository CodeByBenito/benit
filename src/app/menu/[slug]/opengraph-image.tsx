import { notFound } from "next/navigation";
import { OG_SIZE } from "@/lib/brand/image";
import { renderStoreOg } from "@/lib/brand/store-og";
import { createPublicClient } from "@/lib/supabase/public";

export const runtime = "edge";

export const alt = "Cardápio digital";
export const size = OG_SIZE;
export const contentType = "image/png";
export const dynamic = "force-dynamic";

/** Per-store share image: name, description, logo and cover of a published menu. */
export default async function StoreOpengraphImage({ params }: { params: Promise<{ slug: string }> | { slug: string } }) {
  const { slug } = await params;
  const supabase = createPublicClient();
  if (!supabase) notFound();

  const { data } = await supabase.rpc("get_public_menu_by_slug", { p_slug: slug.toLowerCase() });
  const store = (data as { store?: { id?: string; name: string; description: string | null; logo_url: string | null; banner_url: string | null } } | null)?.store;
  if (!store?.id) notFound();

  return renderStoreOg({ name: store.name, description: store.description, logoUrl: store.logo_url, bannerUrl: store.banner_url });
}
