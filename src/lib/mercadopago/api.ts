import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Thin, typed wrapper over the Mercado Pago REST API (no SDK: fewer deps,
 * and MP_API_BASE_URL can point to a local stub in tests/e2e).
 */
export class MercadoPagoError extends Error {
  constructor(message: string, readonly status: number, readonly body: unknown) {
    super(message);
  }
}

async function mpFetch<T>(path: string, init: RequestInit & { accessToken?: string; idempotencyKey?: string } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (init.accessToken) headers.set("Authorization", `Bearer ${init.accessToken}`);
  if (init.idempotencyKey) headers.set("X-Idempotency-Key", init.idempotencyKey);

  const res = await fetch(`${env.MP_API_BASE_URL}${path}`, { ...init, headers, cache: "no-store" });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = (body && (body.message || body.error)) || `Mercado Pago respondeu ${res.status}`;
    throw new MercadoPagoError(String(message), res.status, body);
  }
  return body as T;
}

// --- OAuth ------------------------------------------------------------------

export interface MpTokenResponse {
  access_token: string;
  refresh_token?: string;
  public_key?: string;
  user_id: number | string;
  expires_in: number;
  scope?: string;
  live_mode?: boolean;
}

export function createPkcePair() {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function buildAuthorizeUrl(params: { state: string; redirectUri: string; codeChallenge: string }) {
  const url = new URL(`${env.MP_AUTH_BASE_URL}/authorization`);
  url.searchParams.set("client_id", env.MP_CLIENT_ID ?? "");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("platform_id", "mp");
  url.searchParams.set("state", params.state);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export function exchangeCode(code: string, redirectUri: string, codeVerifier: string) {
  return mpFetch<MpTokenResponse>("/oauth/token", {
    method: "POST",
    body: JSON.stringify({
      client_id: env.MP_CLIENT_ID,
      client_secret: env.MP_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  });
}

export function refreshToken(refresh: string) {
  return mpFetch<MpTokenResponse>("/oauth/token", {
    method: "POST",
    body: JSON.stringify({
      client_id: env.MP_CLIENT_ID,
      client_secret: env.MP_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refresh,
    }),
  });
}

// --- Payments ---------------------------------------------------------------

export interface MpPayment {
  id: number | string;
  status: string;
  status_detail?: string;
  transaction_amount: number;
  payment_type_id?: string;
  payment_method_id?: string;
  external_reference?: string;
  date_of_expiration?: string | null;
  point_of_interaction?: {
    transaction_data?: { qr_code?: string; qr_code_base64?: string; ticket_url?: string };
  };
}

export function createPayment(accessToken: string, idempotencyKey: string, body: Record<string, unknown>) {
  return mpFetch<MpPayment>("/v1/payments", {
    method: "POST",
    accessToken,
    idempotencyKey,
    body: JSON.stringify(body),
  });
}

export function getPayment(accessToken: string, paymentId: string) {
  return mpFetch<MpPayment>(`/v1/payments/${encodeURIComponent(paymentId)}`, { method: "GET", accessToken });
}

export function refundPayment(accessToken: string, paymentId: string, idempotencyKey: string) {
  return mpFetch<{ id: number | string; status: string }>(`/v1/payments/${encodeURIComponent(paymentId)}/refunds`, {
    method: "POST",
    accessToken,
    idempotencyKey,
    body: JSON.stringify({}),
  });
}
