import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { integrations } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Per-visitor limits for the public checkout, counted in the database
 * (`consume_rate_limit`, migration 0011) so they hold across serverless
 * instances. The per-phone limit on orders is separate and lives inside the
 * order transaction itself.
 */
export const PUBLIC_LIMITS = {
  /** Totals are recalculated as the customer edits the bag, so this is generous. */
  quote: { limit: 120, windowSeconds: 600 },
  order: { limit: 12, windowSeconds: 600 },
  payment: { limit: 30, windowSeconds: 600 },
} as const;

export type PublicLimit = keyof typeof PUBLIC_LIMITS;

export const RATE_LIMIT_MESSAGE = "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo.";

/** First hop of x-forwarded-for: on Vercel this is the visitor, set by the platform. */
export function clientIpFrom(forwardedFor: string | null, realIp: string | null): string | null {
  const first = forwardedFor?.split(",")[0]?.trim();
  return first || realIp?.trim() || null;
}

/** Opaque bucket key. The IP is hashed so no address is ever stored. */
export function bucketKey(scope: PublicLimit, ip: string, target: string): string {
  return `${scope}:${createHash("sha256").update(`${ip}|${target}`).digest("hex").slice(0, 40)}`;
}

/**
 * True when the visitor may proceed. Fails open: without the service role,
 * without an identifiable address (local development) or if the counter
 * itself errors, the request goes through. A broken limiter must never take
 * the checkout down.
 */
export async function allowPublicRequest(scope: PublicLimit, target: string): Promise<boolean> {
  if (!integrations.supabaseAdmin) return true;
  try {
    const h = await headers();
    const ip = clientIpFrom(h.get("x-forwarded-for"), h.get("x-real-ip"));
    if (!ip) return true;
    const { limit, windowSeconds } = PUBLIC_LIMITS[scope];
    const { data, error } = await createAdminClient().rpc("consume_rate_limit", {
      p_key: bucketKey(scope, ip, target),
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) {
      console.error("[rate-limit] counter failed:", error.message);
      return true;
    }
    return data !== false;
  } catch {
    return true;
  }
}
