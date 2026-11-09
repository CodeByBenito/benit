import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { saveStoreAccount } from "@/lib/mercadopago/accounts";
import { exchangeCode } from "@/lib/mercadopago/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function back(status: "connected" | "error", reason?: string) {
  const url = new URL("/settings", env.NEXT_PUBLIC_APP_URL);
  url.searchParams.set("tab", "payments");
  url.searchParams.set("mp", status);
  if (reason) url.searchParams.set("reason", reason);
  return NextResponse.redirect(url);
}

/** OAuth return from Mercado Pago. Validates state (CSRF), the logged-in user, role, then stores encrypted tokens. */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  if (!code || !state) return back("error", "missing_code");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return back("error", "not_authenticated");

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("oauth_states")
    .delete()
    .eq("state", state)
    .select("store_id, user_id, code_verifier, expires_at")
    .maybeSingle();

  if (!row || row.user_id !== user.id || new Date(row.expires_at).getTime() < Date.now()) {
    return back("error", "invalid_state");
  }

  // Re-check role with the user's own session (RLS-aware helper).
  const { data: canManage } = await supabase.rpc("can_manage_store", { p_store_id: row.store_id });
  if (!canManage) return back("error", "forbidden");

  try {
    const redirectUri = `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/api/integrations/mercadopago/callback`;
    const token = await exchangeCode(code, redirectUri, row.code_verifier);
    await saveStoreAccount(row.store_id, token, user.id);
    return back("connected");
  } catch (error) {
    console.error("[mp-oauth] exchange failed", (error as Error).message);
    return back("error", "exchange_failed");
  }
}
