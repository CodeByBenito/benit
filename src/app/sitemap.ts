import type { MetadataRoute } from "next";
import { integrations } from "@/lib/env";
import { absoluteUrl } from "@/lib/site";
import { createAdminClient } from "@/lib/supabase/admin";

// Regenerated at most once an hour; new stores show up without a deploy.
export const revalidate = 3600;

/** Public, indexable pages that are not store menus. */
export const STATIC_PUBLIC_PATHS = ["/", "/termos", "/privacidade"];

/**
 * Landing, legal pages and every published menu. The dashboard, order
 * tracking (/pedido) and the /dev previews are never listed.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = STATIC_PUBLIC_PATHS.map((path) => ({
    url: absoluteUrl(path),
    changeFrequency: path === "/" ? "weekly" : "yearly",
    priority: path === "/" ? 1 : 0.3,
  }));

  if (!integrations.supabaseAdmin) return entries;

  try {
    // `anon` cannot read `stores`; this runs on the server with the service role
    // and exposes only what the public menu already shows: slug and freshness.
    const { data, error } = await createAdminClient()
      .from("stores")
      .select("slug, updated_at")
      .eq("is_published", true)
      .order("slug")
      .limit(5000);
    if (error) throw error;
    for (const store of data ?? []) {
      entries.push({
        url: absoluteUrl(`/menu/${store.slug}`),
        lastModified: store.updated_at ? new Date(store.updated_at) : undefined,
        changeFrequency: "daily",
        priority: 0.8,
      });
    }
  } catch (err) {
    console.error("[sitemap] could not list published menus:", err instanceof Error ? err.message : err);
  }
  return entries;
}
