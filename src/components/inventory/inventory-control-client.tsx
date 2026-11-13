"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Boxes, Check, History, Loader2, Minus, Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { FormMessage } from "@/components/settings/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import type { ActionResult } from "@/features/auth/actions";
import { adjustProductStockAction, getProductStockHistoryAction } from "@/features/inventory/actions";
import { MOVEMENT_LABEL, byUrgency, isBelowMinimum, levelBar, previewAdjustment, stockLevel, type AdjustMode, type StockLevel } from "@/lib/inventory/levels";
import { useStoreRealtime } from "@/lib/supabase/use-store-realtime";
import { cn, formatCurrencyCents } from "@/lib/utils";
import type { Category, Product, StockMovement } from "@/types/domain.types";

export interface InventoryActions {
  adjust: (payload: { storeId: string; productId: string; movementType: AdjustMode; quantity: number; reason?: string }) => Promise<ActionResult>;
  history: (storeId: string, productId: string) => Promise<ActionResult<StockMovement[]>>;
}

const serverActions: InventoryActions = { adjust: adjustProductStockAction, history: getProductStockHistoryAction };

type Filter = "ALL" | "BELOW" | "OUT";

const LEVEL_TONE: Record<StockLevel, { bar: string; text: string; label: string }> = {
  out: { bar: "bg-danger", text: "text-danger", label: "Esgotado" },
  low: { bar: "bg-warning", text: "text-warning", label: "Abaixo do mínimo" },
  ok: { bar: "bg-success", text: "text-foreground", label: "Em dia" },
  untracked: { bar: "bg-transparent", text: "text-foreground-subtle", label: "Sem controle" },
};

const when = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/**
 * Stock: what needs buying first, a level bar per product, quick entry/exit
 * and the movement history of each product.
 */
export function InventoryControlClient({
  storeId,
  categories,
  products: initialProducts,
  movements,
  actions = serverActions,
}: {
  storeId: string;
  categories: Category[];
  products: Product[];
  movements: StockMovement[];
  actions?: InventoryActions;
}) {
  const router = useRouter();
  useStoreRealtime(storeId, ["products", "stock_movements"], "inventory");
  const [products, setProducts] = useState(initialProducts);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [adjusting, setAdjusting] = useState<{ product: Product; mode: AdjustMode } | null>(null);
  const [historyOf, setHistoryOf] = useState<Product | null>(null);

  // Server rows win when their content changes (orders deduct stock in real time).
  const signature = useMemo(() => JSON.stringify(initialProducts.map((p) => [p.id, p.stock_quantity, p.low_stock_threshold, p.track_stock, p.name])), [initialProducts]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setProducts(initialProducts), [signature]);

  const categoryName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const tracked = products.filter((p) => p.track_stock);
  const below = tracked.filter(isBelowMinimum);
  const out = tracked.filter((p) => stockLevel(p) === "out");
  const valueCents = tracked.reduce((sum, p) => sum + p.price_cents * p.stock_quantity, 0);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products
      .filter((p) => {
        if (filter === "BELOW" && !isBelowMinimum(p)) return false;
        if (filter === "OUT" && stockLevel(p) !== "out") return false;
        if (!q) return true;
        return p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q);
      })
      .sort(byUrgency);
  }, [products, query, filter]);

  function onAdjusted(product: Product, next: number) {
    setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, stock_quantity: next, track_stock: true } : p)));
    setAdjusting(null);
    router.refresh();
  }

  if (products.length === 0) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <PageHeader title="Estoque" description="A quantidade de cada produto, o que está acabando e todas as entradas e saídas." />
        <EmptyState icon={<Boxes className="h-5 w-5" />} title="Nenhum produto ainda" description="Cadastre os produtos no Cardápio e ligue “Controlar estoque” nos que você quer acompanhar." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Estoque" description="Pedidos confirmados baixam sozinhos. Aqui você lança compras, perdas e a contagem." />

      <section aria-label="Resumo do estoque" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Produtos controlados" value={String(tracked.length)} hint={`de ${products.length} no cardápio`} />
        <Stat label="Abaixo do mínimo" value={String(below.length)} tone={below.length ? "warning" : undefined} onClick={() => setFilter("BELOW")} />
        <Stat label="Esgotados" value={String(out.length)} tone={out.length ? "danger" : undefined} onClick={() => setFilter("OUT")} />
        <Stat label="Valor em estoque" value={formatCurrencyCents(valueCents)} hint="a preço de venda" />
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-subtle" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome ou código"
            aria-label="Buscar produto no estoque"
            className="h-11 w-full rounded-xl border border-border bg-surface pl-9 pr-3 text-sm placeholder:text-foreground-subtle focus-visible:border-brand/60 focus-visible:outline-none"
          />
        </div>
        <Segmented
          name="Filtrar estoque"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "ALL", label: "Todos" },
            { value: "BELOW", label: "Abaixo do mínimo" },
            { value: "OUT", label: "Esgotados" },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Check className="h-5 w-5" />}
          title={filter === "ALL" ? "Nenhum produto encontrado" : "Nada por aqui"}
          description={filter === "BELOW" ? "Nenhum produto abaixo do mínimo. Tudo abastecido." : filter === "OUT" ? "Nenhum produto esgotado." : "Ajuste a busca."}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface/50">
          <table className="w-full text-sm">
            <caption className="sr-only">Produtos e quantidades em estoque</caption>
            <thead className="hidden border-b border-border text-left text-xs text-foreground-muted md:table-header-group">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Produto</th>
                <th scope="col" className="w-[30%] px-4 py-3 font-medium">Nível</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Em estoque</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Mínimo</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Ajuste rápido</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((p) => {
                const level = stockLevel(p);
                const tone = LEVEL_TONE[level];
                const bar = levelBar(p);
                return (
                  <tr key={p.id} className="flex flex-col gap-3 p-4 md:table-row md:p-0">
                    <td className="md:px-4 md:py-3.5">
                      <button
                        type="button"
                        onClick={() => setHistoryOf(p)}
                        aria-label={`Ver histórico de ${p.name}`}
                        className="group flex w-full items-start justify-between gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium group-hover:underline group-hover:underline-offset-4">{p.name}</span>
                          <span className="mt-0.5 block truncate text-xs text-foreground-muted">
                            {p.category_id ? (categoryName.get(p.category_id) ?? "Sem categoria") : "Sem categoria"}
                            {p.sku ? <span className="font-mono"> · {p.sku}</span> : null}
                          </span>
                        </span>
                        <span className={cn("shrink-0 font-mono text-sm md:hidden", tone.text)}>{p.track_stock ? `${p.stock_quantity} un` : "—"}</span>
                      </button>
                    </td>
                    <td className="md:px-4 md:py-3.5">
                      {p.track_stock ? (
                        <div className="flex items-center gap-3">
                          <div
                            role="meter"
                            aria-label={`Nível de ${p.name}`}
                            aria-valuemin={0}
                            aria-valuemax={Math.max(p.low_stock_threshold * 3, p.stock_quantity, 1)}
                            aria-valuenow={p.stock_quantity}
                            aria-valuetext={`${p.stock_quantity} em estoque, mínimo ${p.low_stock_threshold}: ${tone.label}`}
                            className="relative h-2 flex-1 rounded-full bg-white/[0.07]"
                          >
                            <div className={cn("h-full rounded-full transition-[width] duration-slow ease-out-expo", tone.bar)} style={{ width: `${bar.fill}%` }} />
                            {bar.marker !== null ? <span aria-hidden className="absolute -top-1 h-4 w-px bg-foreground-muted" style={{ left: `${bar.marker}%` }} /> : null}
                          </div>
                          <span className={cn("w-[7.5rem] shrink-0 text-xs", level === "ok" ? "text-foreground-muted" : tone.text)}>{tone.label}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-foreground-subtle">Sem controle de estoque</span>
                      )}
                    </td>
                    <td className={cn("hidden px-4 py-3.5 text-right font-mono md:table-cell", tone.text)}>{p.track_stock ? p.stock_quantity : "—"}</td>
                    <td className="hidden px-4 py-3.5 text-right font-mono text-foreground-muted md:table-cell">{p.track_stock ? p.low_stock_threshold : "—"}</td>
                    <td className="md:px-4 md:py-3.5">
                      {p.track_stock ? (
                        <div className="flex gap-2 md:justify-end">
                          <Button variant="secondary" size="sm" className="flex-1 md:flex-none" onClick={() => setAdjusting({ product: p, mode: "EXIT" })} aria-label={`Saída de ${p.name}`} disabled={p.stock_quantity <= 0}>
                            <Minus className="h-3.5 w-3.5" /> Saída
                          </Button>
                          <Button variant="secondary" size="sm" className="flex-1 md:flex-none" onClick={() => setAdjusting({ product: p, mode: "ENTRY" })} aria-label={`Entrada de ${p.name}`}>
                            <Plus className="h-3.5 w-3.5" /> Entrada
                          </Button>
                        </div>
                      ) : (
                        <div className="flex md:justify-end">
                          <Button variant="ghost" size="sm" onClick={() => setAdjusting({ product: p, mode: "ADJUSTMENT" })} aria-label={`Começar a controlar ${p.name}`}>
                            Controlar
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <section aria-labelledby="recent-movements" className="rounded-2xl border border-border bg-surface/50 p-5">
        <h2 id="recent-movements" className="flex items-center gap-2 font-display text-base font-bold">
          <History className="h-4 w-4 text-foreground-muted" /> Últimas movimentações
        </h2>
        {movements.length === 0 ? (
          <p className="mt-4 text-sm text-foreground-muted">Ainda não há movimentações. Elas aparecem aqui a cada pedido, compra ou ajuste.</p>
        ) : (
          <MovementList movements={movements.slice(0, 12)} productName={(m) => m.product?.name ?? products.find((p) => p.id === m.product_id)?.name ?? "Produto removido"} />
        )}
      </section>

      {adjusting ? <AdjustDialog key={`${adjusting.product.id}-${adjusting.mode}`} storeId={storeId} product={adjusting.product} initialMode={adjusting.mode} adjust={actions.adjust} onClose={() => setAdjusting(null)} onDone={onAdjusted} /> : null}

      {historyOf ? (
        <HistorySheet
          storeId={storeId}
          product={products.find((p) => p.id === historyOf.id) ?? historyOf}
          loadHistory={actions.history}
          onClose={() => setHistoryOf(null)}
          onAdjust={(mode) => {
            const product = products.find((p) => p.id === historyOf.id) ?? historyOf;
            setHistoryOf(null);
            setAdjusting({ product, mode });
          }}
        />
      ) : null}
    </div>
  );
}

function Stat({ label, value, hint, tone, onClick }: { label: string; value: string; hint?: string; tone?: "warning" | "danger"; onClick?: () => void }) {
  const body = (
    <>
      <span className="block text-xs text-foreground-muted">{label}</span>
      <span className={cn("mt-2 block truncate font-mono text-xl font-medium tabular-nums sm:text-2xl", tone === "warning" && "text-warning", tone === "danger" && "text-danger")}>{value}</span>
      {hint ? <span className="mt-1 block truncate text-[11px] text-foreground-subtle">{hint}</span> : null}
    </>
  );
  const className = cn("rounded-2xl border bg-surface p-4 text-left sm:p-5", tone === "warning" ? "border-warning/30" : tone === "danger" ? "border-danger/30" : "border-border");
  return onClick ? (
    <button type="button" onClick={onClick} className={cn(className, "transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50")}>
      {body}
    </button>
  ) : (
    <div className={className}>{body}</div>
  );
}

function MovementList({ movements, productName }: { movements: StockMovement[]; productName?: (m: StockMovement) => string }) {
  return (
    <ul className="mt-3 divide-y divide-border">
      {movements.map((m) => (
        <li key={m.id} className="flex items-center gap-3 py-3 text-sm">
          <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full", m.quantity_delta > 0 ? "bg-success/15 text-success" : "bg-danger/15 text-danger")}>
            {m.quantity_delta > 0 ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate">
              {productName ? <span className="font-medium">{productName(m)} · </span> : null}
              <span className={productName ? "text-foreground-muted" : "font-medium"}>{MOVEMENT_LABEL[m.movement_type]}</span>
            </span>
            <span className="block truncate text-xs text-foreground-subtle">
              {when(m.created_at)}
              {m.reason ? ` · ${m.reason}` : ""}
            </span>
          </span>
          <span className="shrink-0 text-right font-mono">
            <span className={m.quantity_delta > 0 ? "text-success" : "text-danger"}>
              {m.quantity_delta > 0 ? "+" : "−"}
              {Math.abs(m.quantity_delta)}
            </span>
            <span className="block text-xs text-foreground-subtle">ficou {m.new_quantity}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

const MODE_COPY: Record<AdjustMode, { title: string; field: string; submit: string; reasons: string[] }> = {
  ENTRY: { title: "Entrada", field: "Quantidade que entrou", submit: "Lançar entrada", reasons: ["Compra", "Produção do dia", "Devolução"] },
  EXIT: { title: "Saída", field: "Quantidade que saiu", submit: "Lançar saída", reasons: ["Quebra", "Vencimento", "Consumo interno"] },
  ADJUSTMENT: { title: "Contagem", field: "Quantidade contada", submit: "Salvar contagem", reasons: ["Contagem do fechamento", "Inventário"] },
};

function AdjustDialog({
  storeId,
  product,
  initialMode,
  adjust,
  onClose,
  onDone,
}: {
  storeId: string;
  product: Product;
  initialMode: AdjustMode;
  adjust: InventoryActions["adjust"];
  onClose: () => void;
  onDone: (product: Product, next: number) => void;
}) {
  const current = product.track_stock ? product.stock_quantity : 0;
  const [mode, setMode] = useState<AdjustMode>(initialMode);
  const [text, setText] = useState(initialMode === "ADJUSTMENT" ? String(current) : "1");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const copy = MODE_COPY[mode];
  const quantity = text.trim() === "" ? NaN : Number(text);
  const preview = previewAdjustment(current, mode, quantity);
  const unchanged = !preview.error && preview.next === current && product.track_stock;

  function changeMode(next: AdjustMode) {
    setMode(next);
    setError(null);
    setText(next === "ADJUSTMENT" ? String(current) : "1");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (preview.error) return setError(preview.error);
    setError(null);
    start(async () => {
      const res = await adjust({ storeId, productId: product.id, movementType: mode, quantity, reason: reason.trim() || undefined });
      if (!res.success) return setError(res.error ?? "Não foi possível lançar.");
      toast.success(`${product.name}: ${current} → ${preview.next} un`);
      onDone(product, preview.next);
    });
  }

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{product.name}</DialogTitle>
          <DialogDescription>{product.track_stock ? `Em estoque agora: ${current} un.` : "Este produto ainda não tem controle. Informe a quantidade atual para começar."}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <Segmented
            name="Tipo de lançamento"
            value={mode}
            onChange={changeMode}
            options={[
              { value: "ENTRY", label: "Entrada", disabled: !product.track_stock },
              { value: "EXIT", label: "Saída", disabled: !product.track_stock || current <= 0 },
              { value: "ADJUSTMENT", label: "Contagem" },
            ]}
          />
          <div className="space-y-1.5">
            <Label htmlFor="adjust-quantity">{copy.field}</Label>
            <Input id="adjust-quantity" type="number" min={0} step={1} inputMode="numeric" className="h-12 font-mono text-lg" value={text} onChange={(e) => setText(e.target.value)} autoFocus />
            {mode !== "ADJUSTMENT" ? (
              <div className="flex flex-wrap gap-1.5 pt-1" aria-label="Somar à quantidade">
                {[1, 5, 10, 50].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setText(String((Number.isFinite(quantity) ? quantity : 0) + n))}
                    className="rounded-full border border-border px-3 py-1 font-mono text-xs text-foreground-muted transition-colors hover:border-border-strong hover:text-foreground"
                  >
                    +{n}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adjust-reason">Motivo (opcional)</Label>
            <Input id="adjust-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={240} placeholder={copy.reasons[0]} />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {copy.reasons.map((r) => (
                <button key={r} type="button" onClick={() => setReason(r)} className="rounded-full border border-border px-3 py-1 text-xs text-foreground-muted transition-colors hover:border-border-strong hover:text-foreground">
                  {r}
                </button>
              ))}
            </div>
          </div>

          <p className="rounded-xl border border-border bg-surface-card px-4 py-3 text-sm" aria-live="polite">
            {preview.error ? (
              <span className="text-foreground-muted">{preview.error}</span>
            ) : (
              <>
                Vai ficar com <span className="font-mono font-semibold text-foreground">{preview.next} un</span>
                <span className="text-foreground-muted"> (hoje {current}).</span>
              </>
            )}
          </p>
          <FormMessage error={error} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || unchanged}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {copy.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function HistorySheet({
  storeId,
  product,
  loadHistory,
  onClose,
  onAdjust,
}: {
  storeId: string;
  product: Product;
  loadHistory: InventoryActions["history"];
  onClose: () => void;
  onAdjust: (mode: AdjustMode) => void;
}) {
  const [state, setState] = useState<{ status: "loading" } | { status: "error"; error: string } | { status: "ready"; movements: StockMovement[] }>({ status: "loading" });
  const level = stockLevel(product);
  const tone = LEVEL_TONE[level];

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    loadHistory(storeId, product.id).then((res) => {
      if (cancelled) return;
      setState(res.success ? { status: "ready", movements: res.data ?? [] } : { status: "error", error: res.error ?? "Não foi possível carregar o histórico." });
    });
    return () => {
      cancelled = true;
    };
  }, [loadHistory, storeId, product.id, product.stock_quantity]);

  return (
    <Sheet open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <SheetContent className="p-0" aria-describedby="stock-history-description">
        <div className="border-b border-border px-6 py-5 pr-14">
          <SheetTitle className="font-display text-xl font-bold">{product.name}</SheetTitle>
          <SheetDescription id="stock-history-description" className="mt-1 text-sm text-foreground-muted">
            Histórico de entradas e saídas.
          </SheetDescription>
          <div className="mt-4 flex items-end justify-between gap-4">
            <p>
              <span className={cn("font-mono text-3xl font-medium", tone.text)}>{product.track_stock ? product.stock_quantity : "—"}</span>
              <span className="ml-1.5 text-sm text-foreground-muted">{product.track_stock ? `un · mínimo ${product.low_stock_threshold}` : "sem controle"}</span>
            </p>
            {product.track_stock ? (
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => onAdjust("EXIT")} disabled={product.stock_quantity <= 0}>
                  <Minus className="h-3.5 w-3.5" /> Saída
                </Button>
                <Button variant="secondary" size="sm" onClick={() => onAdjust("ENTRY")}>
                  <Plus className="h-3.5 w-3.5" /> Entrada
                </Button>
              </div>
            ) : null}
          </div>
          <button type="button" onClick={() => onAdjust("ADJUSTMENT")} className="mt-3 text-xs text-foreground-muted underline underline-offset-4 hover:text-foreground">
            {product.track_stock ? "Corrigir pela contagem" : "Começar a controlar"}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-2">
          {state.status === "loading" ? (
            <p role="status" className="flex items-center gap-2 py-8 text-sm text-foreground-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando histórico…
            </p>
          ) : state.status === "error" ? (
            <p role="alert" className="py-8 text-sm text-danger">
              {state.error}
            </p>
          ) : state.movements.length === 0 ? (
            <p className="py-8 text-sm text-foreground-muted">Nenhuma movimentação registrada para este produto.</p>
          ) : (
            <MovementList movements={state.movements} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
