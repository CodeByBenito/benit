"use client";

import { useState } from "react";
import { ArrowUpRight, Copy, Loader2, MapPin, MessageCircle, Phone, Printer, Ticket, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { FULFILLMENT_LABEL, ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/labels";
import { buildCustomerStatusMessage, buildWhatsAppLink, trackingUrl } from "@/lib/notifications/whatsapp-templates";
import { cn, formatCurrencyCents, formatPhoneBR } from "@/lib/utils";
import type { Order, OrderStatus } from "@/types/domain.types";
import { KitchenTicket } from "./kitchen-ticket";
import { NEXT_ACTION } from "./order-meta";

export function OrderDetailSheet({
  order,
  storeName,
  onClose,
  onTransition,
  pending,
}: {
  order: Order | null;
  storeName: string;
  onClose: () => void;
  onTransition: (order: Order, status: OrderStatus, reason?: string) => void;
  pending: boolean;
}) {
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");

  if (!order) return null;
  const next = NEXT_ACTION[order.status];
  const finished = order.status === "COMPLETED" || order.status === "CANCELLED";
  const link = typeof window !== "undefined" ? trackingUrl(window.location.origin, order.public_token) : "";
  const message = buildCustomerStatusMessage({
    storeName,
    customerName: order.customer_name_snapshot,
    orderNumber: order.order_number,
    status: order.status,
    fulfillmentType: order.fulfillment_type,
    trackingUrl: link,
    etaMinutes: order.eta_minutes,
  });
  const addr = order.delivery_address;

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="p-0">
        <div className="border-b border-border px-6 py-5 pr-14">
          <p className="font-mono text-xs text-foreground-muted">
            #{order.order_number} · {new Date(order.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
          </p>
          <SheetTitle className="mt-1 font-display text-xl font-bold">{order.customer_name_snapshot}</SheetTitle>
          <SheetDescription className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-surface-card px-2 py-0.5 text-foreground">{ORDER_STATUS_LABEL[order.status]}</span>
            <span className="text-foreground-muted">{FULFILLMENT_LABEL[order.fulfillment_type]}</span>
            {order.table_or_reference ? <span className="text-foreground-muted">· Mesa/ref. {order.table_or_reference}</span> : null}
          </SheetDescription>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {/* Contact + notify */}
          <section className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <a href={`tel:${order.customer_phone_snapshot}`} className="inline-flex items-center gap-2 text-foreground-muted hover:text-foreground">
                <Phone className="h-4 w-4" /> {formatPhoneBR(order.customer_phone_snapshot)}
              </a>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(link);
                  toast.success("Link de acompanhamento copiado.");
                }}
                className="inline-flex items-center gap-1.5 text-xs text-foreground-muted hover:text-foreground"
              >
                <Copy className="h-3.5 w-3.5" /> Link do cliente
              </button>
            </div>
            {message ? (
              <a
                href={buildWhatsAppLink(order.customer_phone_snapshot, message)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between rounded-xl border border-[#2C5A41] bg-[#16291F] px-4 py-3 text-sm text-[#BDE8CB] transition-colors hover:bg-[#1B3326]"
              >
                <span className="flex items-center gap-2 font-medium">
                  <MessageCircle className="h-4 w-4" /> Avisar {order.customer_name_snapshot.split(" ")[0]} no WhatsApp
                  <span className="hidden font-normal text-[#8FC9A3] sm:inline">· {ORDER_STATUS_LABEL[order.status].toLowerCase()}</span>
                </span>
                <ArrowUpRight className="h-4 w-4" />
              </a>
            ) : null}
          </section>

          {addr ? (
            <section className="rounded-xl border border-border bg-surface-card/50 p-4 text-sm">
              <p className="mb-1 flex items-center gap-2 text-xs text-foreground-muted">
                <MapPin className="h-3.5 w-3.5" /> Entrega{order.eta_minutes ? ` · ~${order.eta_minutes} min` : ""}
              </p>
              <p>
                {addr.street}
                {addr.number ? `, ${addr.number}` : ""}
                {addr.complement ? ` — ${addr.complement}` : ""}
              </p>
              <p className="text-foreground-muted">{addr.neighborhood}</p>
              {addr.reference ? <p className="mt-1 text-xs text-foreground-muted">Ref.: {addr.reference}</p> : null}
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${addr.street} ${addr.number ?? ""} ${addr.neighborhood}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs text-brand hover:underline"
              >
                Abrir no mapa <ArrowUpRight className="h-3 w-3" />
              </a>
            </section>
          ) : null}

          {/* Items */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="eyebrow">Itens</h3>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-md text-xs text-foreground-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
              >
                <Printer className="h-3.5 w-3.5" /> Imprimir comanda
              </button>
            </div>
            <ul className="space-y-3">
              {order.items?.map((i) => (
                <li key={i.id} className="flex justify-between gap-4 text-sm">
                  <div>
                    <p>
                      <span className="font-mono text-brand">{i.quantity}×</span> {i.product_name_snapshot}
                    </p>
                    {i.options?.length ? <p className="text-xs text-foreground-muted">{i.options.map((o) => o.option_name_snapshot).join(" · ")}</p> : null}
                    {i.notes ? <p className="mt-0.5 text-xs italic text-warning">“{i.notes}”</p> : null}
                  </div>
                  <span className="font-mono text-foreground-muted">{formatCurrencyCents(i.total_item_cents)}</span>
                </li>
              ))}
            </ul>
            {order.notes ? <p className="mt-4 rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">Obs.: {order.notes}</p> : null}
          </section>

          {/* Money */}
          <section className="space-y-1.5 border-t border-border pt-4 text-sm">
            <Row label="Subtotal" value={formatCurrencyCents(order.subtotal_cents)} />
            {order.discount_cents ? (
              <Row
                label={
                  <span className="inline-flex items-center gap-1.5">
                    <Ticket className="h-3.5 w-3.5" /> Desconto{order.coupon_code_snapshot ? ` (${order.coupon_code_snapshot})` : ""}
                  </span>
                }
                value={`−${formatCurrencyCents(order.discount_cents)}`}
                className="text-success"
              />
            ) : null}
            {order.fee_cents ? <Row label="Taxa de entrega" value={formatCurrencyCents(order.fee_cents)} /> : null}
            <Row label="Total" value={formatCurrencyCents(order.total_cents)} className="pt-1 text-base font-semibold" />
            <div className="flex items-center justify-between pt-2 text-xs">
              <span className="text-foreground-muted">{order.payment_method ? PAYMENT_METHOD_LABEL[order.payment_method] : "Pagamento"}</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 font-medium",
                  order.payment_status === "APPROVED" && "bg-success/15 text-success",
                  (order.payment_status === "PENDING" || order.payment_status === "REFUND_PENDING") && "bg-warning/15 text-warning",
                  order.payment_status === "PAY_ON_DELIVERY" && "bg-surface-card text-foreground-muted",
                  (order.payment_status === "REJECTED" || order.payment_status === "EXPIRED" || order.payment_status === "REFUNDED") && "bg-danger/10 text-danger"
                )}
              >
                {PAYMENT_STATUS_LABEL[order.payment_status]}
              </span>
            </div>
            {order.change_for_cents ? <p className="text-xs text-foreground-muted">Levar troco para {formatCurrencyCents(order.change_for_cents)}</p> : null}
          </section>

          {/* Timeline */}
          {order.status_history?.length ? (
            <section>
              <h3 className="eyebrow mb-3">Histórico</h3>
              <ol className="space-y-2.5 border-l border-border pl-4">
                {[...order.status_history].reverse().map((h) => (
                  <li key={h.id} className="relative text-xs">
                    <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-border-strong" />
                    <span className="font-medium text-foreground">{ORDER_STATUS_LABEL[h.to_status]}</span>
                    <span className="text-foreground-muted"> · {new Date(h.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                    {h.reason ? <p className="text-foreground-muted">{h.reason}</p> : null}
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </div>

        {!finished ? (
          <div className="border-t border-border bg-surface p-4">
            {cancelOpen ? (
              <div className="space-y-3">
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo do cancelamento (aparece no histórico)" className="min-h-[64px]" />
                {order.payment_status === "APPROVED" ? (
                  <p className="text-xs text-warning">Este pedido foi pago online: o valor será estornado automaticamente no Mercado Pago.</p>
                ) : null}
                <div className="flex gap-2">
                  <Button variant="ghost" className="flex-1" onClick={() => setCancelOpen(false)}>
                    Voltar
                  </Button>
                  <Button variant="destructive" className="flex-1" disabled={pending} onClick={() => onTransition(order, "CANCELLED", reason || undefined)}>
                    {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />} Cancelar pedido
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setCancelOpen(true)} disabled={pending}>
                  Cancelar
                </Button>
                {next ? (
                  <Button className="flex-1" size="lg" disabled={pending} onClick={() => onTransition(order, next.next)}>
                    {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {next.label}
                  </Button>
                ) : (
                  <p className="flex-1 self-center text-center text-xs text-foreground-muted">Aguardando aprovação do pagamento online.</p>
                )}
              </div>
            )}
          </div>
        ) : null}
      </SheetContent>
      <KitchenTicket order={order} storeName={storeName} />
    </Sheet>
  );
}

function Row({ label, value, className }: { label: React.ReactNode; value: string; className?: string }) {
  return (
    <div className={cn("flex justify-between", className)}>
      <span className={cn(!className?.includes("font-semibold") && "text-foreground-muted")}>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
