import "server-only";
import { env, integrations } from "@/lib/env";
import { sendEmail } from "@/lib/email/send";
import { newOrderEmail } from "@/lib/email/templates";
import { FULFILLMENT_LABEL, PAYMENT_METHOD_LABEL } from "@/lib/labels";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PaymentMethod } from "@/types/domain.types";

/** Emails every OWNER of the store's organization about a new (or newly paid) order. */
export async function notifyOwnerOfNewOrder(orderId: string) {
  if (!integrations.resend || !integrations.supabaseAdmin) return;
  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("order_number, customer_name_snapshot, total_cents, fulfillment_type, payment_method, store_id, order_items(product_name_snapshot, quantity)")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return;
  const { data: store } = await admin.from("stores").select("name, organization_id, notify_owner_email").eq("id", order.store_id).maybeSingle();
  if (!store?.notify_owner_email) return;
  const { data: owners } = await admin
    .from("memberships")
    .select("profiles(email)")
    .eq("organization_id", store.organization_id)
    .eq("role", "OWNER");
  const emails = (owners ?? [])
    .map((m) => (m.profiles as unknown as { email: string } | null)?.email)
    .filter((e): e is string => Boolean(e));
  const mail = newOrderEmail({
    storeName: store.name,
    orderNumber: order.order_number,
    customerName: order.customer_name_snapshot,
    totalCents: order.total_cents,
    fulfillment: FULFILLMENT_LABEL[order.fulfillment_type as keyof typeof FULFILLMENT_LABEL] ?? "",
    paymentLabel: order.payment_method ? PAYMENT_METHOD_LABEL[order.payment_method as PaymentMethod] : "",
    items: ((order.order_items as { product_name_snapshot: string; quantity: number }[]) ?? []).map((i) => ({
      name: i.product_name_snapshot,
      quantity: i.quantity,
    })),
    appUrl: env.NEXT_PUBLIC_APP_URL,
  });
  await Promise.all(emails.map((to) => sendEmail({ to, ...mail })));
}
