"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/features/auth/actions";
import { env, integrations } from "@/lib/env";
import { buildAuthorizeUrl, createPkcePair } from "@/lib/mercadopago/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireStoreManager } from "@/features/permissions";

/** Starts Mercado Pago OAuth for the active store (OWNER/MANAGER only). */
export async function startMercadoPagoConnectAction(storeId: string): Promise<ActionResult> {
  if (!integrations.mercadoPago) {
    return { success: false, error: "Integração Mercado Pago não configurada no servidor (MP_CLIENT_ID/SECRET, TOKEN_ENC_KEY)." };
  }
  const guard = await requireStoreManager(storeId);
  if (!guard.ok) return { success: false, error: guard.error };

  const state = randomBytes(24).toString("base64url");
  const { verifier, challenge } = createPkcePair();
  const admin = createAdminClient();
  const { error } = await admin.from("oauth_states").insert({ state, store_id: storeId, user_id: guard.userId, code_verifier: verifier });
  if (error) return { success: false, error: "Não foi possível iniciar a conexão." };

  const redirectUri = `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/api/integrations/mercadopago/callback`;
  redirect(buildAuthorizeUrl({ state, redirectUri, codeChallenge: challenge }));
}

export async function disconnectMercadoPagoAction(storeId: string): Promise<ActionResult> {
  const guard = await requireStoreManager(storeId);
  if (!guard.ok) return { success: false, error: guard.error };

  const admin = createAdminClient();
  await admin.from("stores").update({ online_payment_enabled: false }).eq("id", storeId);
  const { error } = await admin
    .from("store_payment_accounts")
    .update({ status: "DISCONNECTED", access_token_enc: "revoked", refresh_token_enc: null })
    .eq("store_id", storeId);
  if (error) return { success: false, error: "Não foi possível desconectar." };

  revalidatePath("/settings");
  return { success: true };
}

export interface PaymentAccountStatus {
  connected: boolean;
  status: "ACTIVE" | "REFRESH_FAILED" | "DISCONNECTED" | null;
  liveMode: boolean | null;
  providerUserId: string | null;
  configured: boolean;
}

/** Safe summary of the store's MP connection (never returns tokens). */
export async function getPaymentAccountStatus(storeId: string): Promise<PaymentAccountStatus> {
  const supabase = await createClient();
  const { data: canSee } = await supabase.rpc("can_manage_store", { p_store_id: storeId });
  if (!canSee || !integrations.supabaseAdmin) {
    return { connected: false, status: null, liveMode: null, providerUserId: null, configured: integrations.mercadoPago };
  }
  const { data } = await createAdminClient()
    .from("store_payment_accounts")
    .select("status, live_mode, provider_user_id")
    .eq("store_id", storeId)
    .maybeSingle();
  return {
    connected: data?.status === "ACTIVE",
    status: (data?.status as PaymentAccountStatus["status"]) ?? null,
    liveMode: data?.live_mode ?? null,
    providerUserId: data?.provider_user_id ?? null,
    configured: integrations.mercadoPago,
  };
}
