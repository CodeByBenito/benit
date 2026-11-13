"use server";

import { after } from "next/server";
import type { ActionResult } from "@/features/auth/actions";
import { env, integrations } from "@/lib/env";
import { notifyOwnerOfNewOrder } from "@/lib/notifications/owner-email";
import { cleanDbError } from "@/lib/labels";
import { getStoreAccessToken } from "@/lib/mercadopago/accounts";
import { createPayment, MercadoPagoError } from "@/lib/mercadopago/api";
import { syncPaymentFromProvider } from "@/lib/mercadopago/process";
import { centsToReais, mapMercadoPagoStatus } from "@/lib/mercadopago/status-map";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { allowPublicRequest, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";
import { cardPaymentSchema, checkoutSchema, quoteSchema } from "@/lib/validations";
import type { PaymentStatus } from "@/types/domain.types";

export interface CheckoutQuote {
  subtotal_cents: number;
  discount_cents: number;
  fee_cents: number;
  total_cents: number;
  min_order_cents: number;
  meets_minimum: boolean;
  accepting_now: boolean;
  zone: { id: string; name: string; eta_minutes: number } | null;
  zone_error: string | null;
  coupon: { code: string; discount_cents: number } | null;
  coupon_error: string | null;
}

export interface PixCharge {
  qrCode: string;
  qrCodeBase64: string | null;
  expiresAt: string | null;
}

export interface PlacedOrder {
  publicToken: string;
  orderNumber: number;
  status: string;
  paymentStatus: PaymentStatus;
  totalCents: number;
  pix?: PixCharge | null;
  pixError?: string;
}

export async function quoteCheckoutAction(payload: unknown): Promise<ActionResult<CheckoutQuote>> {
  const parsed = quoteSchema.safeParse(payload);
  if (!parsed.success) return { success: false, error: "Sacola inválida." };
  const d = parsed.data;
  if (!(await allowPublicRequest("quote", d.slug))) return { success: false, error: RATE_LIMIT_MESSAGE };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("quote_checkout", {
    p_slug: d.slug,
    p_items: d.items,
    p_fulfillment_type: d.fulfillmentType,
    p_neighborhood: d.neighborhood || null,
    p_coupon_code: d.couponCode || null,
    p_customer_phone: d.customerPhone || null,
  });
  if (error) return { success: false, error: cleanDbError(error.message, "Não foi possível calcular o total.") };
  return { success: true, data: data as CheckoutQuote };
}

export async function placeOrderAction(payload: unknown): Promise<ActionResult<PlacedOrder>> {
  const parsed = checkoutSchema.safeParse(payload);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Confira os dados do pedido." };
  }
  const d = parsed.data;
  // Per visitor here; per phone inside the order transaction (migration 0011).
  if (!(await allowPublicRequest("order", d.storeId))) return { success: false, error: RATE_LIMIT_MESSAGE };
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("create_order_atomic", {
    p_store_id: d.storeId,
    p_source: "DIGITAL_MENU",
    p_fulfillment_type: d.fulfillmentType,
    p_customer_name: d.customerName,
    p_customer_phone: d.customerPhone,
    p_items: d.items,
    p_table_or_reference: d.tableOrReference || null,
    p_notes: d.notes || null,
    p_idempotency_key: d.idempotencyKey,
    p_payment_method: d.paymentMethod,
    p_delivery: d.fulfillmentType === "DELIVERY" ? d.delivery : null,
    p_coupon_code: d.couponCode ?? null,
    p_change_for_cents: d.paymentMethod === "CASH" ? d.changeForCents ?? null : null,
  });

  if (error) return { success: false, error: cleanDbError(error.message, "Não foi possível enviar o pedido.") };

  const order = data as {
    order_id: string;
    order_number: number;
    status: string;
    payment_status: PaymentStatus;
    total_cents: number;
    public_token: string;
    idempotent_replay?: boolean;
  };

  const result: PlacedOrder = {
    publicToken: order.public_token,
    orderNumber: order.order_number,
    status: order.status,
    paymentStatus: order.payment_status,
    totalCents: order.total_cents,
  };

  if (d.paymentMethod === "ONLINE_PIX" && order.status === "AWAITING_PAYMENT") {
    const pix = await createPixCharge(order.public_token);
    if (pix.success) result.pix = pix.data;
    else result.pixError = pix.error;
  }

  if (!order.idempotent_replay && order.status === "NEW") {
    after(() => notifyOwnerOfNewOrder(order.order_id));
  }

  return { success: true, data: result };
}

interface OrderForPayment {
  id: string;
  store_id: string;
  order_number: number;
  status: string;
  total_cents: number;
  payment_expires_at: string | null;
  customer_name_snapshot: string;
}

async function loadAwaitingOrder(publicToken: string): Promise<OrderForPayment | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("orders")
    .select("id, store_id, order_number, status, total_cents, payment_expires_at, customer_name_snapshot")
    .eq("public_token", publicToken)
    .maybeSingle<OrderForPayment>();
  if (!data || data.status !== "AWAITING_PAYMENT") return null;
  if (data.payment_expires_at && new Date(data.payment_expires_at).getTime() < Date.now()) return null;
  return data;
}

function notificationUrl(storeId: string) {
  return `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/api/webhooks/mercadopago?store=${storeId}`;
}

/** Creates (or reuses) the Pix QR for an order awaiting payment. */
export async function createPixCharge(publicToken: string, payerEmail?: string): Promise<ActionResult<PixCharge>> {
  if (!/^[0-9a-f]{64}$/.test(publicToken)) return { success: false, error: "Pedido inválido." };
  if (!integrations.mercadoPago) return { success: false, error: "Pagamento online não configurado." };

  const order = await loadAwaitingOrder(publicToken);
  if (!order) return { success: false, error: "Este pedido não está mais aguardando pagamento." };

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("payments")
    .select("qr_code, qr_code_base64, expires_at")
    .eq("order_id", order.id)
    .eq("method", "ONLINE_PIX")
    .eq("status", "PENDING")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing?.qr_code) {
    return { success: true, data: { qrCode: existing.qr_code, qrCodeBase64: existing.qr_code_base64, expiresAt: existing.expires_at } };
  }

  try {
    const token = await getStoreAccessToken(order.store_id);
    const payment = await createPayment(token, `pix:${order.id}`, {
      transaction_amount: centsToReais(order.total_cents),
      description: `Pedido #${order.order_number}`,
      payment_method_id: "pix",
      external_reference: order.id,
      notification_url: notificationUrl(order.store_id),
      date_of_expiration: order.payment_expires_at,
      payer: { email: payerEmail || `pedido-${order.id.slice(0, 8)}@clientes.benit.app`, first_name: order.customer_name_snapshot.split(" ")[0] },
    });
    const tx = payment.point_of_interaction?.transaction_data;
    if (!tx?.qr_code) return { success: false, error: "O Mercado Pago não gerou o QR Code. Tente novamente." };

    await admin.rpc("record_payment_attempt", {
      p_order_id: order.id,
      p_provider_payment_id: String(payment.id),
      p_method: "ONLINE_PIX",
      p_status: mapMercadoPagoStatus(payment.status),
      p_amount_cents: order.total_cents,
      p_qr_code: tx.qr_code,
      p_qr_code_base64: tx.qr_code_base64 ?? null,
      p_ticket_url: tx.ticket_url ?? null,
      p_expires_at: payment.date_of_expiration ?? order.payment_expires_at,
      p_raw: { id: payment.id, status: payment.status },
    });

    return { success: true, data: { qrCode: tx.qr_code, qrCodeBase64: tx.qr_code_base64 ?? null, expiresAt: payment.date_of_expiration ?? order.payment_expires_at } };
  } catch (error) {
    const message = error instanceof MercadoPagoError ? error.message : "Falha ao gerar o Pix.";
    return { success: false, error: message };
  }
}

/** Card payment with a token produced by the Mercado Pago Card Payment Brick (card data never touches our server). */
export async function payWithCardAction(payload: unknown): Promise<ActionResult<{ status: PaymentStatus; detail?: string }>> {
  const parsed = cardPaymentSchema.safeParse(payload);
  if (!parsed.success) return { success: false, error: "Dados do cartão inválidos." };
  if (!integrations.mercadoPago) return { success: false, error: "Pagamento online não configurado." };
  const d = parsed.data;
  if (!(await allowPublicRequest("payment", d.publicToken))) return { success: false, error: RATE_LIMIT_MESSAGE };

  const order = await loadAwaitingOrder(d.publicToken);
  if (!order) return { success: false, error: "Este pedido não está mais aguardando pagamento." };

  try {
    const token = await getStoreAccessToken(order.store_id);
    const payment = await createPayment(token, `card:${order.id}:${d.token.slice(-16)}`, {
      transaction_amount: centsToReais(order.total_cents),
      token: d.token,
      description: `Pedido #${order.order_number}`,
      installments: d.installments,
      payment_method_id: d.paymentMethodId,
      issuer_id: d.issuerId ?? undefined,
      external_reference: order.id,
      notification_url: notificationUrl(order.store_id),
      payer: {
        email: d.payerEmail,
        identification: d.identificationType && d.identificationNumber ? { type: d.identificationType, number: d.identificationNumber } : undefined,
      },
    });

    const admin = createAdminClient();
    await admin.rpc("record_payment_attempt", {
      p_order_id: order.id,
      p_provider_payment_id: String(payment.id),
      p_method: "ONLINE_CARD",
      p_status: mapMercadoPagoStatus(payment.status),
      p_amount_cents: order.total_cents,
      p_raw: { id: payment.id, status: payment.status, status_detail: payment.status_detail },
    });

    // Don't wait for the webhook to show the result: sync now (idempotent with the webhook).
    await syncPaymentFromProvider(order.store_id, String(payment.id));
    return { success: true, data: { status: mapMercadoPagoStatus(payment.status), detail: payment.status_detail } };
  } catch (error) {
    const message = error instanceof MercadoPagoError ? error.message : "Falha ao processar o cartão.";
    return { success: false, error: message };
  }
}

export interface TrackedOrder {
  order_number: number;
  status: string;
  payment_status: PaymentStatus;
  payment_method: string | null;
  payment_expires_at: string | null;
  fulfillment_type: "DELIVERY" | "PICKUP" | "DINE_IN";
  eta_minutes: number | null;
  subtotal_cents: number;
  discount_cents: number;
  fee_cents: number;
  total_cents: number;
  created_at: string;
  items: { name: string; quantity: number; total_cents: number; options: string[] }[];
  timeline: { status: string; at: string }[];
  pix: { qr_code: string | null; qr_code_base64: string | null; expires_at: string | null } | null;
  mp_public_key: string | null;
  store: { name: string; slug: string; whatsapp: string | null; logo_url: string | null };
}

/** Public, token-gated read of an order (no customer personal data). */
export async function getTrackedOrderAction(publicToken: string): Promise<TrackedOrder | null> {
  if (!/^[0-9a-f]{64}$/.test(publicToken)) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_public_order_by_token", { p_token: publicToken });
  return (data as TrackedOrder | null) ?? null;
}
