import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStoreAccessToken } from "./accounts";
import { getPayment, refundPayment } from "./api";
import { mapMercadoPagoMethod, mapMercadoPagoStatus, reaisToCents } from "./status-map";

export type PaymentProcessResult = "APPROVED" | "REFUND_REQUIRED" | "REFUNDED" | "PENDING" | "REJECTED" | "NOOP" | "IGNORED";

/**
 * Source of truth for payment state: we never trust the webhook body, we
 * re-fetch the payment from MP with the store's own token, check it belongs
 * to an order of that store, then hand it to the idempotent SQL state machine.
 */
export async function syncPaymentFromProvider(storeId: string, paymentId: string): Promise<PaymentProcessResult> {
  const admin = createAdminClient();
  const accessToken = await getStoreAccessToken(storeId);
  const payment = await getPayment(accessToken, paymentId);

  const orderId = payment.external_reference;
  if (!orderId) return "IGNORED";

  const { data: order } = await admin
    .from("orders")
    .select("id, store_id")
    .eq("id", orderId)
    .eq("store_id", storeId)
    .maybeSingle();
  if (!order) return "IGNORED"; // payment of another app/store: never touch it

  const { data, error } = await admin.rpc("apply_payment_update", {
    p_order_id: order.id,
    p_provider_payment_id: String(payment.id),
    p_status: mapMercadoPagoStatus(payment.status),
    p_amount_cents: reaisToCents(payment.transaction_amount),
    p_method: mapMercadoPagoMethod(payment.payment_type_id),
    p_status_detail: payment.status_detail ?? null,
    p_raw: { id: payment.id, status: payment.status, status_detail: payment.status_detail, payment_type_id: payment.payment_type_id },
  });
  if (error) throw new Error(error.message);

  const result = (data as { result: PaymentProcessResult }).result;
  if (result === "REFUND_REQUIRED") {
    await refundWithAudit(storeId, order.id, String(payment.id), accessToken);
  }
  return result;
}

async function refundWithAudit(storeId: string, orderId: string, paymentId: string, accessToken?: string) {
  const admin = createAdminClient();
  try {
    const token = accessToken ?? (await getStoreAccessToken(storeId));
    await refundPayment(token, paymentId, `refund:${paymentId}`);
    // The "refunded" webhook will move payment_status to REFUNDED.
  } catch (error) {
    await admin.rpc("mark_refund_failed", { p_order_id: orderId, p_error: (error as Error).message });
  }
}

/** Called after staff cancels a paid order. */
export async function refundOrder(storeId: string, orderId: string) {
  const admin = createAdminClient();
  const { data: payment } = await admin
    .from("payments")
    .select("provider_payment_id")
    .eq("order_id", orderId)
    .eq("store_id", storeId)
    .eq("status", "APPROVED")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!payment) return;
  await refundWithAudit(storeId, orderId, payment.provider_payment_id);
}
