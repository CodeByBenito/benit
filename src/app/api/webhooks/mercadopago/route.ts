import { after, NextResponse, type NextRequest } from "next/server";
import { env, integrations } from "@/lib/env";
import { syncPaymentFromProvider } from "@/lib/mercadopago/process";
import { verifyMercadoPagoSignature } from "@/lib/mercadopago/signature";
import { notifyOwnerOfNewOrder } from "@/lib/notifications/owner-email";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Mercado Pago payment notifications.
 * 1. Verify x-signature (HMAC) — reject forgeries.
 * 2. Record the event (unique key) — duplicates return 200 immediately.
 * 3. Re-fetch the payment from MP with the store's token and apply it through
 *    the idempotent SQL state machine. The body is never trusted for state.
 * Always 200 on handled/ignored events so MP stops retrying; 5xx only on
 * transient failures we want MP to retry.
 */
export async function POST(request: NextRequest) {
  if (!integrations.mercadoPagoWebhook || !integrations.supabaseAdmin) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const url = request.nextUrl;
  const storeId = url.searchParams.get("store");
  let body: { type?: string; action?: string; data?: { id?: string | number } } = {};
  try {
    body = await request.json();
  } catch {
    // MP may send an empty body on some topics; data.id comes in the query string too.
  }
  const dataId = url.searchParams.get("data.id") ?? (body.data?.id != null ? String(body.data.id) : null);
  const topic = url.searchParams.get("type") ?? body.type ?? "";

  const signature = verifyMercadoPagoSignature({
    signatureHeader: request.headers.get("x-signature"),
    requestId: request.headers.get("x-request-id"),
    dataId,
    secret: env.MP_WEBHOOK_SECRET!,
  });
  if (!signature.valid) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  if (topic !== "payment" || !dataId || !storeId || !UUID.test(storeId)) {
    return NextResponse.json({ ignored: true });
  }

  const admin = createAdminClient();
  const eventKey = `${storeId}:${dataId}:${request.headers.get("x-request-id") ?? body.action ?? ""}`;
  const { error: insertError } = await admin
    .from("webhook_events")
    .insert({ provider: "MERCADO_PAGO", event_key: eventKey, payload: { query: Object.fromEntries(url.searchParams), body } });
  if (insertError) {
    if (insertError.code === "23505") return NextResponse.json({ duplicate: true });
    return NextResponse.json({ error: "store failed" }, { status: 500 });
  }

  try {
    const result = await syncPaymentFromProvider(storeId, dataId);
    await admin.from("webhook_events").update({ processed_at: new Date().toISOString() }).eq("provider", "MERCADO_PAGO").eq("event_key", eventKey);

    if (result === "APPROVED") {
      after(async () => {
        const { data } = await admin.from("payments").select("order_id").eq("provider_payment_id", dataId).maybeSingle();
        if (data?.order_id) await notifyOwnerOfNewOrder(data.order_id);
      });
    }
    return NextResponse.json({ result });
  } catch (error) {
    const message = (error as Error).message;
    // Allow a retry: drop the dedupe row so the next delivery is processed.
    await admin.from("webhook_events").delete().eq("provider", "MERCADO_PAGO").eq("event_key", eventKey);
    console.error("[mp-webhook] processing failed", message);
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
