"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Loader2, MessageCircle, Phone, Search, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Segmented } from "@/components/ui/segmented";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { ActionResult } from "@/features/auth/actions";
import { getCustomerOrdersAction } from "@/features/customers/actions";
import { averageTicketCents, customerSummary, daysAgoLabel, filterCustomers, firstName, sortCustomers, type CustomerSort } from "@/lib/customers/list";
import { FULFILLMENT_LABEL, ORDER_STATUS_LABEL } from "@/lib/labels";
import { buildWhatsAppUrl, cn, formatCurrencyCents, formatPhoneBR } from "@/lib/utils";
import type { Customer, Order } from "@/types/domain.types";

type LoadOrders = (storeId: string, customerId: string) => Promise<ActionResult<Order[]>>;

const whatsappHref = (customer: Customer, storeName: string) => buildWhatsAppUrl(customer.phone, `Olá, ${firstName(customer.name)}! Aqui é da ${storeName}.`);

/**
 * Customers: everyone who ordered, searchable and sortable, with the order
 * history and a WhatsApp shortcut in a side panel.
 */
export function CustomersClient({
  storeId,
  storeName,
  customers,
  loadOrders = getCustomerOrdersAction,
}: {
  storeId: string;
  storeName: string;
  customers: Customer[];
  loadOrders?: LoadOrders;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<CustomerSort>("recent");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const summary = useMemo(() => customerSummary(customers), [customers]);
  const rows = useMemo(() => sortCustomers(filterCustomers(customers, query), sort), [customers, query, sort]);
  const selected = customers.find((c) => c.id === selectedId) ?? null;

  if (customers.length === 0) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <PageHeader title="Clientes" description={`Quem pede em ${storeName}, com histórico e contato.`} />
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title="Seus clientes aparecem aqui"
          description="A cada pedido, pelo cardápio ou pelo balcão, o cliente é salvo com nome, telefone e histórico. Não precisa cadastrar ninguém."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Clientes" description={`Quem pede em ${storeName}. O cadastro é automático, a cada pedido.`} />

      <section aria-label="Resumo dos clientes" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Clientes" value={String(summary.total)} />
        <Stat label="Voltaram a pedir" value={String(summary.returning)} hint="2 pedidos ou mais" />
        <Stat label="Total já pedido" value={formatCurrencyCents(summary.spentCents)} className="col-span-2 lg:col-span-1" />
      </section>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative lg:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-subtle" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome ou telefone"
            aria-label="Buscar cliente"
            className="h-11 w-full rounded-xl border border-border bg-surface pl-9 pr-3 text-sm placeholder:text-foreground-subtle focus-visible:border-brand/60 focus-visible:outline-none"
          />
        </div>
        <Segmented
          name="Ordenar clientes"
          value={sort}
          onChange={setSort}
          options={[
            { value: "recent", label: "Recentes" },
            { value: "spent", label: "Mais gastou" },
            { value: "orders", label: "Mais pedidos" },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState title="Nenhum cliente encontrado" description="Confira o nome ou tente só os últimos dígitos do telefone." />
      ) : (
        <ul aria-label="Clientes" className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface/50">
          <li aria-hidden className="hidden grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))_5.5rem] gap-4 px-4 py-3 text-xs text-foreground-muted md:grid">
            <span>Cliente</span>
            <span className="text-right">Pedidos</span>
            <span className="text-right">Total gasto</span>
            <span className="text-right">Último pedido</span>
            <span />
          </li>
          {rows.map((c) => (
            <li key={c.id} className="flex items-center gap-2 pr-3 transition-colors hover:bg-surface-card/50">
              <button
                type="button"
                onClick={() => setSelectedId(c.id)}
                aria-label={`Ver ${c.name}`}
                className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/50 md:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{c.name}</span>
                  <span className="block truncate font-mono text-xs text-foreground-muted">{formatPhoneBR(c.phone)}</span>
                </span>
                <span className="text-right font-mono text-sm md:hidden">{formatCurrencyCents(c.total_spent_cents)}</span>
                <span className="col-span-2 text-xs text-foreground-muted md:hidden">
                  {c.total_orders} {c.total_orders === 1 ? "pedido" : "pedidos"} · {daysAgoLabel(c.last_order_at)}
                </span>
                <span className="hidden text-right font-mono text-sm md:block">{c.total_orders}</span>
                <span className="hidden text-right font-mono text-sm md:block">{formatCurrencyCents(c.total_spent_cents)}</span>
                <span className="hidden text-right text-sm text-foreground-muted md:block">{daysAgoLabel(c.last_order_at)}</span>
              </button>
              <a
                href={whatsappHref(c, storeName)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Chamar ${c.name} no WhatsApp`}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-foreground-muted transition-colors hover:bg-surface-elevated hover:text-success focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
              >
                <MessageCircle className="h-4 w-4" />
              </a>
              <ChevronRight aria-hidden className="hidden h-4 w-4 shrink-0 text-foreground-subtle md:block" />
            </li>
          ))}
        </ul>
      )}

      {selected ? <CustomerSheet storeId={storeId} storeName={storeName} customer={selected} loadOrders={loadOrders} onClose={() => setSelectedId(null)} /> : null}
    </div>
  );
}

function Stat({ label, value, hint, className }: { label: string; value: string; hint?: string; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-border bg-surface p-4 sm:p-5", className)}>
      <p className="text-xs text-foreground-muted">{label}</p>
      <p className="mt-2 truncate font-mono text-xl font-medium tabular-nums sm:text-2xl">{value}</p>
      {hint ? <p className="mt-1 truncate text-[11px] text-foreground-subtle">{hint}</p> : null}
    </div>
  );
}

function CustomerSheet({ storeId, storeName, customer, loadOrders, onClose }: { storeId: string; storeName: string; customer: Customer; loadOrders: LoadOrders; onClose: () => void }) {
  const [state, setState] = useState<{ status: "loading" } | { status: "error"; error: string } | { status: "ready"; orders: Order[] }>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    loadOrders(storeId, customer.id).then((res) => {
      if (cancelled) return;
      setState(res.success ? { status: "ready", orders: res.data ?? [] } : { status: "error", error: res.error ?? "Não foi possível carregar os pedidos." });
    });
    return () => {
      cancelled = true;
    };
  }, [loadOrders, storeId, customer.id]);

  return (
    <Sheet open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <SheetContent className="p-0" aria-describedby="customer-sheet-description">
        <div className="border-b border-border px-6 py-5 pr-14">
          <SheetTitle className="font-display text-xl font-bold">{customer.name}</SheetTitle>
          <SheetDescription id="customer-sheet-description" className="mt-1 font-mono text-sm text-foreground-muted">
            {formatPhoneBR(customer.phone)}
          </SheetDescription>
          <div className="mt-4 flex gap-2">
            <Button asChild className="flex-1">
              <a href={whatsappHref(customer, storeName)} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-4 w-4" /> WhatsApp
              </a>
            </Button>
            <Button asChild variant="secondary">
              <a href={`tel:${customer.phone}`}>
                <Phone className="h-4 w-4" /> Ligar
              </a>
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <dl className="grid grid-cols-3 gap-2">
            {[
              ["Pedidos", String(customer.total_orders)],
              ["Total gasto", formatCurrencyCents(customer.total_spent_cents)],
              ["Ticket médio", formatCurrencyCents(averageTicketCents(customer))],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-border p-3">
                <dt className="text-[11px] text-foreground-muted">{label}</dt>
                <dd className="mt-1 truncate font-mono text-sm">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-foreground-subtle">
            Cliente desde {new Date(customer.created_at).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })} · último pedido {daysAgoLabel(customer.last_order_at)}
          </p>

          <h3 className="mt-7 font-display text-sm font-bold">Histórico de pedidos</h3>
          {state.status === "loading" ? (
            <p role="status" className="mt-4 flex items-center gap-2 text-sm text-foreground-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando pedidos…
            </p>
          ) : state.status === "error" ? (
            <p role="alert" className="mt-4 text-sm text-danger">
              {state.error}
            </p>
          ) : state.orders.length === 0 ? (
            <p className="mt-4 text-sm text-foreground-muted">Nenhum pedido registrado.</p>
          ) : (
            <ul aria-label="Pedidos do cliente" className="mt-2 divide-y divide-border">
              {state.orders.map((o) => (
                <li key={o.id} className="py-3.5 text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <span>
                      <span className="font-mono text-foreground-muted">#{o.order_number}</span>{" "}
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px]", o.status === "CANCELLED" ? "bg-danger/10 text-danger" : o.status === "COMPLETED" ? "bg-surface-card text-foreground-muted" : "bg-brand/15 text-brand")}>
                        {ORDER_STATUS_LABEL[o.status]}
                      </span>
                    </span>
                    <span className={cn("font-mono", o.status === "CANCELLED" && "text-foreground-subtle line-through")}>{formatCurrencyCents(o.total_cents)}</span>
                  </div>
                  <p className="mt-1 text-xs text-foreground-subtle">
                    {new Date(o.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })} · {FULFILLMENT_LABEL[o.fulfillment_type]}
                  </p>
                  {o.items?.length ? <p className="mt-1.5 text-[13px] text-foreground-muted">{o.items.map((i) => `${i.quantity}× ${i.product_name_snapshot}`).join(" · ")}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
