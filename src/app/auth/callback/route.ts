import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { safeNextPath } from "@/lib/utils";

export const dynamic = "force-dynamic";

const OTP_TYPES: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

/**
 * Lands every e-mail link (confirm sign-up, password recovery, team invite).
 *
 * Two link shapes are accepted:
 *  - `?code=...`            PKCE: exchanged for a session. Needs the verifier
 *                           cookie, so it only works in the browser that
 *                           started the flow.
 *  - `?token_hash=&type=`   OTP hash from the e-mail template. Works on any
 *                           device (see docs/DEPLOY_VERCEL.md).
 *
 * `next` is restricted to same-origin paths.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = safeNextPath(url.searchParams.get("next"));
  const fail = (reason: string) => {
    const target = new URL("/login", url.origin);
    target.searchParams.set("error", reason);
    return NextResponse.redirect(target);
  };

  if (!isSupabaseConfigured()) return fail("config");

  // Supabase reports an expired/used link in the query string.
  if (url.searchParams.get("error") || url.searchParams.get("error_code")) return fail("link");

  const supabase = await createClient();
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return fail("link");
  } else if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) return fail("link");
  } else {
    return fail("link");
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
