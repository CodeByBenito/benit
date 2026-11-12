import "server-only";
import { open, seal } from "@/lib/crypto/secretbox";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshToken, type MpTokenResponse } from "./api";

const REFRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function key(): string {
  if (!env.TOKEN_ENC_KEY) throw new Error("TOKEN_ENC_KEY não configurada.");
  return env.TOKEN_ENC_KEY;
}

export async function saveStoreAccount(storeId: string, token: MpTokenResponse, connectedBy: string) {
  const admin = createAdminClient();
  const { error } = await admin.from("store_payment_accounts").upsert({
    store_id: storeId,
    provider: "MERCADO_PAGO",
    provider_user_id: String(token.user_id),
    public_key: token.public_key ?? null,
    access_token_enc: seal(token.access_token, key()),
    refresh_token_enc: token.refresh_token ? seal(token.refresh_token, key()) : null,
    expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(),
    scope: token.scope ?? null,
    live_mode: token.live_mode ?? true,
    status: "ACTIVE",
    connected_by: connectedBy,
  });
  if (error) throw new Error(error.message);
}

/** The store has no usable Mercado Pago account (never connected, or disconnected). */
export class PaymentAccountMissingError extends Error {
  constructor() {
    super("Loja sem conta Mercado Pago conectada.");
    this.name = "PaymentAccountMissingError";
  }
}

interface AccountRow {
  store_id: string;
  provider_user_id: string;
  access_token_enc: string;
  refresh_token_enc: string | null;
  expires_at: string | null;
  status: string;
}

async function markRefreshFailed(storeId: string) {
  const admin = createAdminClient();
  await admin.from("store_payment_accounts").update({ status: "REFRESH_FAILED" }).eq("store_id", storeId);
  // Service role bypasses the guard trigger: turn online payments off so customers never hit a dead checkout.
  await admin.from("stores").update({ online_payment_enabled: false }).eq("id", storeId);
}

async function refreshRow(row: AccountRow): Promise<string> {
  if (!row.refresh_token_enc) {
    await markRefreshFailed(row.store_id);
    throw new Error("Conta Mercado Pago sem refresh token. Reconecte em Configurações.");
  }
  try {
    const next = await refreshToken(open(row.refresh_token_enc, key()));
    const admin = createAdminClient();
    await admin
      .from("store_payment_accounts")
      .update({
        access_token_enc: seal(next.access_token, key()),
        refresh_token_enc: next.refresh_token ? seal(next.refresh_token, key()) : row.refresh_token_enc,
        expires_at: new Date(Date.now() + next.expires_in * 1000).toISOString(),
        public_key: next.public_key ?? undefined,
        status: "ACTIVE",
      })
      .eq("store_id", row.store_id);
    return next.access_token;
  } catch (error) {
    await markRefreshFailed(row.store_id);
    throw error;
  }
}

/** Decrypted access token for a store, refreshing it when close to expiry. */
export async function getStoreAccessToken(storeId: string): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("store_payment_accounts")
    .select("store_id, provider_user_id, access_token_enc, refresh_token_enc, expires_at, status")
    .eq("store_id", storeId)
    .maybeSingle<AccountRow>();
  if (error) throw new Error(error.message);
  if (!data || data.status === "DISCONNECTED") throw new PaymentAccountMissingError();

  const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : 0;
  if (expiresAt - Date.now() < REFRESH_WINDOW_MS) {
    return refreshRow(data);
  }
  return open(data.access_token_enc, key());
}

/** Cron: refresh every token that expires within the window. */
export async function refreshExpiringAccounts(): Promise<{ refreshed: number; failed: number }> {
  const admin = createAdminClient();
  const threshold = new Date(Date.now() + REFRESH_WINDOW_MS).toISOString();
  const { data } = await admin
    .from("store_payment_accounts")
    .select("store_id, provider_user_id, access_token_enc, refresh_token_enc, expires_at, status")
    .eq("status", "ACTIVE")
    .lt("expires_at", threshold)
    .returns<AccountRow[]>();
  let refreshed = 0;
  let failed = 0;
  for (const row of data ?? []) {
    try {
      await refreshRow(row);
      refreshed++;
    } catch {
      failed++;
    }
  }
  return { refreshed, failed };
}
