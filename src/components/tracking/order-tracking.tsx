"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Check, ChefHat, CircleCheckBig, Clock, MessageCircle, PackageCheck, Receipt, X } from "lucide-react";
import { getTrackedOrderAction, type TrackedOrder } from "@/features/checkout/actions";
import { FULFILLMENT_LABEL, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/labels";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { cn, formatCurrencyCents } from "@/lib/utils";
import type { PaymentMethod } from "@/types/domain.types";
import { PaymentPanel } from "./payment-panel";

const FLOW = [
  { status: "NEW", label: "Recebido", icon: Receipt },
  { status: "CONFIRMED", label: "Confirmado", icon: Check },
  { status: "PREPARING", label: "Em preparo", icon: ChefHat },
  { status: "READY", label: "Pronto", icon: PackageCheck },
  { status: "COMPLETED", label: "Concluído", icon: CircleCheckBig },
] as const;

const HEADLINE: Record<string, (o: TrackedOrder) => string> = {
  AWAITING_PAYMENT: () => "Falta só o pagamento.",
  NEW: () => "Pedido recebido!",
  CONFIRMED: () => "A loja confirmou seu pedido.",
  PREPARING: () => "Seu pedido está sendo preparado.",
  READY: (o) => (o.fulfillment_type === "DELIVERY" ? "Pronto! Já vai sair para entrega." : o.fulfillment_type === "DINE_IN" ? "Pronto! Já vai para a sua mesa." : "Pronto para retirada!"),
  COMPLETED: () => "Pedido concluído. Bom apetite!",
  CANCELLED: () => "Este pedido foi cancelado.",
};

export function OrderTracking({ token, initial }: { token: string; initial: TrackedOrder }) {
  const [order, setOrder] = useState(initial);
  const [pulse, setPulse] = useState(false);

  const refresh = useCallback(async () => {
    const next = await getTrackedOrderAction(token);
    if (next) {
      setOrder((prev) => {
        if (prev.status !== next.status || prev.payment_status !== next.payment_status) {
          setPulse(true);
          setTimeout(() => setPulse(false), 1200);
        }
        return next;
      });
    }
  }, [token]);

  // Live updates over a public Broadcast channel (token-scoped), with polling as a safety net.
  useEffect(() => {
    const supabase = isSupabaseConfigured() ? createClient() : null;
    const channel = supabase
      ?.channel(`track:${token}`)
      .on("broadcast", { event: "status" }, () => void refresh())
      .subscribe();
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 20_000);
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      if (supabase && channel) void supabase.removeChannel(channel);
    };
  }, [token, refresh]);

  const cancelled = order.status === "CANCELLED";
  const awaiting = order.status === "AWAITING_PAYMENT";
  const currentIdx = FLOW.findIndex((f) => f.status === order.status);
  const reachedAt = (status: string) => order.timeline.find((t) => t.status === status)?.at;
  const time = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "");
  const storeWa = order.store.whatsapp?.replace(/\D/g, "");
  const waHref = storeWa
    ? `https://wa.me/${storeWa.length <= 11 ? `55${storeWa}` : storeWa}?text=${encodeURIComponent(`Oi! Sobre o meu pedido #${order.order_number}…`)}`
    : null;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-xl px-4 pb-16 pt-8 sm:pt-14">
        <header className="flex items-center justify-between">
          <Link href={`/menu/${order.store.slug}`} className="flex items-center gap-3">
            {order.store.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={order.store.logo_url} alt="" className="h-10 w-10 rounded-xl object-cover" />
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand font-display font-extrabold text-white">{order.store.name.charAt(0)}</span>
            )}
            <span className="font-display font-bold">{order.store.name}</span>
          </Link>
          <span className="font-mono text-sm text-foreground-muted">#{order.order_number}</span>
        </header>

        <section className={cn("mt-10 transition-transform duration-slow ease-spring", pulse && "scale-[1.02]")} aria-live="polite">
          <p className="eyebrow flex items-center gap-2">
            <span className={cn("h-1.5 w-1.5 rounded-full", cancelled ? "bg-danger" : awaiting ? "bg-warning" : "animate-pulse-dot bg-brand")} />
            {FULFILLMENT_LABEL[order.fulfillment_type]}
            {order.eta_minutes && !cancelled && order.status !== "COMPLETED" ? ` · previsão ~${order.eta_minutes} min` : ""}
          </p>
          <h1 className="mt-3 font-display text-display-md font-extrabold">{(HEADLINE[order.status] ?? (() => "Seu pedido"))(order)}</h1>
          {cancelled && (order.payment_status === "REFUND_PENDING" || order.payment_status === "REFUNDED") ? (
            <p className="mt-3 text-sm text-foreground-muted">
              {order.payment_status === "REFUNDED" ? "O valor já foi estornado para você." : "O estorno do pagamento está em andamento."}
            </p>
          ) : null}
        </section>

        {awaiting ? (
          <PaymentPanel token={token} order={order} onPaid={refresh} />
        ) : cancelled ? (
          <div className="mt-8 flex items-center gap-3 rounded-2xl border border-danger/30 bg-danger/[0.07] p-5 text-sm">
            <X className="h-5 w-5 text-danger" />
            <span>Se tiver qualquer dúvida, fale com a loja.</span>
          </div>
        ) : (
          <ol className="mt-10 space-y-0" aria-label="Andamento do pedido">
            {FLOW.filter((f) => f.status !== "COMPLETED" || order.status === "COMPLETED").map((f, i) => {
              const done = i < currentIdx;
              const now = i === currentIdx;
              const Icon = f.icon;
              return (
                <li key={f.status} className="relative flex gap-4 pb-8 last:pb-0">
                  {i < FLOW.length - 1 ? (
                    <span aria-hidden className={cn("absolute left-[19px] top-10 h-[calc(100%-2.5rem)] w-px", done ? "bg-brand" : "bg-border")} />
                  ) : null}
                  <span
                    className={cn(
                      "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors duration-slow",
                      done && "border-brand bg-brand text-white",
                      now && "border-brand bg-brand/15 text-brand",
                      !done && !now && "border-border text-foreground-subtle"
                    )}
                  >
                    {now ? <span className="absolute inset-0 animate-ring rounded-full border border-brand" /> : null}
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="pt-2">
                    <p className={cn("font-medium", !done && !now && "text-foreground-subtle")}>{f.label}</p>
                    {reachedAt(f.status) ? <p className="text-xs text-foreground-muted">{time(reachedAt(f.status))}</p> : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        <section className="mt-12 rounded-2xl border border-border bg-surface p-5" aria-labelledby="summary-title">
          <h2 id="summary-title" className="font-display text-base font-bold">Resumo</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {order.items.map((it, k) => (
              <li key={k} className="flex justify-between gap-4">
                <span>
                  <span className="font-mono text-foreground-muted">{it.quantity}×</span> {it.name}
                  {it.options.length ? <span className="block text-xs text-foreground-muted">{it.options.join(" · ")}</span> : null}
                </span>
                <span className="font-mono">{formatCurrencyCents(it.total_cents)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-1 border-t border-border pt-4 text-sm">
            {order.discount_cents ? (
              <div className="flex justify-between text-success"><dt>Desconto</dt><dd className="font-mono">−{formatCurrencyCents(order.discount_cents)}</dd></div>
            ) : null}
            {order.fee_cents ? (
              <div className="flex justify-between text-foreground-muted"><dt>Entrega</dt><dd className="font-mono">{formatCurrencyCents(order.fee_cents)}</dd></div>
            ) : null}
            <div className="flex justify-between font-medium"><dt>Total</dt><dd className="font-mono">{formatCurrencyCents(order.total_cents)}</dd></div>
            <div className="flex justify-between pt-1 text-xs text-foreground-muted">
              <dt>{order.payment_method ? PAYMENT_METHOD_LABEL[order.payment_method as PaymentMethod] : "Pagamento"}</dt>
              <dd>{PAYMENT_STATUS_LABEL[order.payment_status]}</dd>
            </div>
          </dl>
        </section>

        <div className="mt-6 flex flex-wrap gap-3">
          {waHref ? (
            <a href={waHref} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-2 rounded-full border border-border px-5 text-sm hover:bg-surface-card">
              <MessageCircle className="h-4 w-4" /> Falar com a loja
            </a>
          ) : null}
          <Link href={`/menu/${order.store.slug}`} className="inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm text-foreground-muted hover:text-foreground">
            <Clock className="h-4 w-4" /> Fazer outro pedido
          </Link>
        </div>
      </div>
    </div>
  );
}
