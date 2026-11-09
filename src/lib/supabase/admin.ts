import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

let cached: SupabaseClient | null = null;

/**
 * Service-role client. Bypasses RLS — use ONLY in route handlers and
 * server actions for operations that anon/authenticated must never do
 * (payment tokens, webhook processing). Never import from client code.
 */
export function createAdminClient(): SupabaseClient {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase service role is not configured (SUPABASE_SERVICE_ROLE_KEY).");
  }
  if (!cached) {
    cached = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}
