"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff, ChefHat, Clock, Maximize2, Minimize2, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { transitionOrderStatusAction } from "@/features/orders/actions";
import type { ActionResult } from "@/features/auth/actions";
import { FULFILLMENT_LABEL, ORDER_STATUS_LABEL } from "@/lib/labels";
import { useStoreRealtime } from "@/lib/supabase/use-store-realtime";
import { cn } from "@/lib/utils";
import type { KitchenOrder } from "@/lib/orders/kitchen";
import type { OrderStatus } from "@/types/domain.types";
import { elapsedLabel, minutesSince, playChime } from "./order-meta";

const COLUMNS: { status: KitchenOrder["status"]; title: string; accent: string; action?: { next: OrderStatus; label: string } }[] = [
  { status: "CONFIRMED", title: "A fazer", accent: "bg-brand", action: { next: "PREPARING", label: "Iniciar preparo" } },
  { status: "PREPARING", title: "Em preparo", accent: "bg-warning", action: { next: "READY", label: "Marcar pronto" } },
  { status: "READY", title: "Prontos", accent: "bg-success" },
];

const SOUND_KEY = "benit:kitchen:sound";

type Transition = (payload: { storeId: string; orderId: string; newStatus: OrderStatus }) => Promise<ActionResult>;

export function KitchenBoard({
  storeId,
  storeName,
  orders,
  waitingConfirmation = 0,
  transition = transitionOrderStatusAction,
}: {
  storeId: string;
  storeName: string;
  orders: KitchenOrder[];
  /** Orders still waiting for the front of house to confirm. */
  waitingConfirmation?: number;
  transition?: Transition;
}) {
  const router = useRouter();
  const { connected } = useStoreRealtime(storeId, ["orders"], "kitchen-board");
  const [fullscreen, setFullscreen] = useState(false);
  const [sound, setSound] = useState(true);
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, tick] = useState(0);
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());

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

  // New tickets in "A fazer": chime + arrival highlight.
  useEffect(() => {
    const todo = orders.filter((o) => o.status === "CONFIRMED").map((o) => o.id);
    if (seen.current === null) {
      seen.current = new Set(todo);
      return;
    }
    const arrived = todo.filter((id) => !seen.current!.has(id));
    todo.forEach((id) => seen.current!.add(id));
    if (arrived.length) {
      setFresh(new Set(arrived));
      if (sound) playChime();
      setTimeout(() => setFresh(new Set()), 2500);
    }
  }, [orders, sound]);

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

  function advance(order: KitchenOrder, next: OrderStatus) {
    setBusyId(order.id);
    start(async () => {
      const res = await transition({ storeId, orderId: order.id, newStatus: next });
      setBusyId(null);
      if (!res.success) {
        toast.error(res.error ?? "Não foi possível atualizar o pedido.");
        return;
      }
      toast.success(`#${order.order_number} → ${ORDER_STATUS_LABEL[next]}`);
      router.refresh();
    });
  }

  return (
    <div className={cn("space-y-6", fullscreen && "fixed inset-0 z-40 overflow-y-auto bg-background p-4 sm:p-6")}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow mb-2 flex items-center gap-2">
            <span className={cn("h-1.5 w-1.5 rounded-full", connected ? "animate-pulse-dot bg-success" : "bg-warning")} />
            {connected ? "Ao vivo" : "Sincronizando"}
          </p>
          <h1 className="font-display text-display-sm font-extrabold sm:text-3xl">Cozinha</h1>
          <p className="mt-1.5 text-sm text-foreground-muted">
            Pedidos confirmados de {storeName}, do mais antigo para o mais novo.
            {waitingConfirmation > 0 ? (
              <span className="ml-1 text-foreground">
                {waitingConfirmation === 1 ? "1 pedido aguarda" : `${waitingConfirmation} pedidos aguardam`} confirmação do atendimento.
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-11 w-11" onClick={toggleSound} aria-label={sound ? "Desativar som de novos pedidos" : "Ativar som de novos pedidos"} aria-pressed={sound}>
            {sound ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
          </Button>
          <Button variant="outline" size="icon" className="h-11 w-11" onClick={() => setFullscreen((f) => !f)} aria-label={fullscreen ? "Sair da tela cheia" : "Tela cheia"} aria-pressed={fullscreen}>
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((col) => {
          const list = orders.filter((o) => o.status === col.status).sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
          return (
            <section key={col.status} aria-label={col.title} className="flex min-h-[220px] flex-col rounded-2xl border border-border bg-surface/50">
              <header className="flex items-center justify-between px-4 py-3.5">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <span className={cn("h-2 w-2 rounded-full", col.accent)} /> {col.title}
                </h2>
                <span className="rounded-full bg-surface-card px-2 py-0.5 font-mono text-xs text-foreground-muted">{list.length}</span>
              </header>
              <div className="flex flex-1 flex-col gap-3 px-2.5 pb-2.5">
                {list.length === 0 ? (
                  <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-foreground-subtle">
                    {col.status === "CONFIRMED" ? <ChefHat className="h-5 w-5" /> : null}
                    <p className="text-xs">{col.status === "CONFIRMED" ? "Nada na fila." : "Nenhum pedido"}</p>
                  </div>
                ) : null}
                {list.map((o) => (
                  <Ticket key={o.id} order={o} fresh={fresh.has(o.id)} busy={pending && busyId === o.id} action={col.action} onAdvance={advance} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Ticket({
  order,
  fresh,
  busy,
  action,
  onAdvance,
}: {
  order: KitchenOrder;
  fresh: boolean;
  busy: boolean;
  action?: { next: OrderStatus; label: string };
  onAdvance: (order: KitchenOrder, next: OrderStatus) => void;
}) {
  const mins = minutesSince(order.created_at);
  const late = mins >= 15 && order.status !== "READY";
  return (
    <article
      aria-label={`Pedido ${order.order_number}`}
      className={cn(
        "rounded-xl border bg-surface-elevated/70 p-4 shadow-raised",
        fresh ? "animate-order-arrive border-brand/60" : late ? "border-warning/40" : "border-white/[0.06]"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-2xl font-semibold leading-none">#{order.order_number}</p>
          <p className="mt-1.5 text-xs text-foreground-muted">
            {FULFILLMENT_LABEL[order.fulfillment_type]}
            {order.table_or_reference ? ` ${order.table_or_reference}` : ""} · {order.customer_first_name}
          </p>
        </div>
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 font-mono text-xs", late ? "bg-warning/15 text-warning" : "bg-surface-card text-foreground-muted")}>
          {late ? <Timer className="h-3 w-3" /> : <Clock className="h-3 w-3" />} {elapsedLabel(order.created_at)}
        </span>
      </div>

      <ul className="mt-4 space-y-2.5">
        {order.items.map((item) => (
          <li key={item.id} className="text-[15px] leading-snug">
            <p>
              <span className="mr-1.5 font-mono font-semibold text-brand">{item.quantity}×</span>
              <span className="font-medium">{item.name}</span>
            </p>
            {item.options.length ? <p className="ml-7 text-sm text-foreground-muted">{item.options.join(" · ")}</p> : null}
            {item.notes ? <p className="ml-7 mt-1 rounded-md bg-warning/10 px-2 py-1 text-sm text-warning">{item.notes}</p> : null}
          </li>
        ))}
      </ul>

      {order.notes ? (
        <p className="mt-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
          <span className="font-medium">Obs.:</span> {order.notes}
        </p>
      ) : null}

      {action ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => onAdvance(order, action.next)}
          className="mt-4 h-11 w-full rounded-lg border border-white/[0.08] bg-background/40 text-sm font-medium transition-colors hover:border-brand/50 hover:bg-brand hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 disabled:opacity-50"
        >
          {action.label}
        </button>
      ) : (
        <p className="mt-4 text-center text-xs text-foreground-subtle">Aguardando o atendimento entregar.</p>
      )}
    </article>
  );
}
