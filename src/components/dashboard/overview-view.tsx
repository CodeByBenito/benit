import Link from "next/link";
import { AlertTriangle, ArrowUpRight, Check, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { compactCurrency, type Overview } from "@/lib/dashboard/overview";
import { FULFILLMENT_LABEL, ORDER_STATUS_LABEL } from "@/lib/labels";
import { cn, formatCurrencyCents } from "@/lib/utils";

/**
 * Overview screen. Presentational: every number comes from `buildOverview`,
 * so the page (real data) and the /dev preview (fixtures) render the same thing.
 */
export function OverviewView({
  overview,
  dateLabel,
  firstName,
  storeName,
  storeSlug,
  paymentIssue,
}: {
  overview: Overview;
  dateLabel: string;
  firstName: string;
  storeName: string;
  storeSlug: string;
  /** The store's Mercado Pago token could not be renewed: online payment is failing. */
  paymentIssue?: boolean;
}) {
  const { setup, days, queue } = overview;
  const pendingSetup = setup.filter((s) => !s.done);
  const max = Math.max(...days.map((d) => d.cents), 1);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        eyebrow={dateLabel}
        title={`${overview.greeting}, ${firstName}.`}
        description={`Como está ${storeName} agora.`}
        actions={
          <Button asChild>
            <Link href="/orders?new=1">
              <Plus className="h-4 w-4" /> Pedido no balcão
            </Link>
          </Button>
        }
      />

      {paymentIssue ? (
        <section role="alert" className="flex flex-col gap-3 rounded-2xl border border-danger/40 bg-danger/10 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
            <div>
              <h2 className="font-display font-bold">O pagamento online parou</h2>
              <p className="mt-1 text-sm text-foreground-muted">
                A conexão com o Mercado Pago expirou e não foi possível renovar. Pix e cartão online estão indisponíveis no cardápio até você reconectar a conta.
              </p>
            </div>
          </div>
          <Button asChild variant="secondary" className="shrink-0">
            <Link href="/settings?tab=payments">Reconectar agora</Link>
          </Button>
        </section>
      ) : null}

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

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Indicadores de hoje">
        <Kpi label="Faturamento hoje" value={formatCurrencyCents(overview.revenueCents)} hint="Sem cancelados" accent />
        <Kpi label="Pedidos hoje" value={String(overview.salesCount)} hint={overview.otherCount ? `+${overview.otherCount} cancelado${overview.otherCount > 1 ? "s" : ""} ou aguardando` : undefined} />
        <Kpi label="Ticket médio" value={formatCurrencyCents(overview.ticketCents)} />
        <Kpi label="Últimos 7 dias" value={formatCurrencyCents(overview.weekCents)} />
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <section className="surface-card p-5 sm:p-6" aria-labelledby="chart-title">
          <div className="flex items-center justify-between">
            <h2 id="chart-title" className="font-display font-bold">
              Faturamento por dia
            </h2>
            <span className="text-xs text-foreground-muted">7 dias · em R$</span>
          </div>
          <ol className="mt-6 flex h-52 items-end gap-2 sm:gap-3" aria-label="Faturamento dos últimos 7 dias">
            {days.map((d) => (
              <li key={d.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2" title={`${d.label}: ${formatCurrencyCents(d.cents)} em ${d.count} pedido${d.count === 1 ? "" : "s"}`}>
                <span className={cn("max-w-full truncate font-mono text-[10px]", d.today ? "text-foreground" : "text-foreground-subtle")}>
                  <span className="sr-only">
                    {d.label}: {formatCurrencyCents(d.cents)}
                  </span>
                  <span aria-hidden>{d.cents ? compactCurrency(d.cents) : "–"}</span>
                </span>
                <div aria-hidden className={cn("w-full rounded-t-lg", d.today ? "bg-brand" : "bg-white/[0.09]")} style={{ height: `${Math.max(2, (d.cents / max) * 100)}%` }} />
                <span aria-hidden className={cn("text-xs", d.today ? "font-medium text-foreground" : "text-foreground-muted")}>
                  {d.label}
                </span>
              </li>
            ))}
          </ol>
        </section>

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
          {overview.recent.length === 0 ? (
            <p className="mt-6 text-sm text-foreground-muted">
              Nenhum pedido nos últimos dias. Compartilhe o link <span className="break-all font-mono text-foreground">/menu/{storeSlug}</span> com seus clientes.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {overview.recent.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate">
                      <span className="font-mono text-foreground-muted">#{o.order_number}</span> {o.customer_name_snapshot}
                    </span>
                    <span className="block truncate text-xs text-foreground-subtle">
                      {FULFILLMENT_LABEL[o.fulfillment_type]} · {ORDER_STATUS_LABEL[o.status]}
                    </span>
                  </span>
                  <span className={cn("shrink-0 font-mono", o.status === "CANCELLED" && "text-foreground-subtle line-through")}>{formatCurrencyCents(o.total_cents)}</span>
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
          {overview.lowStock.length === 0 ? (
            <p className="mt-6 flex items-center gap-2 text-sm text-foreground-muted">
              <Check className="h-4 w-4 text-success" /> Tudo abastecido.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {overview.lowStock.slice(0, 6).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <AlertTriangle className={cn("h-4 w-4 shrink-0", p.stock_quantity === 0 ? "text-danger" : "text-warning")} /> <span className="truncate">{p.name}</span>
                  </span>
                  <span className={cn("shrink-0 font-mono", p.stock_quantity === 0 ? "text-danger" : "text-warning")}>{p.stock_quantity === 0 ? "esgotado" : `${p.stock_quantity} un`}</span>
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
