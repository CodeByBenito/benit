"use client";

import { useMemo, useState, useTransition } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  History,
  Loader2,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatCurrencyCents } from "@/lib/utils";
import { useStoreRealtime } from "@/lib/supabase/use-store-realtime";
import { adjustProductStockAction } from "@/features/inventory/actions";
import type {
  Category,
  Product,
  StockMovement,
  StockMovementType,
} from "@/types/domain.types";

const MOVEMENT_LABELS: Record<
  StockMovementType,
  { label: string; variant: "success" | "danger" | "warning" | "info" | "secondary" }
> = {
  INITIAL: { label: "Saldo Inicial", variant: "secondary" },
  ENTRY: { label: "Entrada Manual", variant: "success" },
  EXIT: { label: "Saída Manual", variant: "danger" },
  ADJUSTMENT: { label: "Balanço / Ajuste", variant: "info" },
  ORDER_DEDUCTION: { label: "Baixa de Pedido", variant: "warning" },
  ORDER_REVERSAL: { label: "Estorno Cancelamento", variant: "success" },
};

export function InventoryControlClient({
  storeId,
  categories,
  products,
  movements,
}: {
  storeId: string;
  categories: Category[];
  products: Product[];
  movements: StockMovement[];
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    products[0]?.id ?? null
  );

  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [movementType, setMovementType] = useState<
    "ENTRY" | "EXIT" | "ADJUSTMENT"
  >("ENTRY");
  const [quantity, setQuantity] = useState(10);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();
  useStoreRealtime(storeId, ["products", "stock_movements"], "inventory-center");

  const trackedProducts = useMemo(
    () => products.filter((p) => p.track_stock),
    [products]
  );

  const inventoryValueCents = useMemo(
    () =>
      trackedProducts.reduce(
        (sum, p) => sum + p.price_cents * p.stock_quantity,
        0
      ),
    [trackedProducts]
  );

  const lowStockQueue = useMemo(
    () =>
      trackedProducts.filter(
        (p) => p.stock_quantity > 0 && p.stock_quantity <= p.low_stock_threshold
      ),
    [trackedProducts]
  );

  const outOfStockQueue = useMemo(
    () => trackedProducts.filter((p) => p.stock_quantity === 0),
    [trackedProducts]
  );

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q)
    );
  }, [products, searchQuery]);

  const selectedProduct = useMemo(
    () =>
      products.find((p) => p.id === selectedProductId) ?? products[0] ?? null,
    [products, selectedProductId]
  );

  function openAdjustmentModal(
    product: Product,
    defaultType: "ENTRY" | "EXIT" | "ADJUSTMENT" = "ENTRY"
  ) {
    setSelectedProductId(product.id);
    setMovementType(defaultType);
    setQuantity(defaultType === "ADJUSTMENT" ? product.stock_quantity : 10);
    setReason("");
    setError(null);
    setAdjustModalOpen(true);
  }

  function handleSaveAdjustment(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedProduct) return;
    setError(null);

    startTransition(async () => {
      const res = await adjustProductStockAction({
        storeId,
        productId: selectedProduct.id,
        movementType,
        quantity,
        reason,
      });

      if (!res.success) {
        setError(res.error ?? "Erro ao ajustar estoque.");
      } else {
        setAdjustModalOpen(false);
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">
            Central de Controle de Estoque
          </h1>
          <p className="text-xs text-foreground-muted">
            Monitore movimentações, reponha produtos críticos e audite entradas
            e baixas automáticas de pedidos.
          </p>
        </div>

        {selectedProduct && (
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => openAdjustmentModal(selectedProduct, "EXIT")}
            >
              <ArrowDownRight className="h-4 w-4 text-red-400" />
              <span>Registrar Saída</span>
            </Button>
            <Button
              size="sm"
              onClick={() => openAdjustmentModal(selectedProduct, "ENTRY")}
            >
              <Plus className="h-4 w-4" />
              <span>Nova Entrada de Estoque</span>
            </Button>
          </div>
        )}
      </div>

      {/* 4 Top KPI Summary Cards (Matching Inventory Control Center reference UI) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-surface-card p-5">
          <span className="text-xs font-medium text-foreground-muted">
            Valor Estimado em Estoque
          </span>
          <p className="mt-2 font-heading text-2xl font-extrabold text-foreground tabular-nums">
            {formatCurrencyCents(inventoryValueCents)}
          </p>
          <p className="mt-1 text-[11px] text-emerald-400">
            Baseado no preço de venda atual
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface-card p-5">
          <span className="text-xs font-medium text-foreground-muted">
            SKUs Monitorados
          </span>
          <p className="mt-2 font-heading text-2xl font-extrabold text-foreground tabular-nums">
            {String(trackedProducts.length).padStart(2, "0")}
          </p>
          <p className="mt-1 text-[11px] text-foreground-muted">
            De {products.length} produtos cadastrados
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface-card p-5">
          <span className="text-xs font-medium text-foreground-muted">
            Fila de Estoque Baixo
          </span>
          <p className="mt-2 font-heading text-2xl font-extrabold text-amber-400 tabular-nums">
            {String(lowStockQueue.length).padStart(2, "0")}
          </p>
          <p className="mt-1 text-[11px] text-amber-400/80">
            Abaixo ou igual ao limite mínimo
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface-card p-5">
          <span className="text-xs font-medium text-foreground-muted">
            Produtos Esgotados
          </span>
          <p className="mt-2 font-heading text-2xl font-extrabold text-red-400 tabular-nums">
            {String(outOfStockQueue.length).padStart(2, "0")}
          </p>
          <p className="mt-1 text-[11px] text-red-400/80">
            Bloqueados automaticamente no cardápio
          </p>
        </div>
      </div>

      {/* Main Split Grid: Low Stock Watchlist + Registry (Left 2/3) & Selected Item Inspector (Right 1/3) */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Low Stock Watchlist */}
          <div className="rounded-xl border border-border bg-surface-card p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-heading text-base font-bold text-foreground">
                  Watchlist de Estoque Baixo
                </h2>
                <p className="text-xs text-foreground-muted">
                  Priorize a reposição dos itens próximos de esgotar
                </p>
              </div>
              <Badge variant="warning" className="tabular-nums">
                {lowStockQueue.length + outOfStockQueue.length} item(ns) em
                atenção
              </Badge>
            </div>

            {lowStockQueue.length === 0 && outOfStockQueue.length === 0 ? (
              <div className="mt-4 rounded-xl border border-border bg-surface p-6 text-center">
                <Boxes className="mx-auto h-7 w-7 text-emerald-400" />
                <p className="mt-2 text-xs font-semibold text-foreground">
                  Todos os produtos estão com saldo acima do mínimo!
                </p>
              </div>
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[...outOfStockQueue, ...lowStockQueue]
                  .slice(0, 4)
                  .map((item) => {
                    const isCritical = item.stock_quantity === 0;
                    return (
                      <div
                        key={item.id}
                        onClick={() => setSelectedProductId(item.id)}
                        className="cursor-pointer rounded-xl border border-border bg-surface p-4 transition-colors hover:border-brand/50"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-heading text-sm font-bold text-foreground">
                              {item.name}
                            </p>
                            <p className="text-[11px] font-mono text-foreground-muted">
                              {item.sku || "SEM-SKU"} • Mín:{" "}
                              {item.low_stock_threshold} un.
                            </p>
                          </div>
                          <AlertTriangle
                            className={`h-4 w-4 ${
                              isCritical ? "text-red-400" : "text-brand"
                            }`}
                          />
                        </div>
                        <div className="mt-4 flex items-center justify-between">
                          <Badge variant={isCritical ? "danger" : "warning"}>
                            {isCritical ? "Esgotado" : "Repor em breve"}
                          </Badge>
                          <span className="text-xs font-bold text-foreground tabular-nums">
                            {item.stock_quantity} un. restantes
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* Searchable Inventory Registry Table */}
          <div className="rounded-xl border border-border bg-surface-card p-6">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h2 className="font-heading text-base font-bold text-foreground">
                  Registro Geral de Estoque
                </h2>
                <p className="text-xs text-foreground-muted">
                  Clique em qualquer item para inspecionar ou lançar entradas e
                  saídas
                </p>
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-foreground-muted" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar produto ou SKU..."
                  className="h-9 pl-9 text-xs"
                />
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-[11px] uppercase tracking-wider text-foreground-muted">
                    <th className="pb-3 font-semibold">Item</th>
                    <th className="pb-3 font-semibold">Categoria</th>
                    <th className="pb-3 font-semibold">Unidades</th>
                    <th className="pb-3 font-semibold">Ponto Mínimo</th>
                    <th className="pb-3 font-semibold">Status</th>
                    <th className="pb-3 text-right font-semibold">Ajustar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredProducts.map((item) => {
                    const catName =
                      categories.find((c) => c.id === item.category_id)?.name ??
                      "Geral";
                    const isOut = item.track_stock && item.stock_quantity === 0;
                    const isLow =
                      item.track_stock &&
                      item.stock_quantity > 0 &&
                      item.stock_quantity <= item.low_stock_threshold;
                    const isSelected = selectedProduct?.id === item.id;

                    return (
                      <tr
                        key={item.id}
                        onClick={() => setSelectedProductId(item.id)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-brand/10"
                            : "hover:bg-surface/60"
                        }`}
                      >
                        <td className="py-3 font-semibold text-foreground">
                          {item.name}
                          <span className="block font-mono text-[10px] font-normal text-foreground-muted">
                            {item.sku || "—"}
                          </span>
                        </td>
                        <td className="py-3 text-foreground-muted">{catName}</td>
                        <td className="py-3 font-bold text-foreground tabular-nums">
                          {item.track_stock ? item.stock_quantity : "Livre"}
                        </td>
                        <td className="py-3 text-foreground-muted tabular-nums">
                          {item.track_stock ? item.low_stock_threshold : "—"}
                        </td>
                        <td className="py-3">
                          {!item.track_stock ? (
                            <Badge variant="secondary">Sem controle</Badge>
                          ) : isOut ? (
                            <Badge variant="danger">Crítico (0)</Badge>
                          ) : isLow ? (
                            <Badge variant="warning">Atenção</Badge>
                          ) : (
                            <Badge variant="success">Saudável</Badge>
                          )}
                        </td>
                        <td className="py-3 text-right">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              openAdjustmentModal(item, "ENTRY");
                            }}
                          >
                            <SlidersHorizontal className="h-3.5 w-3.5" />
                            <span>Movimentar</span>
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column: Selected Item Inspector Panel */}
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-surface-card p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-base font-bold text-foreground">
                Item Selecionado
              </h2>
              {selectedProduct && (
                <Badge variant="default">
                  {selectedProduct.sku || "ATIVO"}
                </Badge>
              )}
            </div>
            <p className="text-xs text-foreground-muted">
              Inspecione a cobertura de estoque e histórico do produto
            </p>

            {selectedProduct ? (
              <div className="mt-5 space-y-5">
                <div className="rounded-xl border border-border bg-surface p-4">
                  <h3 className="font-heading text-base font-bold text-foreground">
                    {selectedProduct.name}
                  </h3>
                  <p className="mt-0.5 text-xs text-foreground-muted">
                    Preço unitário:{" "}
                    <strong className="text-foreground tabular-nums">
                      {formatCurrencyCents(selectedProduct.price_cents)}
                    </strong>
                  </p>

                  {/* Stock Coverage Progress Bar */}
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-foreground-muted">
                        Cobertura de estoque
                      </span>
                      <span className="font-bold text-brand tabular-nums">
                        {selectedProduct.stock_quantity} un. disponíveis
                      </span>
                    </div>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-card">
                      <div
                        className={`h-full rounded-full transition-all ${
                          selectedProduct.stock_quantity === 0
                            ? "bg-red-500"
                            : selectedProduct.stock_quantity <=
                              selectedProduct.low_stock_threshold
                            ? "bg-brand"
                            : "bg-emerald-400"
                        }`}
                        style={{
                          width: `${Math.min(
                            100,
                            Math.round(
                              (selectedProduct.stock_quantity /
                                Math.max(
                                  1,
                                  selectedProduct.low_stock_threshold * 3
                                )) *
                                100
                            )
                          )}%`,
                        }}
                      />
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 pt-2 text-xs">
                      <div className="rounded-lg border border-border bg-surface-card p-2.5">
                        <span className="text-[10px] text-foreground-muted">
                          Saldo Atual
                        </span>
                        <p className="font-heading text-base font-extrabold text-foreground tabular-nums">
                          {selectedProduct.stock_quantity}
                        </p>
                      </div>
                      <div className="rounded-lg border border-border bg-surface-card p-2.5">
                        <span className="text-[10px] text-foreground-muted">
                          Ponto de Reposição
                        </span>
                        <p className="font-heading text-base font-extrabold text-foreground tabular-nums">
                          {selectedProduct.low_stock_threshold}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <Button
                    size="sm"
                    onClick={() => openAdjustmentModal(selectedProduct, "ENTRY")}
                  >
                    <ArrowUpRight className="h-3.5 w-3.5" />
                    <span>Entrada</span>
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => openAdjustmentModal(selectedProduct, "EXIT")}
                  >
                    <ArrowDownRight className="h-3.5 w-3.5 text-red-400" />
                    <span>Saída</span>
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      openAdjustmentModal(selectedProduct, "ADJUSTMENT")
                    }
                  >
                    <span>Balanço</span>
                  </Button>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-xs text-foreground-muted">
                Selecione um produto na tabela ao lado.
              </p>
            )}
          </div>

          {/* Recent Stock Movements Ledger */}
          <div className="rounded-xl border border-border bg-surface-card p-6">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-brand" />
              <h2 className="font-heading text-base font-bold text-foreground">
                Últimas Movimentações
              </h2>
            </div>
            <p className="mt-0.5 text-xs text-foreground-muted">
              Histórico auditável de entradas, saídas, baixas e estornos
            </p>

            <div className="mt-4 space-y-2.5 max-h-96 overflow-y-auto pr-1">
              {movements.length === 0 ? (
                <p className="py-6 text-center text-xs text-foreground-muted">
                  Nenhuma movimentação registrada ainda.
                </p>
              ) : (
                movements.map((mov) => {
                  const meta = MOVEMENT_LABELS[mov.movement_type];
                  const prodName =
                    products.find((p) => p.id === mov.product_id)?.name ??
                    "Produto";
                  return (
                    <div
                      key={mov.id}
                      className="rounded-lg border border-border bg-surface p-3 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-foreground">
                          {prodName}
                        </span>
                        <span
                          className={`font-mono font-extrabold tabular-nums ${
                            mov.quantity_delta > 0
                              ? "text-emerald-400"
                              : "text-red-400"
                          }`}
                        >
                          {mov.quantity_delta > 0
                            ? `+${mov.quantity_delta}`
                            : mov.quantity_delta}{" "}
                          un.
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-foreground-muted">
                        <Badge variant={meta.variant} className="text-[10px]">
                          {meta.label}
                        </Badge>
                        <span className="tabular-nums">
                          {mov.previous_quantity} → {mov.new_quantity} un.
                        </span>
                      </div>
                      {mov.reason && (
                        <p className="mt-1.5 text-[11px] text-foreground-muted">
                          {mov.reason}
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stock Adjustment Modal */}
      {adjustModalOpen && selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface-card p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <h2 className="font-heading text-lg font-bold text-foreground">
                  Movimentar Estoque
                </h2>
                <p className="text-xs text-brand">{selectedProduct.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setAdjustModalOpen(false)}
                className="text-foreground-muted hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAdjustment} className="mt-4 space-y-4">
              {error && (
                <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { key: "ENTRY", label: "Entrada (+)" },
                    { key: "EXIT", label: "Saída (-)" },
                    { key: "ADJUSTMENT", label: "Definir Saldo" },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setMovementType(t.key)}
                    className={`rounded-lg border py-2 text-xs font-semibold transition-colors ${
                      movementType === t.key
                        ? "border-brand bg-brand/15 text-brand"
                        : "border-border bg-surface text-foreground-muted"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-foreground">
                  {movementType === "ADJUSTMENT"
                    ? "Novo Saldo Total em Estoque"
                    : "Quantidade de Unidades"}
                </label>
                <Input
                  type="number"
                  min={movementType === "ADJUSTMENT" ? 0 : 1}
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  required
                  className="tabular-nums font-bold"
                />
                <p className="text-[11px] text-foreground-muted tabular-nums">
                  Saldo atual: {selectedProduct.stock_quantity} un.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-foreground">
                  Motivo / Observação (Rastreabilidade)
                </label>
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ex: Reposição fornecedor, perda na cozinha, contagem física"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setAdjustModalOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Confirmar Movimentação"
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

