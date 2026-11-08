"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
  Flame,
  Loader2,
  Maximize2,
  MessageCircle,
  Minimize2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  buildWhatsAppUrl,
  formatCurrencyCents,
  formatElapsedMinutes,
  formatPhoneBR,
  parsePriceToCents,
} from "@/lib/utils";
import { useStoreRealtime } from "@/lib/supabase/use-store-realtime";
import {
  createOrderAction,
  transitionOrderStatusAction,
} from "@/features/orders/actions";
import type {
  FulfillmentType,
  Order,
  OrderStatus,
  Product,
} from "@/types/domain.types";

const KANBAN_COLUMNS: {
  status: OrderStatus;
  title: string;
  dotColor: string;
}[] = [
  { status: "NEW", title: "NOVOS", dotColor: "bg-brand" },
  { status: "CONFIRMED", title: "CONFIRMADOS", dotColor: "bg-sky-400" },
  { status: "PREPARING", title: "EM PREPARO", dotColor: "bg-amber-400" },
  { status: "READY", title: "PRONTOS", dotColor: "bg-emerald-400" },
];

const NEXT_STATUS_ACTION: Partial<
  Record<OrderStatus, { next: OrderStatus; label: string }>
> = {
  NEW: { next: "CONFIRMED", label: "Confirmar Pedido" },
  CONFIRMED: { next: "PREPARING", label: "Iniciar Preparo" },
  PREPARING: { next: "READY", label: "Marcar Pronto" },
  READY: { next: "COMPLETED", label: "Concluir Entrega" },
};

const FULFILLMENT_LABELS: Record<FulfillmentType, string> = {
  DINE_IN: "MESA",
  DELIVERY: "DELIVERY",
  PICKUP: "RETIRADA",
};

interface ManualOrderLine {
  productId: string;
  quantity: number;
  notes: string;
}

export function OrdersBoardClient({
  storeId,
  storeName,
  initialOrders,
  products,
}: {
  storeId: string;
  storeName: string;
  initialOrders: Order[];
  products: Product[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [viewMode, setViewMode] = useState<"BOARD" | "HISTORY">("BOARD");
  const [focusMode, setFocusMode] = useState(false);
  const [fulfillmentFilter, setFulfillmentFilter] = useState<
    "ALL" | FulfillmentType
  >("ALL");
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { connected: realtimeConnected } = useStoreRealtime(
    storeId,
    ["orders", "products"],
    "orders-board"
  );

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Manual Order Modal State
  const [manualModalOpen, setManualModalOpen] = useState(
    searchParams.get("new") === "1"
  );
  const [manualCustomerName, setManualCustomerName] = useState("");
  const [manualCustomerPhone, setManualCustomerPhone] = useState("");
  const [manualFulfillment, setManualFulfillment] =
    useState<FulfillmentType>("DINE_IN");
  const [manualTableRef, setManualTableRef] = useState("");
  const [manualInitialStatus, setManualInitialStatus] = useState<
    "CONFIRMED" | "NEW"
  >("CONFIRMED");
  const [manualDiscountStr, setManualDiscountStr] = useState("0,00");
  const [manualFeeStr, setManualFeeStr] = useState("0,00");
  const [manualNotes, setManualNotes] = useState("");
  const [manualLines, setManualLines] = useState<ManualOrderLine[]>([
    { productId: products[0]?.id ?? "", quantity: 1, notes: "" },
  ]);

  const [isPending, startTransition] = useTransition();

  const filteredOrders = useMemo(() => {
    return initialOrders.filter((o) => {
      const matchesFulfillment =
        fulfillmentFilter === "ALL" || o.fulfillment_type === fulfillmentFilter;

      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        String(o.order_number).includes(q) ||
        o.customer_name_snapshot.toLowerCase().includes(q) ||
        o.customer_phone_snapshot.toLowerCase().includes(q) ||
        (o.table_or_reference ?? "").toLowerCase().includes(q);

      const ageMins = (Date.now() - new Date(o.created_at).getTime()) / 60000;
      const matchesUrgent = !urgentOnly || ageMins >= 15;

      return matchesFulfillment && matchesSearch && matchesUrgent;
    });
  }, [initialOrders, fulfillmentFilter, searchQuery, urgentOnly]);

  function handleTransitionStatus(
    orderId: string,
    newStatus: OrderStatus,
    reason?: string
  ) {
    setActionError(null);
    startTransition(async () => {
      const res = await transitionOrderStatusAction({
        storeId,
        orderId,
        newStatus,
        reason,
      });

      if (!res.success) {
        setActionError(res.error ?? "Erro ao atualizar status do pedido.");
      } else {
        if (selectedOrder?.id === orderId) {
          setSelectedOrder((prev) =>
            prev ? { ...prev, status: newStatus } : null
          );
        }
        router.refresh();
      }
    });
  }

  function handleCreateManualOrder(e: React.FormEvent) {
    e.preventDefault();
    setActionError(null);

    const validLines = manualLines.filter(
      (l) => l.productId && l.quantity > 0
    );
    if (validLines.length === 0) {
      setActionError("Selecione pelo menos 1 produto válido.");
      return;
    }

    startTransition(async () => {
      const res = await createOrderAction({
        storeId,
        source: "MANUAL",
        fulfillmentType: manualFulfillment,
        customerName: manualCustomerName,
        customerPhone: manualCustomerPhone,
        tableOrReference: manualTableRef || undefined,
        notes: manualNotes || undefined,
        discountCents: parsePriceToCents(manualDiscountStr),
        feeCents: parsePriceToCents(manualFeeStr),
        initialStatus: manualInitialStatus,
        idempotencyKey: `man-${storeId}-${Date.now()}`,
        items: validLines.map((l) => ({
          product_id: l.productId,
          quantity: l.quantity,
          option_ids: [],
          notes: l.notes || undefined,
        })),
      });

      if (!res.success) {
        setActionError(res.error ?? "Falha ao registrar pedido manual.");
      } else {
        setManualModalOpen(false);
        setManualCustomerName("");
        setManualCustomerPhone("");
        setManualTableRef("");
        setManualNotes("");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* Header (collapses in Focus Mode like reference screenshot) */}
      {!focusMode && (
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-heading text-2xl font-bold text-foreground">
                Board por estágios
              </h1>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${
                  realtimeConnected
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                    : "border-border bg-surface text-foreground-muted"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    realtimeConnected ? "bg-emerald-400" : "bg-amber-400"
                  }`}
                />
                {realtimeConnected ? "Ao Vivo" : "Sincronizado"}
              </span>
            </div>
            <p className="text-xs text-foreground-muted">
              Acompanhamento operacional em tempo real dos pedidos de{" "}
              {storeName}.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => router.refresh()}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Atualizar</span>
            </Button>
            <Button size="sm" onClick={() => setManualModalOpen(true)}>
              <Plus className="h-4 w-4" />
              <span>Novo Pedido Manual</span>
            </Button>
          </div>
        </div>
      )}

      {/* Focus Mode Banner + Filter Bar (matching Monify POS reference UI) */}
      <div className="rounded-xl border border-border bg-surface-card p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { key: "ALL", label: "TODOS" },
                { key: "DINE_IN", label: "MESA" },
                { key: "DELIVERY", label: "DELIVERY" },
                { key: "PICKUP", label: "RETIRADA" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFulfillmentFilter(tab.key)}
                className={`rounded-lg px-3 py-1.5 text-[11px] font-bold tracking-wider transition-colors ${
                  fulfillmentFilter === tab.key
                    ? "bg-brand text-white"
                    : "bg-surface text-foreground-muted hover:text-foreground border border-border"
                }`}
              >
                {tab.label}
              </button>
            ))}

            <button
              type="button"
              onClick={() => setUrgentOnly(!urgentOnly)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold tracking-wider transition-colors ${
                urgentOnly
                  ? "border-amber-500/40 bg-amber-500/15 text-amber-400"
                  : "border-border bg-surface text-foreground-muted hover:text-foreground"
              }`}
            >
              <Flame className="h-3.5 w-3.5 text-brand" />
              <span>SÓ URGENTES (+15m)</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative w-48 sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-foreground-muted" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar #pedido, cliente, mesa..."
                className="h-8 w-full rounded-lg border border-border bg-surface pl-8 pr-3 text-xs text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>

            <button
              type="button"
              onClick={() =>
                setViewMode(viewMode === "BOARD" ? "HISTORY" : "BOARD")
              }
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground-muted hover:text-foreground"
            >
              {viewMode === "BOARD" ? "Histórico Completo" : "Voltar ao Board"}
            </button>

            <button
              type="button"
              onClick={() => setFocusMode(!focusMode)}
              title="Modo Foco da Operação"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground-muted hover:text-foreground"
            >
              {focusMode ? (
                <Minimize2 className="h-3.5 w-3.5 text-brand" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">Modo Foco</span>
            </button>
          </div>
        </div>
      </div>

      {actionError && (
        <div className="flex items-center justify-between rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
            <span>{actionError}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-red-300 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* VIEW 1: 4-Stage Operational Kanban Board */}
      {viewMode === "BOARD" ? (
        <div className="grid gap-4 lg:grid-cols-4">
          {KANBAN_COLUMNS.map((col) => {
            const colOrders = filteredOrders.filter(
              (o) => o.status === col.status
            );
            return (
              <div
                key={col.status}
                className="flex min-h-[540px] flex-col rounded-2xl border border-border bg-surface p-3"
              >
                {/* Column Header */}
                <div className="mb-3 flex items-center justify-between border-b border-border px-2 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full ${col.dotColor}`}
                    />
                    <h2 className="font-heading text-xs font-extrabold tracking-wider text-foreground">
                      {col.title}
                    </h2>
                  </div>
                  <span className="rounded-md bg-surface-card px-2 py-0.5 text-xs font-bold text-foreground-muted tabular-nums">
                    {colOrders.length}
                  </span>
                </div>

                {/* Cards Stack */}
                <div className="flex-1 space-y-3">
                  {colOrders.length === 0 ? (
                    <div className="flex h-44 items-center justify-center rounded-xl border border-dashed border-border/60 p-4 text-center text-xs text-foreground-muted">
                      Sem pedidos
                    </div>
                  ) : (
                    colOrders.map((order) => {
                      const nextTransition = NEXT_STATUS_ACTION[order.status];
                      const elapsed = formatElapsedMinutes(order.created_at);
                      const isConfirmedCard = order.status === "CONFIRMED";

                      return (
                        <div
                          key={order.id}
                          className={`rounded-xl border p-3.5 transition-all ${
                            isConfirmedCard
                              ? "border-emerald-500/30 bg-surface-card"
                              : order.status === "NEW"
                              ? "border-brand/40 bg-surface-card"
                              : "border-border bg-surface-card"
                          }`}
                        >
                          {/* Card Top Header */}
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-xs font-extrabold text-brand tabular-nums">
                                  #{order.order_number}
                                </span>
                                <span className="font-heading text-sm font-bold text-foreground">
                                  {order.customer_name_snapshot}
                                </span>
                              </div>
                              <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-foreground-muted">
                                {FULFILLMENT_LABELS[order.fulfillment_type]}
                                {order.table_or_reference
                                  ? ` • ${order.table_or_reference}`
                                  : ""}{" "}
                                •{" "}
                                {order.source === "DIGITAL_MENU"
                                  ? "CARDÁPIO"
                                  : "MANUAL"}
                              </p>
                            </div>

                            <Badge
                              variant="secondary"
                              className="tabular-nums text-[10px]"
                            >
                              <Clock className="mr-1 h-2.5 w-2.5" />
                              {elapsed}
                            </Badge>
                          </div>

                          {/* Order Items Snapshot List */}
                          <div className="mt-3 space-y-1.5 border-t border-border/70 pt-2.5 text-xs">
                            {(order.items ?? []).map((item) => (
                              <div key={item.id} className="text-foreground">
                                <div className="flex items-start justify-between gap-2">
                                  <span className="font-medium">
                                    <strong className="text-brand tabular-nums">
                                      {item.quantity}x
                                    </strong>{" "}
                                    {item.product_name_snapshot}
                                  </span>
                                </div>
                                {item.options && item.options.length > 0 && (
                                  <p className="pl-4 text-[11px] text-foreground-muted">
                                    +{" "}
                                    {item.options
                                      .map((o) => o.option_name_snapshot)
                                      .join(", ")}
                                  </p>
                                )}
                                {item.notes && (
                                  <p className="pl-4 text-[11px] italic text-amber-400">
                                    Obs: {item.notes}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>

                          {/* Card Footer Actions */}
                          <div className="mt-3 flex items-center justify-between border-t border-border/70 pt-2.5">
                            <span className="font-heading text-xs font-extrabold text-foreground tabular-nums">
                              {formatCurrencyCents(order.total_cents)}
                            </span>

                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setSelectedOrder(order)}
                                className="rounded-lg border border-border bg-surface p-1.5 text-foreground-muted hover:text-foreground"
                                title="Ver detalhes e histórico"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>

                              {nextTransition && (
                                <Button
                                  size="sm"
                                  disabled={isPending}
                                  onClick={() =>
                                    handleTransitionStatus(
                                      order.id,
                                      nextTransition.next
                                    )
                                  }
                                  className="h-7 px-2.5 text-[11px]"
                                >
                                  {nextTransition.label}
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* VIEW 2: Full Order History Table (Including COMPLETED & CANCELLED) */
        <div className="overflow-hidden rounded-xl border border-border bg-surface-card">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-surface text-[11px] uppercase tracking-wider text-foreground-muted">
                  <th className="px-4 py-3.5 font-semibold">#</th>
                  <th className="px-4 py-3.5 font-semibold">Cliente</th>
                  <th className="px-4 py-3.5 font-semibold">Modalidade</th>
                  <th className="px-4 py-3.5 font-semibold">Origem</th>
                  <th className="px-4 py-3.5 font-semibold">Estoque</th>
                  <th className="px-4 py-3.5 font-semibold">Total</th>
                  <th className="px-4 py-3.5 font-semibold">Status</th>
                  <th className="px-4 py-3.5 text-right font-semibold">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-surface/60">
                    <td className="px-4 py-3 font-mono font-bold text-brand tabular-nums">
                      #{order.order_number}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-foreground">
                        {order.customer_name_snapshot}
                      </p>
                      <p className="text-[11px] text-foreground-muted tabular-nums">
                        {formatPhoneBR(order.customer_phone_snapshot)}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-foreground-muted">
                      {FULFILLMENT_LABELS[order.fulfillment_type]}
                      {order.table_or_reference
                        ? ` (${order.table_or_reference})`
                        : ""}
                    </td>
                    <td className="px-4 py-3 text-foreground-muted">
                      {order.source === "DIGITAL_MENU" ? "Cardápio" : "Manual"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={order.stock_deducted ? "success" : "secondary"}
                      >
                        {order.stock_deducted ? "Deduzido" : "Não deduzido"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-bold text-foreground tabular-nums">
                      {formatCurrencyCents(order.total_cents)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="default">{order.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setSelectedOrder(order)}
                      >
                        Detalhes
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Order Details & Status / Cancellation Drawer */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/75 backdrop-blur-sm">
          <div className="flex h-full w-full max-w-lg flex-col border-l border-border bg-surface-card p-6 shadow-2xl overflow-y-auto">
            <div className="flex items-start justify-between border-b border-border pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-lg font-extrabold text-brand tabular-nums">
                    #{selectedOrder.order_number}
                  </span>
                  <Badge>{selectedOrder.status}</Badge>
                </div>
                <p className="mt-1 text-xs text-foreground-muted">
                  Criado em{" "}
                  {new Date(selectedOrder.created_at).toLocaleString("pt-BR")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="text-foreground-muted hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Customer Card + WhatsApp Action */}
            <div className="mt-4 rounded-xl border border-border bg-surface p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-bold text-foreground">
                    {selectedOrder.customer_name_snapshot}
                  </p>
                  <p className="text-xs text-foreground-muted tabular-nums">
                    {formatPhoneBR(selectedOrder.customer_phone_snapshot)}
                  </p>
                  {selectedOrder.table_or_reference && (
                    <p className="mt-1 text-xs text-brand">
                      {FULFILLMENT_LABELS[selectedOrder.fulfillment_type]}:{" "}
                      {selectedOrder.table_or_reference}
                    </p>
                  )}
                </div>

                <Button variant="secondary" size="sm" asChild>
                  <a
                    href={buildWhatsAppUrl(
                      selectedOrder.customer_phone_snapshot,
                      `Olá ${selectedOrder.customer_name_snapshot}! Aqui é da ${storeName} sobre o seu pedido #${selectedOrder.order_number}.`
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle className="h-4 w-4 text-emerald-400" />
                    <span>WhatsApp</span>
                  </a>
                </Button>
              </div>
            </div>

            {/* Order Items Snapshot */}
            <div className="mt-4 space-y-2">
              <h3 className="font-heading text-xs font-bold uppercase tracking-wider text-foreground-muted">
                Itens do Pedido (Snapshot Histórico)
              </h3>
              <div className="divide-y divide-border rounded-xl border border-border bg-surface">
                {(selectedOrder.items ?? []).map((item) => (
                  <div key={item.id} className="p-3.5 text-xs">
                    <div className="flex items-center justify-between font-semibold text-foreground">
                      <span>
                        {item.quantity}x {item.product_name_snapshot}
                      </span>
                      <span className="tabular-nums">
                        {formatCurrencyCents(item.total_item_cents)}
                      </span>
                    </div>
                    {item.options && item.options.length > 0 && (
                      <ul className="mt-1 space-y-0.5 pl-3 text-[11px] text-foreground-muted">
                        {item.options.map((opt) => (
                          <li key={opt.id}>
                            + {opt.group_name_snapshot}:{" "}
                            {opt.option_name_snapshot} (
                            {formatCurrencyCents(opt.price_cents)})
                          </li>
                        ))}
                      </ul>
                    )}
                    {item.notes && (
                      <p className="mt-1 text-[11px] italic text-amber-400">
                        Nota: {item.notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Financial Summary */}
            <div className="mt-4 space-y-1.5 rounded-xl border border-border bg-surface p-4 text-xs">
              <div className="flex justify-between text-foreground-muted">
                <span>Subtotal</span>
                <span className="tabular-nums">
                  {formatCurrencyCents(selectedOrder.subtotal_cents)}
                </span>
              </div>
              {selectedOrder.discount_cents > 0 && (
                <div className="flex justify-between text-emerald-400">
                  <span>Desconto</span>
                  <span className="tabular-nums">
                    - {formatCurrencyCents(selectedOrder.discount_cents)}
                  </span>
                </div>
              )}
              {selectedOrder.fee_cents > 0 && (
                <div className="flex justify-between text-foreground-muted">
                  <span>Taxa de Entrega / Serviço</span>
                  <span className="tabular-nums">
                    + {formatCurrencyCents(selectedOrder.fee_cents)}
                  </span>
                </div>
              )}
              <div className="flex justify-between border-t border-border pt-2 font-heading text-sm font-extrabold text-foreground">
                <span>Total</span>
                <span className="text-brand tabular-nums">
                  {formatCurrencyCents(selectedOrder.total_cents)}
                </span>
              </div>
            </div>

            {/* Status Controls */}
            {selectedOrder.status !== "CANCELLED" &&
              selectedOrder.status !== "COMPLETED" && (
                <div className="mt-6 space-y-3 border-t border-border pt-4">
                  <p className="text-xs font-semibold text-foreground">
                    Alterar Estágio do Pedido
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { status: "CONFIRMED", label: "Confirmar (Baixa Estoque)" },
                        { status: "PREPARING", label: "Em Preparo" },
                        { status: "READY", label: "Pronto" },
                        { status: "COMPLETED", label: "Concluir Pedido" },
                      ] as const
                    ).map((btn) => (
                      <Button
                        key={btn.status}
                        variant={
                          selectedOrder.status === btn.status
                            ? "default"
                            : "secondary"
                        }
                        size="sm"
                        disabled={
                          isPending || selectedOrder.status === btn.status
                        }
                        onClick={() =>
                          handleTransitionStatus(selectedOrder.id, btn.status)
                        }
                      >
                        {btn.label}
                      </Button>
                    ))}
                  </div>

                  <Button
                    variant="destructive"
                    size="sm"
                    className="w-full"
                    disabled={isPending}
                    onClick={() => {
                      if (
                        confirm(
                          "Deseja cancelar este pedido? Se o estoque já tiver sido baixado, ele será estornado automaticamente."
                        )
                      ) {
                        handleTransitionStatus(
                          selectedOrder.id,
                          "CANCELLED",
                          "Cancelado pelo operador no painel"
                        );
                      }
                    }}
                  >
                    Cancelar Pedido (Estorna Estoque se Confirmado)
                  </Button>
                </div>
              )}

            {/* Status History Timeline */}
            {selectedOrder.status_history &&
              selectedOrder.status_history.length > 0 && (
                <div className="mt-6 border-t border-border pt-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-foreground-muted">
                    Histórico de Status
                  </h4>
                  <div className="mt-3 space-y-2">
                    {selectedOrder.status_history.map((h) => (
                      <div
                        key={h.id}
                        className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-[11px]"
                      >
                        <div>
                          <span className="font-semibold text-foreground">
                            {h.from_status ? `${h.from_status} → ` : ""}
                            {h.to_status}
                          </span>
                          {h.reason && (
                            <p className="text-foreground-muted">{h.reason}</p>
                          )}
                        </div>
                        <span className="text-foreground-muted tabular-nums">
                          {new Date(h.created_at).toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
          </div>
        </div>
      )}

      {/* Manual Order Registration Modal */}
      {manualModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm">
          <div className="my-8 w-full max-w-2xl rounded-2xl border border-border bg-surface-card p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <h2 className="font-heading text-lg font-bold text-foreground">
                  Registrar Pedido Manual (Balcão / Mesa / Telefone)
                </h2>
                <p className="text-xs text-foreground-muted">
                  O preço é calculado automaticamente pelo servidor a partir do
                  catálogo atual.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setManualModalOpen(false)}
                className="text-foreground-muted hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateManualOrder} className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-foreground">
                    Nome do Cliente
                  </label>
                  <Input
                    value={manualCustomerName}
                    onChange={(e) => setManualCustomerName(e.target.value)}
                    placeholder="Ex: Clarissa Mendes"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-foreground">
                    WhatsApp / Telefone
                  </label>
                  <Input
                    value={manualCustomerPhone}
                    onChange={(e) => setManualCustomerPhone(e.target.value)}
                    placeholder="(11) 99999-9999"
                    required
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-foreground">
                    Modalidade
                  </label>
                  <select
                    value={manualFulfillment}
                    onChange={(e) =>
                      setManualFulfillment(e.target.value as FulfillmentType)
                    }
                    className="flex h-10 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
                  >
                    <option value="DINE_IN">Mesa / Salão</option>
                    <option value="PICKUP">Retirada no Balcão</option>
                    <option value="DELIVERY">Delivery</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-foreground">
                    Mesa ou Referência
                  </label>
                  <Input
                    value={manualTableRef}
                    onChange={(e) => setManualTableRef(e.target.value)}
                    placeholder="Ex: MESA 5"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-foreground">
                    Status Inicial
                  </label>
                  <select
                    value={manualInitialStatus}
                    onChange={(e) =>
                      setManualInitialStatus(
                        e.target.value as "CONFIRMED" | "NEW"
                      )
                    }
                    className="flex h-10 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
                  >
                    <option value="CONFIRMED">
                      Confirmado (Deduz Estoque)
                    </option>
                    <option value="NEW">Novo (Aguardar Confirmação)</option>
                  </select>
                </div>
              </div>

              {/* Order Lines */}
              <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">
                    Itens do Pedido
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      setManualLines((prev) => [
                        ...prev,
                        {
                          productId: products[0]?.id ?? "",
                          quantity: 1,
                          notes: "",
                        },
                      ])
                    }
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Adicionar Item</span>
                  </Button>
                </div>

                {manualLines.map((line, idx) => (
                  <div
                    key={idx}
                    className="grid gap-2 sm:grid-cols-12 items-center"
                  >
                    <select
                      value={line.productId}
                      onChange={(e) => {
                        const next = [...manualLines];
                        next[idx].productId = e.target.value;
                        setManualLines(next);
                      }}
                      className="h-9 rounded-lg border border-border bg-surface-card px-2.5 text-xs text-foreground sm:col-span-6"
                    >
                      <option value="">Selecione um produto...</option>
                      {products.map((p) => (
                        <option
                          key={p.id}
                          value={p.id}
                          disabled={
                            !p.is_available ||
                            (p.track_stock && p.stock_quantity === 0)
                          }
                        >
                          {p.name} — {formatCurrencyCents(p.price_cents)} (Est:{" "}
                          {p.track_stock ? p.stock_quantity : "Livre"})
                        </option>
                      ))}
                    </select>

                    <Input
                      type="number"
                      min={1}
                      value={line.quantity}
                      onChange={(e) => {
                        const next = [...manualLines];
                        next[idx].quantity = Number(e.target.value);
                        setManualLines(next);
                      }}
                      className="h-9 text-xs tabular-nums sm:col-span-2"
                    />

                    <Input
                      value={line.notes}
                      onChange={(e) => {
                        const next = [...manualLines];
                        next[idx].notes = e.target.value;
                        setManualLines(next);
                      }}
                      placeholder="Observação"
                      className="h-9 text-xs sm:col-span-3"
                    />

                    <button
                      type="button"
                      onClick={() =>
                        setManualLines(manualLines.filter((_, i) => i !== idx))
                      }
                      className="justify-self-end text-foreground-muted hover:text-red-400 sm:col-span-1"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-foreground">
                    Desconto (R$)
                  </label>
                  <Input
                    value={manualDiscountStr}
                    onChange={(e) => setManualDiscountStr(e.target.value)}
                    className="tabular-nums"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-foreground">
                    Taxa de Entrega / Serviço (R$)
                  </label>
                  <Input
                    value={manualFeeStr}
                    onChange={(e) => setManualFeeStr(e.target.value)}
                    className="tabular-nums"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setManualModalOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Lançar Pedido</span>
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

