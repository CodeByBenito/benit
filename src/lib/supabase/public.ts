import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "./client";

let cached: SupabaseClient | null = null;

/**
 * Cookie-less `anon` client for public, cacheable surfaces (share images,
 * sitemap). It never carries a user session, so it can only call the public
 * RPCs. Returns null when Supabase is not configured.
 */
export function createPublicClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  cached ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return cached;
}

/**
 * True when `url` is a public object of this project's `benit-assets` bucket.
 * Server-side fetches of store images are limited to it, so a hand-typed
 * logo URL can never make the server request an arbitrary host.
 */
export function isOwnStorageUrl(url: string | null | undefined): url is string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !base) return false;
  try {
    const target = new URL(url);
    const origin = new URL(base);
    return target.protocol === "https:" && target.host === origin.host && target.pathname.startsWith("/storage/v1/object/public/benit-assets/");
  } catch {
    return false;
  }
}
