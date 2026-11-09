import Link from "next/link";
import { AlertTriangle, ArrowUpRight, Check, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { getPaymentAccountStatus } from "@/features/payments/actions";
import { FULFILLMENT_LABEL, ORDER_STATUS_LABEL } from "@/lib/labels";
import { requireTenantContext } from "@/lib/permissions/tenant";
import { createClient } from "@/lib/supabase/server";
import { cn, formatCurrencyCents } from "@/lib/utils";
import type { Order, Product } from "@/types/domain.types";

const COUNTS_AS_SALE = (o: Pick<Order, "status">) => o.status !== "CANCELLED" && o.status !== "AWAITING_PAYMENT";
const DAY = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** YYYY-MM-DD of a date in the store's timezone. */
function dayKey(d: Date, tz: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export default async function DashboardPage() {
  const tenant = await requireTenantContext();
  const supabase = await createClient();
  const store = tenant.store;
  const tz = store.timezone || "America/Sao_Paulo";
  const since = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: ordersData }, { data: productsData }, { count: zonesCount }, { count: hoursCount }, account] = await Promise.all([
    supabase
      .from("orders")
      .select("id, order_number, status, total_cents, created_at, customer_name_snapshot, fulfillment_type, payment_status")
      .eq("store_id", store.id)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(2000),
    supabase.from("products").select("id, name, track_stock, stock_quantity, low_stock_threshold, is_available").eq("store_id", store.id).eq("is_archived", false),
    supabase.from("delivery_zones").select("id", { count: "exact", head: true }).eq("store_id", store.id),
    supabase.from("store_business_hours").select("id", { count: "exact", head: true }).eq("store_id", store.id),
    getPaymentAccountStatus(store.id),
  ]);

  const orders = (ordersData ?? []) as Order[];
  const products = (productsData ?? []) as Product[];
  const today = dayKey(new Date(), tz);
  const todayOrders = orders.filter((o) => dayKey(new Date(o.created_at), tz) === today);
  const todaySales = todayOrders.filter(COUNTS_AS_SALE);
  const revenue = todaySales.reduce((n, o) => n + o.total_cents, 0);
  const ticket = todaySales.length ? Math.round(revenue / todaySales.length) : 0;
  const queue = {
    NEW: orders.filter((o) => o.status === "NEW").length,
    CONFIRMED: orders.filter((o) => o.status === "CONFIRMED").length,
    PREPARING: orders.filter((o) => o.status === "PREPARING").length,
    READY: orders.filter((o) => o.status === "READY").length,
  };

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 24 * 60 * 60 * 1000);
    const key = dayKey(d, tz);
    const sales = orders.filter((o) => COUNTS_AS_SALE(o) && dayKey(new Date(o.created_at), tz) === key);
    return { key, label: DAY[new Date(`${key}T12:00:00`).getDay()], cents: sales.reduce((n, o) => n + o.total_cents, 0), count: sales.length };
  });
  const max = Math.max(...days.map((d) => d.cents), 1);
  const week = days.reduce((n, d) => n + d.cents, 0);

  const low = products.filter((p) => p.track_stock && p.stock_quantity <= p.low_stock_threshold).sort((a, b) => a.stock_quantity - b.stock_quantity);

  const setup = [
    { done: products.length > 0, label: "Cadastrar o cardápio", href: "/menu-manager" },
    { done: (zonesCount ?? 0) > 0 || !store.accepts_delivery, label: "Definir bairros de entrega", href: "/settings?tab=delivery" },
    { done: (hoursCount ?? 0) > 0, label: "Configurar horários", href: "/settings?tab=hours" },
    { done: account.connected, label: "Conectar o Mercado Pago", href: "/settings?tab=payments" },
    { done: Boolean(store.logo_url), label: "Enviar o logo da loja", href: "/settings" },
  ];
  const pendingSetup = setup.filter((s) => !s.done);
  const greeting = (() => {
    const h = Number(new Intl.DateTimeFormat("pt-BR", { timeZone: tz, hour: "numeric", hour12: false }).format(new Date()));
    return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  })();

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        eyebrow={new Intl.DateTimeFormat("pt-BR", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(new Date())}
        title={`${greeting}, ${tenant.user.full_name.split(" ")[0]}.`}
        description={`Como está ${store.name} agora.`}
        actions={
          <Button asChild>
            <Link href="/orders?new=1">
              <Plus className="h-4 w-4" /> Pedido no balcão
            </Link>
          </Button>
        }
      />

      {pendingSetup.length ? (
        <section className="rounded-2xl border border-brand/30 bg-brand/[0.05] p-5 sm:p-6" aria-labelledby="setup-title">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="setup-title" className="font-display text-lg font-bold">
              Deixe sua loja pronta para vender
            </h2>
            <span className="font-mono text-xs text-foreground-muted">
              {setup.length - pendingSetup.length}/{setup.length} concluídos
            </span>
          </div>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${((setup.length - pendingSetup.length) / setup.length) * 100}%` }} />
          </div>
          <ul className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {setup.map((s) => (
              <li key={s.label}>
                <Link
                  href={s.href}
                  className={cn(
                    "flex h-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition-colors",
                    s.done ? "border-transparent text-foreground-subtle line-through" : "border-border bg-background/50 hover:border-brand/50"
                  )}
                >
                  <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border", s.done ? "border-success bg-success text-background" : "border-border-strong")}>
                    {s.done ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                  </span>
                  {s.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* KPIs */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Indicadores de hoje">
        <Kpi label="Faturamento hoje" value={formatCurrencyCents(revenue)} hint="Pedidos não cancelados e pagos" accent />
        <Kpi label="Pedidos hoje" value={String(todaySales.length)} hint={`${todayOrders.length - todaySales.length} cancelados/pendentes`} />
        <Kpi label="Ticket médio" value={formatCurrencyCents(ticket)} />
        <Kpi label="Últimos 7 dias" value={formatCurrencyCents(week)} />
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        {/* Chart */}
        <section className="surface-card p-5 sm:p-6" aria-labelledby="chart-title">
          <div className="flex items-center justify-between">
            <h2 id="chart-title" className="font-display font-bold">
              Faturamento por dia
            </h2>
            <span className="text-xs text-foreground-muted">7 dias</span>
          </div>
          <div className="mt-6 flex h-48 items-end gap-2 sm:gap-3" role="img" aria-label={days.map((d) => `${d.label}: ${formatCurrencyCents(d.cents)}`).join(", ")}>
            {days.map((d, i) => (
              <div key={d.key} className="group flex h-full flex-1 flex-col items-center justify-end gap-2">
                <span className="font-mono text-[10px] text-foreground-subtle opacity-0 transition-opacity group-hover:opacity-100">{formatCurrencyCents(d.cents)}</span>
                <div
                  className={cn("w-full rounded-t-lg transition-colors", i === days.length - 1 ? "bg-brand" : "bg-white/[0.09] group-hover:bg-white/20")}
                  style={{ height: `${Math.max(2, (d.cents / max) * 100)}%` }}
                />
                <span className={cn("text-xs", i === days.length - 1 ? "font-medium text-foreground" : "text-foreground-muted")}>{d.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Live queue */}
        <section className="surface-card p-5 sm:p-6" aria-labelledby="queue-title">
          <div className="flex items-center justify-between">
            <h2 id="queue-title" className="font-display font-bold">
              Fila agora
            </h2>
            <Link href="/orders" className="inline-flex items-center gap-1 text-xs text-foreground-muted hover:text-foreground">
              Abrir quadro <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-2">
            {(Object.keys(queue) as (keyof typeof queue)[]).map((k) => (
              <div key={k} className={cn("rounded-xl border p-3.5", k === "NEW" && queue.NEW ? "border-brand/40 bg-brand/[0.06]" : "border-border")}>
                <dt className="text-xs text-foreground-muted">{ORDER_STATUS_LABEL[k]}</dt>
                <dd className="mt-1 font-mono text-2xl">{queue[k]}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="surface-card p-5 sm:p-6" aria-labelledby="recent-title">
          <h2 id="recent-title" className="font-display font-bold">
            Últimos pedidos
          </h2>
          {orders.length === 0 ? (
            <p className="mt-6 text-sm text-foreground-muted">
              Nenhum pedido ainda. Compartilhe o link <span className="font-mono text-foreground">/menu/{store.slug}</span> com seus clientes.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {orders.slice(0, 6).map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <span className="min-w-0">
                    <span className="font-mono text-foreground-muted">#{o.order_number}</span> <span className="truncate">{o.customer_name_snapshot}</span>
                    <span className="block text-xs text-foreground-subtle">
                      {FULFILLMENT_LABEL[o.fulfillment_type]} · {ORDER_STATUS_LABEL[o.status]}
                    </span>
                  </span>
                  <span className="font-mono">{formatCurrencyCents(o.total_cents)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="surface-card p-5 sm:p-6" aria-labelledby="stock-title">
          <div className="flex items-center justify-between">
            <h2 id="stock-title" className="font-display font-bold">
              Estoque em alerta
            </h2>
            <Link href="/inventory" className="inline-flex items-center gap-1 text-xs text-foreground-muted hover:text-foreground">
              Ver estoque <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {low.length === 0 ? (
            <p className="mt-6 flex items-center gap-2 text-sm text-foreground-muted">
              <Check className="h-4 w-4 text-success" /> Tudo abastecido.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {low.slice(0, 6).map((p) => (
                <li key={p.id} className="flex items-center justify-between py-3 text-sm">
                  <span className="flex items-center gap-2">
                    <AlertTriangle className={cn("h-4 w-4", p.stock_quantity === 0 ? "text-danger" : "text-warning")} /> {p.name}
                  </span>
                  <span className={cn("font-mono", p.stock_quantity === 0 ? "text-danger" : "text-warning")}>{p.stock_quantity === 0 ? "esgotado" : `${p.stock_quantity} un`}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Kpi({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className={cn("rounded-2xl border p-4 sm:p-5", accent ? "border-brand/30 bg-brand/[0.05]" : "border-border bg-surface")}>
      <p className="text-xs text-foreground-muted">{label}</p>
      <p className="mt-2 truncate font-mono text-xl font-medium tabular-nums sm:text-2xl">{value}</p>
      {hint ? <p className="mt-1 truncate text-[11px] text-foreground-subtle">{hint}</p> : null}
    </div>
  );
}
