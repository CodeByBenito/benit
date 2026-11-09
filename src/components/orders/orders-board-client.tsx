"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Bell, BellOff, Clock, CreditCard, Flame, Maximize2, MessageSquareText, Minimize2, Plus, Search, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Segmented } from "@/components/ui/segmented";
import { toast } from "@/components/ui/toast";
import { transitionOrderStatusAction } from "@/features/orders/actions";
import { FULFILLMENT_LABEL, ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/labels";
import { useStoreRealtime } from "@/lib/supabase/use-store-realtime";
import { cn, formatCurrencyCents } from "@/lib/utils";
import type { FulfillmentType, Order, OrderStatus, Product } from "@/types/domain.types";
import { ManualOrderDialog } from "./manual-order-dialog";
import { OrderDetailSheet } from "./order-detail-sheet";
import { BOARD_COLUMNS, elapsedLabel, minutesSince, NEXT_ACTION, playChime } from "./order-meta";

const SOUND_KEY = "benit:orders:sound";

export function OrdersBoardClient({ storeId, storeName, initialOrders, products }: { storeId: string; storeName: string; initialOrders: Order[]; products: Product[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { connected } = useStoreRealtime(storeId, ["orders", "products"], "orders-board");
  const [view, setView] = useState<"board" | "history">("board");
  const [focus, setFocus] = useState(false);
  const [filter, setFilter] = useState<"ALL" | FulfillmentType>("ALL");
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(searchParams.get("new") === "1");
  const [sound, setSound] = useState(true);
  const [pending, start] = useTransition();
  const [, tick] = useState(0);
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  // Re-render every 30s so elapsed timers stay honest.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    try {
      setSound(window.localStorage.getItem(SOUND_KEY) !== "off");
    } catch {
      /* ignore */
    }
  }, []);

  // Detect orders that just arrived as NEW: chime + arrival highlight.
  useEffect(() => {
    const newIds = initialOrders.filter((o) => o.status === "NEW").map((o) => o.id);
    if (seen.current === null) {
      seen.current = new Set(newIds);
      return;
    }
    const arrived = newIds.filter((id) => !seen.current!.has(id));
    newIds.forEach((id) => seen.current!.add(id));
    if (arrived.length) {
      setFresh(new Set(arrived));
      if (sound) playChime();
      const first = initialOrders.find((o) => o.id === arrived[0]);
      if (first) toast(`Novo pedido #${first.order_number}`, { description: `${first.customer_name_snapshot} · ${formatCurrencyCents(first.total_cents)}` });
      setTimeout(() => setFresh(new Set()), 2500);
    }
  }, [initialOrders, sound]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return initialOrders.filter((o) => {
      if (filter !== "ALL" && o.fulfillment_type !== filter) return false;
      if (urgentOnly && minutesSince(o.created_at) < 15) return false;
      if (!q) return true;
      return (
        String(o.order_number).includes(q) ||
        o.customer_name_snapshot.toLowerCase().includes(q) ||
        o.customer_phone_snapshot.includes(q) ||
        (o.table_or_reference ?? "").toLowerCase().includes(q)
      );
    });
  }, [initialOrders, filter, urgentOnly, query]);

  const awaiting = filtered.filter((o) => o.status === "AWAITING_PAYMENT");
  const selected = initialOrders.find((o) => o.id === selectedId) ?? null;

  function transition(order: Order, status: OrderStatus, reason?: string) {
    start(async () => {
      const res = await transitionOrderStatusAction({ storeId, orderId: order.id, newStatus: status, reason });
      if (!res.success) {
        toast.error(res.error ?? "Não foi possível atualizar o pedido.");
        return;
      }
      const refund = (res.data as { refund_required?: boolean } | undefined)?.refund_required;
      toast.success(`#${order.order_number} → ${ORDER_STATUS_LABEL[status]}`, refund ? { description: "Estorno solicitado ao Mercado Pago." } : undefined);
      if (status === "CANCELLED" || status === "COMPLETED") setSelectedId(null);
      router.refresh();
    });
  }

  function toggleSound() {
    const next = !sound;
    setSound(next);
    try {
      window.localStorage.setItem(SOUND_KEY, next ? "on" : "off");
    } catch {
      /* ignore */
    }
    if (next) playChime();
  }

  return (
    <div className={cn("space-y-6", focus && "fixed inset-0 z-40 overflow-y-auto bg-background p-4 sm:p-6")}>
      {!focus ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow mb-2 flex items-center gap-2">
              <span className={cn("h-1.5 w-1.5 rounded-full", connected ? "animate-pulse-dot bg-success" : "bg-warning")} />
              {connected ? "Ao vivo" : "Sincronizando"}
            </p>
            <h1 className="font-display text-display-sm font-extrabold sm:text-3xl">Pedidos</h1>
            <p className="mt-1.5 text-sm text-foreground-muted">Do cardápio, do balcão e da mesa — em tempo real em {storeName}.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={toggleSound} aria-label={sound ? "Desativar som de novos pedidos" : "Ativar som de novos pedidos"} title={sound ? "Som ligado" : "Som desligado"}>
              {sound ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
            </Button>
            <Button onClick={() => setManualOpen(true)}>
              <Plus className="h-4 w-4" /> Pedido no balcão
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            name="Filtrar atendimento"
            value={filter}
            onChange={setFilter}
            className="w-full sm:w-auto"
            options={[
              { value: "ALL", label: "Todos" },
              { value: "DELIVERY", label: "Entrega" },
              { value: "PICKUP", label: "Retirada" },
              { value: "DINE_IN", label: "Mesa" },
            ]}
          />
          <button
            type="button"
            onClick={() => setUrgentOnly((v) => !v)}
            aria-pressed={urgentOnly}
            className={cn(
              "inline-flex h-11 items-center gap-2 rounded-xl border px-3.5 text-sm transition-colors",
              urgentOnly ? "border-warning/40 bg-warning/10 text-warning" : "border-border text-foreground-muted hover:text-foreground"
            )}
          >
            <Flame className="h-4 w-4" /> Atrasados (+15 min)
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative basis-full sm:basis-auto sm:flex-1 lg:w-72 lg:flex-none">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-subtle" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nº, cliente, telefone ou mesa"
              aria-label="Buscar pedidos"
              className="h-11 w-full rounded-xl border border-border bg-surface pl-9 pr-3 text-sm placeholder:text-foreground-subtle focus-visible:border-brand/60 focus-visible:outline-none"
            />
          </div>
          <Segmented
            name="Visualização"
            value={view}
            onChange={setView}
            options={[
              { value: "board", label: "Quadro" },
              { value: "history", label: "Histórico" },
            ]}
          />
          <Button variant="outline" size="icon" className="h-11 w-11" onClick={() => setFocus((f) => !f)} aria-label={focus ? "Sair do modo cozinha" : "Modo cozinha (tela cheia)"}>
            {focus ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {view === "board" ? (
        <>
          {awaiting.length ? (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-border px-4 py-3 text-sm">
              <CreditCard className="h-4 w-4 text-foreground-subtle" />
              <span className="text-foreground-muted">Aguardando pagamento online:</span>
              {awaiting.map((o) => (
                <button key={o.id} type="button" onClick={() => setSelectedId(o.id)} className="rounded-full border border-border px-2.5 py-0.5 font-mono text-xs hover:border-border-strong">
                  #{o.order_number} · {formatCurrencyCents(o.total_cents)}
                </button>
              ))}
              <span className="text-xs text-foreground-subtle">Entram no quadro quando o pagamento é aprovado.</span>
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {BOARD_COLUMNS.map((col) => {
              const orders = filtered.filter((o) => o.status === col.status).sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
              return (
                <section key={col.status} aria-label={col.title} className="flex min-h-[200px] flex-col rounded-2xl border border-border bg-surface/50">
                  <header className="flex items-center justify-between px-4 py-3.5">
                    <h2 className="flex items-center gap-2 text-sm font-semibold">
                      <span className={cn("h-2 w-2 rounded-full", col.accent)} /> {col.title}
                    </h2>
                    <span className="rounded-full bg-surface-card px-2 py-0.5 font-mono text-xs text-foreground-muted">{orders.length}</span>
                  </header>
                  <div className="flex flex-1 flex-col gap-2.5 px-2.5 pb-2.5">
                    {orders.length === 0 ? <p className="py-8 text-center text-xs text-foreground-subtle">Nenhum pedido</p> : null}
                    {orders.map((o) => (
                      <OrderCard key={o.id} order={o} fresh={fresh.has(o.id)} pending={pending} onOpen={() => setSelectedId(o.id)} onAdvance={transition} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      ) : (
        <HistoryTable orders={filtered} onOpen={(id) => setSelectedId(id)} />
      )}

      <OrderDetailSheet order={selected} storeName={storeName} onClose={() => setSelectedId(null)} onTransition={transition} pending={pending} />
      <ManualOrderDialog open={manualOpen} onOpenChange={setManualOpen} storeId={storeId} products={products} onCreated={() => router.refresh()} />
    </div>
  );
}

function OrderCard({ order, fresh, pending, onOpen, onAdvance }: { order: Order; fresh: boolean; pending: boolean; onOpen: () => void; onAdvance: (o: Order, s: OrderStatus) => void }) {
  const mins = minutesSince(order.created_at);
  const late = mins >= 15 && order.status !== "READY";
  const next = NEXT_ACTION[order.status];
  const notes = order.notes || order.items?.some((i) => i.notes);
  return (
    <article
      className={cn(
        "group rounded-xl border bg-surface-elevated/70 p-3.5 shadow-raised transition-colors duration-base hover:border-border-strong",
        fresh ? "animate-order-arrive border-brand/60" : late ? "border-warning/40" : "border-white/[0.06]"
      )}
    >
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-xs text-foreground-muted">
            #{order.order_number} · {FULFILLMENT_LABEL[order.fulfillment_type]}
            {order.table_or_reference ? ` ${order.table_or_reference}` : ""}
          </span>
          <span className={cn("inline-flex items-center gap-1 font-mono text-xs", late ? "text-warning" : "text-foreground-subtle")}>
            {late ? <Timer className="h-3 w-3" /> : <Clock className="h-3 w-3" />} {elapsedLabel(order.created_at)}
          </span>
        </div>
        <p className="mt-1.5 truncate font-medium">{order.customer_name_snapshot}</p>
        <ul className="mt-2 space-y-0.5 text-[13px] text-foreground-muted">
          {order.items?.slice(0, 4).map((i) => (
            <li key={i.id} className="truncate">
              <span className="font-mono text-foreground">{i.quantity}×</span> {i.product_name_snapshot}
              {i.options?.length ? <span className="text-foreground-subtle"> · {i.options.map((x) => x.option_name_snapshot).join(", ")}</span> : null}
            </li>
          ))}
          {(order.items?.length ?? 0) > 4 ? <li className="text-xs text-foreground-subtle">+{(order.items?.length ?? 0) - 4} itens</li> : null}
        </ul>
        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="flex items-center gap-2">
            <span
              className={cn(
                "rounded-full px-2 py-0.5",
                order.payment_status === "APPROVED" ? "bg-success/15 text-success" : "bg-surface-card text-foreground-muted"
              )}
            >
              {order.payment_status === "APPROVED" ? "Pago" : PAYMENT_STATUS_LABEL[order.payment_status]}
            </span>
            {notes ? <MessageSquareText className="h-3.5 w-3.5 text-warning" aria-label="Tem observações" /> : null}
          </span>
          <span className="font-mono font-medium">{formatCurrencyCents(order.total_cents)}</span>
        </div>
      </button>
      {next ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => onAdvance(order, next.next)}
          className="mt-3 h-9 w-full rounded-lg border border-white/[0.08] bg-background/40 text-sm font-medium transition-colors hover:border-brand/50 hover:bg-brand hover:text-white disabled:opacity-50"
        >
          {next.label}
        </button>
      ) : null}
    </article>
  );
}

function HistoryTable({ orders, onOpen }: { orders: Order[]; onOpen: (id: string) => void }) {
  if (!orders.length) return <EmptyState title="Nenhum pedido encontrado" description="Ajuste os filtros ou a busca." />;
  return (
    <div className="overflow-x-auto rounded-2xl border border-border">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-surface text-left text-xs text-foreground-muted">
          <tr>
            {["Pedido", "Cliente", "Atendimento", "Status", "Pagamento", "Total", "Quando"].map((h) => (
              <th key={h} className="px-4 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {orders.map((o) => (
            <tr key={o.id} onClick={() => onOpen(o.id)} className="cursor-pointer transition-colors hover:bg-surface-card/60">
              <td className="px-4 py-3 font-mono">#{o.order_number}</td>
              <td className="px-4 py-3">{o.customer_name_snapshot}</td>
              <td className="px-4 py-3 text-foreground-muted">{FULFILLMENT_LABEL[o.fulfillment_type]}</td>
              <td className="px-4 py-3">{ORDER_STATUS_LABEL[o.status]}</td>
              <td className="px-4 py-3 text-foreground-muted">{PAYMENT_STATUS_LABEL[o.payment_status]}</td>
              <td className="px-4 py-3 font-mono">{formatCurrencyCents(o.total_cents)}</td>
              <td className="px-4 py-3 text-foreground-muted">{new Date(o.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
