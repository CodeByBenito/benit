"use client";

import { useMemo, useState, useTransition } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Image as ImageIcon,
  Loader2,
  MapPin,
  Minus,
  Phone,
  Plus,
  ShoppingBag,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatCurrencyCents } from "@/lib/utils";
import {
  createOrderAction,
  type CreatedOrderReceipt,
} from "@/features/orders/actions";
import type { FulfillmentType } from "@/types/domain.types";

export interface PublicOptionItem {
  id: string;
  name: string;
  price_cents: number;
}

export interface PublicOptionGroup {
  id: string;
  name: string;
  min_select: number;
  max_select: number;
  is_required: boolean;
  options: PublicOptionItem[];
}

export interface PublicProduct {
  id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price_cents: number;
  image_url: string | null;
  is_available: boolean;
  in_stock: boolean;
  option_groups: PublicOptionGroup[];
}

export interface PublicCategory {
  id: string;
  name: string;
  description: string | null;
}

export interface PublicStoreInfo {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  is_open: boolean;
}

interface CartItem {
  cartItemId: string;
  product: PublicProduct;
  quantity: number;
  selectedOptions: PublicOptionItem[];
  notes: string;
}

export function PublicMenuClient({
  store,
  categories,
  products,
}: {
  store: PublicStoreInfo;
  categories: PublicCategory[];
  products: PublicProduct[];
}) {
  const [activeCategoryId, setActiveCategoryId] = useState<string>("ALL");
  const [selectedProduct, setSelectedProduct] = useState<PublicProduct | null>(
    null
  );
  const [modalQty, setModalQty] = useState(1);
  const [modalSelectedOptions, setModalSelectedOptions] = useState<
    Record<string, PublicOptionItem[]>
  >({});
  const [modalNotes, setModalNotes] = useState("");
  const [modalError, setModalError] = useState<string | null>(null);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);

  // Checkout Customer Fields
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [fulfillmentType, setFulfillmentType] =
    useState<FulfillmentType>("PICKUP");
  const [tableOrReference, setTableOrReference] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [confirmedReceipt, setConfirmedReceipt] =
    useState<CreatedOrderReceipt | null>(null);

  const [isPending, startTransition] = useTransition();

  const visibleProducts = useMemo(() => {
    if (activeCategoryId === "ALL") return products;
    return products.filter((p) => p.category_id === activeCategoryId);
  }, [products, activeCategoryId]);

  const cartTotalCents = useMemo(() => {
    return cart.reduce((acc, item) => {
      const optionsSum = item.selectedOptions.reduce(
        (s, o) => s + o.price_cents,
        0
      );
      return acc + (item.product.price_cents + optionsSum) * item.quantity;
    }, 0);
  }, [cart]);

  const cartCount = useMemo(
    () => cart.reduce((acc, item) => acc + item.quantity, 0),
    [cart]
  );

  function openProductConfigurator(product: PublicProduct) {
    if (!product.is_available || !product.in_stock) return;
    setSelectedProduct(product);
    setModalQty(1);
    setModalSelectedOptions({});
    setModalNotes("");
    setModalError(null);
  }

  function toggleOptionSelection(
    group: PublicOptionGroup,
    option: PublicOptionItem
  ) {
    const current = modalSelectedOptions[group.id] ?? [];
    const exists = current.some((o) => o.id === option.id);

    if (exists) {
      setModalSelectedOptions({
        ...modalSelectedOptions,
        [group.id]: current.filter((o) => o.id !== option.id),
      });
    } else {
      if (group.max_select === 1) {
        setModalSelectedOptions({
          ...modalSelectedOptions,
          [group.id]: [option],
        });
      } else if (current.length < group.max_select) {
        setModalSelectedOptions({
          ...modalSelectedOptions,
          [group.id]: [...current, option],
        });
      }
    }
  }

  function handleAddToCart() {
    if (!selectedProduct) return;

    // Validate required option groups
    for (const group of selectedProduct.option_groups) {
      const chosen = modalSelectedOptions[group.id] ?? [];
      if (group.is_required && chosen.length < Math.max(1, group.min_select)) {
        setModalError(
          `Selecione pelo menos ${Math.max(1, group.min_select)} opção em "${
            group.name
          }".`
        );
        return;
      }
    }

    const flatOptions = Object.values(modalSelectedOptions).flat();
    setCart((prev) => [
      ...prev,
      {
        cartItemId: `${selectedProduct.id}-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 6)}`,
        product: selectedProduct,
        quantity: modalQty,
        selectedOptions: flatOptions,
        notes: modalNotes.trim(),
      },
    ]);
    setSelectedProduct(null);
  }

  function handleSubmitOrder(e: React.FormEvent) {
    e.preventDefault();
    setCheckoutError(null);

    if (!store.is_open) {
      setCheckoutError(
        "O estabelecimento está fechado para novos pedidos neste momento."
      );
      return;
    }

    const idempotencyKey = `pub-${store.id}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    startTransition(async () => {
      const res = await createOrderAction({
        storeId: store.id,
        source: "DIGITAL_MENU",
        fulfillmentType,
        customerName,
        customerPhone,
        tableOrReference: tableOrReference || undefined,
        notes: orderNotes || undefined,
        idempotencyKey,
        items: cart.map((item) => ({
          product_id: item.product.id,
          quantity: item.quantity,
          option_ids: item.selectedOptions.map((o) => o.id),
          notes: item.notes || undefined,
        })),
      });

      if (!res.success || !res.data) {
        setCheckoutError(
          res.error ?? "Não foi possível enviar o pedido. Tente novamente."
        );
      } else {
        setConfirmedReceipt(res.data);
        setCart([]);
        setCartDrawerOpen(false);
      }
    });
  }

  return (
    <div className="min-h-screen bg-background pb-28 text-foreground">
      {/* Store Banner / Header */}
      <header className="border-b border-border bg-surface">
        {store.banner_url && (
          <div className="h-36 w-full overflow-hidden sm:h-48">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={store.banner_url}
              alt={store.name}
              className="h-full w-full object-cover opacity-80"
            />
          </div>
        )}
        <div className="mx-auto max-w-4xl px-4 py-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div className="flex items-start gap-4">
              {store.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={store.logo_url}
                  alt={store.name}
                  className="h-16 w-16 rounded-2xl border border-border object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-brand/30 bg-brand/15 font-heading text-2xl font-extrabold text-brand">
                  {store.name.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-heading text-2xl font-extrabold text-foreground">
                    {store.name}
                  </h1>
                  <Badge variant={store.is_open ? "success" : "danger"}>
                    {store.is_open ? "Aberto agora" : "Fechado no momento"}
                  </Badge>
                </div>
                {store.description && (
                  <p className="mt-1 text-xs leading-relaxed text-foreground-muted">
                    {store.description}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-4 text-[11px] text-foreground-muted">
                  {store.address && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 text-brand" />
                      {store.address}
                    </span>
                  )}
                  {store.phone && (
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <Phone className="h-3.5 w-3.5 text-brand" />
                      {store.phone}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sticky Category Bar */}
        <div className="sticky top-0 z-20 border-t border-border bg-surface/95 backdrop-blur">
          <div className="mx-auto flex max-w-4xl items-center gap-2 overflow-x-auto px-4 py-3">
            <button
              type="button"
              onClick={() => setActiveCategoryId("ALL")}
              className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                activeCategoryId === "ALL"
                  ? "bg-brand text-white"
                  : "bg-surface-card text-foreground-muted hover:text-foreground"
              }`}
            >
              Todos
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategoryId(cat.id)}
                className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                  activeCategoryId === cat.id
                    ? "bg-brand text-white"
                    : "bg-surface-card text-foreground-muted hover:text-foreground"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Main Catalog */}
      <main className="mx-auto max-w-4xl px-4 py-6">
        {/* Order Confirmation Banner */}
        {confirmedReceipt && (
          <div className="mb-8 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-400" />
                <div>
                  <h2 className="font-heading text-lg font-bold text-foreground">
                    Pedido #{confirmedReceipt.order_number} recebido com sucesso!
                  </h2>
                  <p className="mt-1 text-xs text-foreground-muted">
                    Seu pedido já está na tela de operação de{" "}
                    <span className="font-semibold text-foreground">
                      {store.name}
                    </span>{" "}
                    com valor total de{" "}
                    <span className="font-bold text-emerald-400 tabular-nums">
                      {formatCurrencyCents(confirmedReceipt.total_cents)}
                    </span>
                    .
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmedReceipt(null)}
              >
                Fechar
              </Button>
            </div>
          </div>
        )}

        {visibleProducts.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface-card p-12 text-center">
            <ShoppingBag className="mx-auto h-10 w-10 text-foreground-muted" />
            <h2 className="mt-3 font-heading text-base font-bold text-foreground">
              Nenhum produto disponível nesta categoria
            </h2>
            <p className="mt-1 text-xs text-foreground-muted">
              Selecione outra categoria acima ou volte em instantes.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {visibleProducts.map((product) => {
              const canOrder =
                store.is_open && product.is_available && product.in_stock;
              return (
                <div
                  key={product.id}
                  onClick={() => canOrder && openProductConfigurator(product)}
                  className={`flex justify-between gap-4 rounded-2xl border border-border bg-surface-card p-4 transition-all ${
                    canOrder
                      ? "cursor-pointer hover:border-brand/50"
                      : "opacity-60"
                  }`}
                >
                  <div className="flex flex-1 flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-heading text-sm font-bold text-foreground">
                          {product.name}
                        </h3>
                        {(!product.is_available || !product.in_stock) && (
                          <Badge variant="danger">Esgotado</Badge>
                        )}
                      </div>
                      {product.description && (
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-foreground-muted">
                          {product.description}
                        </p>
                      )}
                    </div>

                    <div className="mt-4 flex items-center justify-between">
                      <span className="font-heading text-base font-extrabold text-brand tabular-nums">
                        {formatCurrencyCents(product.price_cents)}
                      </span>
                      {canOrder && (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-brand/15 px-2.5 py-1 text-xs font-semibold text-brand">
                          <Plus className="h-3.5 w-3.5" />
                          Adicionar
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-surface">
                    {product.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="h-6 w-6 text-foreground-muted" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Floating Bottom Cart Bar */}
      {cart.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 p-4 backdrop-blur">
          <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
            <div>
              <p className="text-xs text-foreground-muted">
                {cartCount} {cartCount === 1 ? "item" : "itens"} na sacola
              </p>
              <p className="font-heading text-lg font-extrabold text-foreground tabular-nums">
                {formatCurrencyCents(cartTotalCents)}
              </p>
            </div>
            <Button size="lg" onClick={() => setCartDrawerOpen(true)}>
              <ShoppingBag className="h-4 w-4" />
              <span>Ver Sacola e Finalizar</span>
            </Button>
          </div>
        </div>
      )}

      {/* Product Configurator Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="w-full max-w-lg rounded-t-2xl border border-border bg-surface-card p-6 shadow-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
              <div>
                <h2 className="font-heading text-lg font-bold text-foreground">
                  {selectedProduct.name}
                </h2>
                <p className="mt-0.5 font-heading text-sm font-bold text-brand tabular-nums">
                  {formatCurrencyCents(selectedProduct.price_cents)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProduct(null)}
                className="text-foreground-muted hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {selectedProduct.description && (
              <p className="mt-3 text-xs leading-relaxed text-foreground-muted">
                {selectedProduct.description}
              </p>
            )}

            {modalError && (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            {/* Option Groups */}
            <div className="mt-4 space-y-4">
              {selectedProduct.option_groups.map((group) => {
                const chosen = modalSelectedOptions[group.id] ?? [];
                return (
                  <div
                    key={group.id}
                    className="rounded-xl border border-border bg-surface p-3.5"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold text-foreground">
                          {group.name}
                        </p>
                        <p className="text-[11px] text-foreground-muted">
                          Escolha até {group.max_select}
                        </p>
                      </div>
                      {group.is_required && (
                        <Badge variant="default">Obrigatório</Badge>
                      )}
                    </div>

                    <div className="mt-2.5 space-y-2">
                      {group.options.map((opt) => {
                        const isChecked = chosen.some((o) => o.id === opt.id);
                        return (
                          <label
                            key={opt.id}
                            onClick={() => toggleOptionSelection(group, opt)}
                            className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-xs transition-colors ${
                              isChecked
                                ? "border-brand bg-brand/15 text-foreground"
                                : "border-border bg-surface-card text-foreground-muted"
                            }`}
                          >
                            <span>{opt.name}</span>
                            <span className="font-semibold text-foreground tabular-nums">
                              {opt.price_cents > 0
                                ? `+ ${formatCurrencyCents(opt.price_cents)}`
                                : "Grátis"}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-foreground">
                  Observações do item (opcional)
                </label>
                <Input
                  value={modalNotes}
                  onChange={(e) => setModalNotes(e.target.value)}
                  placeholder="Ex: Sem cebola, maionese à parte"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between gap-4 border-t border-border pt-4">
              <div className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-1.5">
                <button
                  type="button"
                  onClick={() => setModalQty(Math.max(1, modalQty - 1))}
                  className="text-foreground-muted hover:text-foreground"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-6 text-center text-sm font-bold tabular-nums">
                  {modalQty}
                </span>
                <button
                  type="button"
                  onClick={() => setModalQty(modalQty + 1)}
                  className="text-foreground-muted hover:text-foreground"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              <Button className="flex-1" onClick={handleAddToCart}>
                Adicionar à Sacola •{" "}
                <span className="tabular-nums">
                  {formatCurrencyCents(
                    (selectedProduct.price_cents +
                      Object.values(modalSelectedOptions)
                        .flat()
                        .reduce((s, o) => s + o.price_cents, 0)) *
                      modalQty
                  )}
                </span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Shopping Cart & Checkout Drawer */}
      {cartDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/75 backdrop-blur-sm">
          <div className="flex h-full w-full max-w-md flex-col border-l border-border bg-surface-card p-6 shadow-2xl overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <h2 className="font-heading text-lg font-bold text-foreground">
                Sua Sacola ({cartCount})
              </h2>
              <button
                type="button"
                onClick={() => setCartDrawerOpen(false)}
                className="text-foreground-muted hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Cart Items */}
            <div className="mt-4 space-y-3">
              {cart.map((item) => {
                const unitCents =
                  item.product.price_cents +
                  item.selectedOptions.reduce((s, o) => s + o.price_cents, 0);
                return (
                  <div
                    key={item.cartItemId}
                    className="rounded-xl border border-border bg-surface p-3.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-bold text-foreground">
                          {item.quantity}x {item.product.name}
                        </p>
                        {item.selectedOptions.length > 0 && (
                          <p className="mt-0.5 text-[11px] text-foreground-muted">
                            +{" "}
                            {item.selectedOptions
                              .map((o) => o.name)
                              .join(", ")}
                          </p>
                        )}
                        {item.notes && (
                          <p className="mt-0.5 text-[11px] italic text-brand">
                            Obs: {item.notes}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-foreground tabular-nums">
                          {formatCurrencyCents(unitCents * item.quantity)}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setCart((prev) =>
                              prev.filter(
                                (c) => c.cartItemId !== item.cartItemId
                              )
                            )
                          }
                          className="text-foreground-muted hover:text-red-400"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Customer & Fulfillment Form */}
            <form onSubmit={handleSubmitOrder} className="mt-6 space-y-4">
              <div className="border-t border-border pt-4">
                <h3 className="font-heading text-sm font-bold text-foreground">
                  Seus Dados para Atendimento
                </h3>
              </div>

              {checkoutError && (
                <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{checkoutError}</span>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { key: "PICKUP", label: "Retirada" },
                    { key: "DELIVERY", label: "Delivery" },
                    { key: "DINE_IN", label: "Mesa / Local" },
                  ] as const
                ).map((mode) => (
                  <button
                    key={mode.key}
                    type="button"
                    onClick={() => setFulfillmentType(mode.key)}
                    className={`rounded-lg border py-2 text-xs font-semibold transition-colors ${
                      fulfillmentType === mode.key
                        ? "border-brand bg-brand/15 text-brand"
                        : "border-border bg-surface text-foreground-muted"
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-foreground">
                  Seu Nome
                </label>
                <Input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Ex: Robson Silva"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-foreground">
                  WhatsApp com DDD
                </label>
                <Input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="(11) 99999-9999"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-foreground">
                  {fulfillmentType === "DINE_IN"
                    ? "Número da Mesa"
                    : fulfillmentType === "DELIVERY"
                    ? "Endereço Completo de Entrega"
                    : "Identificação / Observação de Retirada"}
                </label>
                <Input
                  value={tableOrReference}
                  onChange={(e) => setTableOrReference(e.target.value)}
                  placeholder={
                    fulfillmentType === "DINE_IN"
                      ? "Ex: Mesa 4"
                      : fulfillmentType === "DELIVERY"
                      ? "Rua, Número, Complemento, Bairro"
                      : "Ex: Retiro em 20 minutos"
                  }
                  required={fulfillmentType !== "PICKUP"}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-foreground">
                  Observações gerais do pedido (opcional)
                </label>
                <Input
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  placeholder="Ex: Preciso de troco para R$ 100"
                />
              </div>

              <div className="rounded-xl border border-border bg-surface p-4">
                <div className="flex items-center justify-between text-sm font-bold text-foreground">
                  <span>Total do Pedido</span>
                  <span className="font-heading text-lg text-brand tabular-nums">
                    {formatCurrencyCents(cartTotalCents)}
                  </span>
                </div>
              </div>

              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={isPending || cart.length === 0}
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Enviando pedido...</span>
                  </>
                ) : (
                  <span>Confirmar e Enviar Pedido</span>
                )}
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

