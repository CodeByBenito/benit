import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  ClipboardList,
  Clock,
  DollarSign,
  Plus,
  ShoppingBag,
  UtensilsCrossed,
} from "lucide-react";
import { requireTenantContext } from "@/lib/permissions/tenant";
import { createClient } from "@/lib/supabase/server";
import { formatCurrencyCents, formatElapsedMinutes } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Order, Product } from "@/types/domain.types";

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "warning" | "info" | "success" | "danger" | "secondary" }> = {
  NEW: { label: "Novo", variant: "default" },
  CONFIRMED: { label: "Confirmado", variant: "info" },
  PREPARING: { label: "Em preparo", variant: "warning" },
  READY: { label: "Pronto", variant: "success" },
  COMPLETED: { label: "Concluído", variant: "secondary" },
  CANCELLED: { label: "Cancelado", variant: "danger" },
};

export default async function DashboardPage() {
  const tenant = await requireTenantContext();
  const supabase = await createClient();

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const [{ data: ordersData }, { data: productsData }] = await Promise.all([
    supabase
      .from("orders")
      .select("*")
      .eq("store_id", tenant.store.id)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("products")
      .select("*")
      .eq("store_id", tenant.store.id)
      .eq("is_archived", false)
      .order("stock_quantity", { ascending: true }),
  ]);

  const orders = (ordersData ?? []) as Order[];
  const products = (productsData ?? []) as Product[];

  const totalOrders = orders.length;
  const newOrders = orders.filter((o) => o.status === "NEW").length;
  const inProgressOrders = orders.filter((o) =>
    ["CONFIRMED", "PREPARING", "READY"].includes(o.status)
  ).length;
  const completedOrders = orders.filter((o) => o.status === "COMPLETED").length;

  const validRevenueOrders = orders.filter((o) => o.status !== "CANCELLED");
  const totalRevenueCents = validRevenueOrders.reduce(
    (sum, o) => sum + o.total_cents,
    0
  );

  const lowStockProducts = products.filter(
    (p) => p.track_stock && p.stock_quantity > 0 && p.stock_quantity <= p.low_stock_threshold
  );
  const outOfStockProducts = products.filter(
    (p) => !p.is_available || (p.track_stock && p.stock_quantity === 0)
  );

  // Build last 7 days chart buckets from real orders
  const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const dailyBuckets = Array.from({ length: 7 }, (_, idx) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - idx));
    const dateKey = d.toISOString().slice(0, 10);
    const dayOrders = validRevenueOrders.filter(
      (o) => o.created_at.slice(0, 10) === dateKey
    );
    const revenueCents = dayOrders.reduce((acc, o) => acc + o.total_cents, 0);
    return {
      label: dayNames[d.getDay()],
      dateKey,
      revenueCents,
      ordersCount: dayOrders.length,
    };
  });

  const maxDailyRevenue = Math.max(
    ...dailyBuckets.map((b) => b.revenueCents),
    1000
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">
            Visão Operacional
          </h1>
          <p className="text-xs text-foreground-muted">
            Indicadores em tempo real da operação de{" "}
            <span className="font-medium text-foreground">
              {tenant.store.name}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button variant="secondary" size="sm" asChild>
            <Link href="/menu-manager">
              <UtensilsCrossed className="h-3.5 w-3.5" />
              <span>Gerenciar Cardápio</span>
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/orders?new=1">
              <Plus className="h-3.5 w-3.5" />
              <span>Novo Pedido Manual</span>
            </Link>
          </Button>
        </div>
      </div>

      {/* Onboarding Checklist Banner when store has 0 products */}
      {products.length === 0 && (
        <div className="rounded-xl border border-brand/40 bg-brand/10 p-5">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <Badge className="mb-2">Próximo Passo Recomendado</Badge>
              <h2 className="font-heading text-base font-bold text-foreground">
                Comece cadastrando suas categorias e produtos
              </h2>
              <p className="mt-1 text-xs text-foreground-muted">
                Sua loja já está configurada em{" "}
                <span className="font-mono text-brand">
                  /menu/{tenant.store.slug}
                </span>
                . Adicione produtos para liberar pedidos no cardápio digital e
                no balcão.
              </p>
            </div>
            <Button asChild>
              <Link href="/menu-manager">
                Cadastrar Primeiro Produto
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      )}

      {/* Top KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-surface-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-foreground-muted">
              Faturamento Bruto
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/15 text-brand">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 font-heading text-2xl font-extrabold tabular-nums text-foreground">
            {formatCurrencyCents(totalRevenueCents)}
          </p>
          <p className="mt-1 text-[11px] text-foreground-muted">
            {validRevenueOrders.length} pedidos válidos ({totalOrders} no total)
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-foreground-muted">
              Novos Pedidos
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/15 text-brand">
              <ShoppingBag className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 font-heading text-2xl font-extrabold tabular-nums text-brand">
            {newOrders}
          </p>
          <p className="mt-1 text-[11px] text-foreground-muted">
            Aguardando confirmação imediata
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-foreground-muted">
              Em Andamento
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 font-heading text-2xl font-extrabold tabular-nums text-foreground">
            {inProgressOrders}
          </p>
          <p className="mt-1 text-[11px] text-foreground-muted">
            Confirmados, em preparo ou prontos
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-foreground-muted">
              Pedidos Concluídos
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 font-heading text-2xl font-extrabold tabular-nums text-foreground">
            {completedOrders}
          </p>
          <p className="mt-1 text-[11px] text-foreground-muted">
            Entregues / finalizados com sucesso
          </p>
        </div>
      </div>

      {/* Revenue Chart + Stock Watchlist */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Revenue Overview Bar Chart (inspired by Levels reference UI) */}
        <div className="rounded-xl border border-border bg-surface-card p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-heading text-base font-bold text-foreground">
                Visão de Receita (Últimos 7 dias)
              </h2>
              <p className="text-xs text-foreground-muted">
                Desempenho diário de vendas confirmadas em tempo real
              </p>
            </div>
            <Badge variant="default" className="tabular-nums">
              {formatCurrencyCents(
                dailyBuckets.reduce((acc, b) => acc + b.revenueCents, 0)
              )}
            </Badge>
          </div>

          <div className="mt-8 grid h-48 grid-cols-7 items-end gap-3 border-b border-border pb-3">
            {dailyBuckets.map((bucket) => {
              const heightPercent = Math.max(
                8,
                Math.round((bucket.revenueCents / maxDailyRevenue) * 100)
              );
              const countPercent = Math.max(
                6,
                Math.min(100, bucket.ordersCount * 14)
              );
              return (
                <div
                  key={bucket.dateKey}
                  className="flex h-full flex-col items-center justify-end gap-2"
                >
                  <div className="flex h-full w-full items-end justify-center gap-1.5">
                    <div
                      title={`${bucket.label}: ${formatCurrencyCents(
                        bucket.revenueCents
                      )}`}
                      style={{ height: `${heightPercent}%` }}
                      className="w-4 rounded-t-md bg-brand transition-all sm:w-5"
                    />
                    <div
                      title={`${bucket.ordersCount} pedido(s)`}
                      style={{ height: `${countPercent}%` }}
                      className="w-3 rounded-t-md bg-brand/25 transition-all sm:w-4"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 grid grid-cols-7 text-center text-[11px] text-foreground-muted">
            {dailyBuckets.map((bucket) => (
              <div key={bucket.dateKey}>
                <p className="font-medium text-foreground">{bucket.label}</p>
                <p className="tabular-nums text-[10px]">
                  {bucket.ordersCount} ped.
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Low Stock & Unavailable Products Watchlist */}
        <div className="flex flex-col justify-between rounded-xl border border-border bg-surface-card p-6">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-base font-bold text-foreground">
                Alertas de Estoque
              </h2>
              <Badge
                variant={
                  lowStockProducts.length + outOfStockProducts.length > 0
                    ? "warning"
                    : "success"
                }
                className="tabular-nums"
              >
                {lowStockProducts.length + outOfStockProducts.length} alerta(s)
              </Badge>
            </div>
            <p className="mt-1 text-xs text-foreground-muted">
              Produtos com estoque crítico ou indisponíveis
            </p>

            <div className="mt-5 space-y-2.5">
              {lowStockProducts.length === 0 &&
              outOfStockProducts.length === 0 ? (
                <div className="rounded-lg border border-border bg-surface p-4 text-center">
                  <Boxes className="mx-auto h-6 w-6 text-emerald-400" />
                  <p className="mt-2 text-xs font-medium text-foreground">
                    Estoque saudável
                  </p>
                  <p className="mt-0.5 text-[11px] text-foreground-muted">
                    Nenhum produto abaixo do limite mínimo configurado.
                  </p>
                </div>
              ) : (
                [...outOfStockProducts, ...lowStockProducts]
                  .slice(0, 5)
                  .map((prod) => {
                    const isOut =
                      !prod.is_available ||
                      (prod.track_stock && prod.stock_quantity === 0);
                    return (
                      <div
                        key={prod.id}
                        className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-foreground">
                            {prod.name}
                          </p>
                          <p className="text-[11px] text-foreground-muted tabular-nums">
                            Saldo: {prod.stock_quantity} un. (Mín:{" "}
                            {prod.low_stock_threshold})
                          </p>
                        </div>
                        <Badge variant={isOut ? "danger" : "warning"}>
                          {isOut ? "Esgotado" : "Estoque Baixo"}
                        </Badge>
                      </div>
                    );
                  })
              )}
            </div>
          </div>

          <div className="mt-5 border-t border-border pt-4">
            <Button variant="secondary" size="sm" className="w-full" asChild>
              <Link href="/inventory">
                <AlertTriangle className="h-3.5 w-3.5 text-brand" />
                <span>Abrir Central de Estoque</span>
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Recent Operational Activity */}
      <div className="rounded-xl border border-border bg-surface-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-heading text-base font-bold text-foreground">
              Atividade Operacional Recente
            </h2>
            <p className="text-xs text-foreground-muted">
              Últimos pedidos recebidos pelo cardápio digital ou balcão
            </p>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/orders">
              Ver quadro de pedidos
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>

        {orders.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-border bg-surface p-8 text-center">
            <ClipboardList className="mx-auto h-8 w-8 text-foreground-muted" />
            <h3 className="mt-3 font-heading text-sm font-bold text-foreground">
              Nenhum pedido registrado ainda
            </h3>
            <p className="mx-auto mt-1 max-w-md text-xs text-foreground-muted">
              Assim que seus clientes enviarem pedidos pelo cardápio digital ou
              você lançar pedidos manualmente, eles aparecerão aqui em tempo
              real.
            </p>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wider text-foreground-muted">
                  <th className="pb-3 font-semibold">Pedido</th>
                  <th className="pb-3 font-semibold">Cliente</th>
                  <th className="pb-3 font-semibold">Origem</th>
                  <th className="pb-3 font-semibold">Status</th>
                  <th className="pb-3 font-semibold">Total</th>
                  <th className="pb-3 text-right font-semibold">Tempo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {orders.slice(0, 8).map((order) => {
                  const statusMeta = STATUS_LABELS[order.status] ?? {
                    label: order.status,
                    variant: "secondary" as const,
                  };
                  return (
                    <tr
                      key={order.id}
                      className="transition-colors hover:bg-surface/60"
                    >
                      <td className="py-3 font-mono font-bold text-foreground tabular-nums">
                        #{order.order_number}
                      </td>
                      <td className="py-3">
                        <p className="font-medium text-foreground">
                          {order.customer_name_snapshot}
                        </p>
                        <p className="text-[11px] text-foreground-muted tabular-nums">
                          {order.customer_phone_snapshot}
                        </p>
                      </td>
                      <td className="py-3 text-foreground-muted">
                        {order.source === "DIGITAL_MENU"
                          ? "Cardápio Digital"
                          : "Manual / Balcão"}
                      </td>
                      <td className="py-3">
                        <Badge variant={statusMeta.variant}>
                          {statusMeta.label}
                        </Badge>
                      </td>
                      <td className="py-3 font-semibold text-foreground tabular-nums">
                        {formatCurrencyCents(order.total_cents)}
                      </td>
                      <td className="py-3 text-right text-foreground-muted tabular-nums">
                        há {formatElapsedMinutes(order.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

