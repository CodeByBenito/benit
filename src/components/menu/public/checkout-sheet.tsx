"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Banknote, CreditCard, Loader2, Minus, Plus, QrCode, ShoppingBag, Smartphone, Ticket, X } from "lucide-react";
import { placeOrderAction, quoteCheckoutAction, type CheckoutQuote } from "@/features/checkout/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { PAYMENT_METHOD_LABEL } from "@/lib/labels";
import { cn, formatCurrencyCents } from "@/lib/utils";
import type { FulfillmentType, PaymentMethod } from "@/types/domain.types";
import type { PublicDeliveryZone, PublicStoreInfo } from "./types";
import type { useBag } from "./use-bag";

type Bag = ReturnType<typeof useBag>;

const METHOD_ICON: Record<PaymentMethod, typeof QrCode> = {
  ONLINE_PIX: QrCode,
  ONLINE_CARD: CreditCard,
  CASH: Banknote,
  CARD_ON_DELIVERY: CreditCard,
  PIX_MANUAL: Smartphone,
};

const CONTACT_KEY = "benit:contact";

function formatPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
}

export function CheckoutSheet({
  open,
  onOpenChange,
  store,
  zones,
  bag,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  store: PublicStoreInfo;
  zones: PublicDeliveryZone[];
  bag: Bag;
}) {
  const router = useRouter();
  const [step, setStep] = useState<"bag" | "details">("bag");
  const fulfillmentOptions = (
    [
      store.fulfillment.delivery && { value: "DELIVERY" as const, label: "Entrega" },
      store.fulfillment.pickup && { value: "PICKUP" as const, label: "Retirada" },
      store.fulfillment.dine_in && { value: "DINE_IN" as const, label: "Na mesa" },
    ] as const
  ).filter(Boolean) as { value: FulfillmentType; label: string }[];

  const [fulfillment, setFulfillment] = useState<FulfillmentType>(fulfillmentOptions[0]?.value ?? "PICKUP");
  const [neighborhood, setNeighborhood] = useState("");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [reference, setReference] = useState("");
  const [table, setTable] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState("");
  const [changeFor, setChangeFor] = useState("");
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placing, startPlacing] = useTransition();

  const methods: PaymentMethod[] = useMemo(
    () => [...(store.online_payment.enabled ? (["ONLINE_PIX", "ONLINE_CARD"] as PaymentMethod[]) : []), ...store.offline_methods],
    [store]
  );
  const [method, setMethod] = useState<PaymentMethod | null>(methods[0] ?? null);

  const neighborhoods = useMemo(
    () => Array.from(new Set(zones.flatMap((z) => z.neighborhoods))).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [zones]
  );
  const needsZone = fulfillment === "DELIVERY" && zones.length > 0;

  // Remember contact details for the next order (per device).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CONTACT_KEY);
      if (raw) {
        const c = JSON.parse(raw);
        setName(c.name ?? "");
        setPhone(c.phone ?? "");
        setStreet(c.street ?? "");
        setNumber(c.number ?? "");
        setComplement(c.complement ?? "");
        setNeighborhood(c.neighborhood ?? "");
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Live, server-side quote (debounced). It only previews — the order RPC recalculates.
  useEffect(() => {
    if (!open || bag.items.length === 0) return;
    setQuoting(true);
    const t = setTimeout(async () => {
      const res = await quoteCheckoutAction({
        slug: store.slug,
        items: bag.apiItems,
        fulfillmentType: fulfillment,
        neighborhood: needsZone ? neighborhood || undefined : undefined,
        couponCode: coupon || undefined,
        customerPhone: phone || undefined,
      });
      setQuoting(false);
      if (res.success && res.data) setQuote(res.data);
    }, 280);
    return () => clearTimeout(t);
  }, [open, bag.apiItems, bag.items.length, fulfillment, neighborhood, coupon, phone, needsZone, store.slug]);

  const subtotal = quote?.subtotal_cents ?? bag.subtotalCents;
  const total = quote?.total_cents ?? bag.subtotalCents;
  const blockers: string[] = [];
  if (quote && !quote.accepting_now) blockers.push("A loja está fechada agora.");
  if (quote && !quote.meets_minimum) blockers.push(`Pedido mínimo de ${formatCurrencyCents(quote.min_order_cents)}.`);
  if (needsZone && quote?.zone_error) blockers.push(quote.zone_error);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!method) return setError("Escolha a forma de pagamento.");
    startPlacing(async () => {
      const res = await placeOrderAction({
        slug: store.slug,
        storeId: store.id,
        fulfillmentType: fulfillment,
        customerName: name,
        customerPhone: phone,
        tableOrReference: fulfillment === "DINE_IN" ? table : undefined,
        notes: notes || undefined,
        items: bag.apiItems,
        paymentMethod: method,
        delivery: fulfillment === "DELIVERY" ? { street, number, complement, neighborhood, reference } : undefined,
        couponCode: coupon || undefined,
        changeForCents: method === "CASH" && changeFor ? Math.round(Number(changeFor.replace(",", ".")) * 100) : undefined,
        idempotencyKey: bag.checkoutKey,
      });
      if (!res.success || !res.data) {
        setError(res.error ?? "Não foi possível enviar o pedido.");
        return;
      }
      try {
        window.localStorage.setItem(CONTACT_KEY, JSON.stringify({ name, phone, street, number, complement, neighborhood }));
      } catch {
        /* ignore */
      }
      bag.reset();
      onOpenChange(false);
      router.push(`/pedido/${res.data.publicToken}`);
    });
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setStep("bag"); }}>
      <SheetContent className="p-0">
        <div className="flex items-center gap-3 border-b border-border px-5 py-4 pr-14">
          {step === "details" ? (
            <button type="button" onClick={() => setStep("bag")} className="-ml-1 rounded-md p-1 text-foreground-muted hover:text-foreground" aria-label="Voltar para a sacola">
              <ArrowLeft className="h-5 w-5" />
            </button>
          ) : (
            <ShoppingBag className="h-5 w-5 text-brand" />
          )}
          <div>
            <SheetTitle className="font-display text-lg font-bold">{step === "bag" ? "Sua sacola" : "Finalizar pedido"}</SheetTitle>
            <SheetDescription className="text-xs text-foreground-muted">
              {step === "bag" ? `${bag.count} ${bag.count === 1 ? "item" : "itens"} · ${store.name}` : "Atendimento, contato e pagamento"}
            </SheetDescription>
          </div>
        </div>

        {bag.items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center p-10 text-center">
            <ShoppingBag className="h-10 w-10 text-foreground-subtle" />
            <p className="mt-4 font-display text-lg font-bold">Sua sacola está vazia</p>
            <p className="mt-1 text-sm text-foreground-muted">Escolha algo gostoso no cardápio.</p>
          </div>
        ) : step === "bag" ? (
          <>
            <ul className="flex-1 divide-y divide-border overflow-y-auto px-5">
              {bag.items.map((i) => (
                <li key={i.key} className="flex gap-4 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{i.name}</p>
                    {i.options.length ? <p className="mt-0.5 text-xs text-foreground-muted">{i.options.map((o) => o.name).join(" · ")}</p> : null}
                    {i.notes ? <p className="mt-0.5 text-xs italic text-foreground-muted">“{i.notes}”</p> : null}
                    <p className="mt-1.5 font-mono text-sm">{formatCurrencyCents(i.unitCents * i.quantity)}</p>
                  </div>
                  <div className="flex h-9 items-center self-center rounded-full border border-border">
                    <button type="button" aria-label={`Remover um ${i.name}`} onClick={() => bag.setQuantity(i.key, i.quantity - 1)} className="flex h-9 w-9 items-center justify-center text-foreground-muted hover:text-foreground">
                      {i.quantity === 1 ? <X className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                    </button>
                    <span className="w-5 text-center font-mono text-sm">{i.quantity}</span>
                    <button type="button" aria-label={`Adicionar um ${i.name}`} onClick={() => bag.setQuantity(i.key, i.quantity + 1)} className="flex h-9 w-9 items-center justify-center text-foreground-muted hover:text-foreground">
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="border-t border-border p-5">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Ticket className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-subtle" />
                  <Input
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    placeholder="Cupom de desconto"
                    className="pl-9 font-mono uppercase tracking-wider"
                    aria-label="Cupom de desconto"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setCoupon(couponInput.trim())}
                  className="h-10 rounded-lg border border-border px-4 text-sm font-medium hover:bg-surface-card"
                >
                  Aplicar
                </button>
              </div>
              {coupon && quote?.coupon_error ? <p className="mt-2 text-xs text-danger">{quote.coupon_error}</p> : null}
              {coupon && quote?.coupon ? (
                <p className="mt-2 text-xs text-success">Cupom {quote.coupon.code} aplicado: −{formatCurrencyCents(quote.coupon.discount_cents)}</p>
              ) : null}
              <Summary subtotal={subtotal} quote={quote} total={total} quoting={quoting} />
              <button
                type="button"
                onClick={() => setStep("details")}
                className="mt-4 flex h-12 w-full items-center justify-between rounded-full bg-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
              >
                Continuar <span className="font-mono">{formatCurrencyCents(total)}</span>
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-7 overflow-y-auto p-5">
              {fulfillmentOptions.length > 1 ? (
                <section>
                  <h3 className="mb-3 font-display text-sm font-bold">Como você quer receber?</h3>
                  <Segmented name="Forma de atendimento" value={fulfillment} onChange={setFulfillment} options={fulfillmentOptions} />
                </section>
              ) : null}

              {fulfillment === "DELIVERY" ? (
                <section className="space-y-3">
                  <h3 className="font-display text-sm font-bold">Endereço de entrega</h3>
                  {needsZone ? (
                    <div className="space-y-1.5">
                      <Label htmlFor="nb">Bairro</Label>
                      <Select value={neighborhood || undefined} onValueChange={setNeighborhood}>
                        <SelectTrigger id="nb" aria-invalid={Boolean(quote?.zone_error && neighborhood)}>
                          <SelectValue placeholder="Escolha seu bairro" />
                        </SelectTrigger>
                        <SelectContent>
                          {neighborhoods.map((n) => (
                            <SelectItem key={n} value={n}>
                              {n}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {quote?.zone ? (
                        <p className="text-xs text-foreground-muted">
                          Taxa {formatCurrencyCents(quote.fee_cents)} · chega em ~{quote.zone.eta_minutes} min
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <Field id="nb" label="Bairro" value={neighborhood} onChange={setNeighborhood} required autoComplete="address-level3" />
                  )}
                  <div className="grid grid-cols-[1fr_96px] gap-3">
                    <Field id="street" label="Rua" value={street} onChange={setStreet} required autoComplete="address-line1" />
                    <Field id="num" label="Número" value={number} onChange={setNumber} inputMode="numeric" />
                  </div>
                  <Field id="comp" label="Complemento (opcional)" value={complement} onChange={setComplement} autoComplete="address-line2" />
                  <Field id="ref" label="Ponto de referência (opcional)" value={reference} onChange={setReference} />
                </section>
              ) : fulfillment === "DINE_IN" ? (
                <Field id="table" label="Número da mesa" value={table} onChange={setTable} required inputMode="numeric" />
              ) : store.address ? (
                <p className="rounded-xl border border-border bg-surface-card p-4 text-sm text-foreground-muted">
                  Retire em <span className="text-foreground">{store.address}</span>
                </p>
              ) : null}

              <section className="space-y-3">
                <h3 className="font-display text-sm font-bold">Seus dados</h3>
                <Field id="name" label="Nome" value={name} onChange={setName} required autoComplete="name" />
                <Field id="phone" label="WhatsApp" value={phone} onChange={(v) => setPhone(formatPhone(v))} required inputMode="tel" autoComplete="tel" placeholder="(11) 98888-7777" />
                <div className="space-y-1.5">
                  <Label htmlFor="notes">Observações do pedido (opcional)</Label>
                  <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 400))} className="min-h-[64px]" />
                </div>
              </section>

              <section>
                <h3 className="mb-3 font-display text-sm font-bold">Pagamento</h3>
                <div role="radiogroup" aria-label="Forma de pagamento" className="grid gap-2">
                  {methods.map((m) => {
                    const Icon = METHOD_ICON[m];
                    const active = method === m;
                    return (
                      <button
                        key={m}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setMethod(m)}
                        className={cn(
                          "flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors",
                          active ? "border-brand bg-brand/[0.07]" : "border-border hover:bg-surface-card"
                        )}
                      >
                        <Icon className={cn("h-5 w-5", active ? "text-brand" : "text-foreground-muted")} />
                        <span className="flex-1">
                          <span className="block font-medium">{PAYMENT_METHOD_LABEL[m]}</span>
                          <span className="block text-xs text-foreground-muted">
                            {m === "ONLINE_PIX" && "QR Code na próxima tela, aprovação na hora"}
                            {m === "ONLINE_CARD" && "Crédito ou débito, pago agora com segurança"}
                            {m === "CASH" && "Pague ao receber"}
                            {m === "CARD_ON_DELIVERY" && "Maquininha na entrega ou retirada"}
                            {m === "PIX_MANUAL" && (store.pix_key ? `Chave: ${store.pix_key}` : "Pix ao receber")}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                {method === "CASH" ? (
                  <div className="mt-3">
                    <Field id="change" label="Troco para quanto? (opcional)" value={changeFor} onChange={setChangeFor} inputMode="decimal" placeholder="Ex.: 100" />
                  </div>
                ) : null}
              </section>
            </div>

            <div className="border-t border-border bg-surface p-5">
              <Summary subtotal={subtotal} quote={quote} total={total} quoting={quoting} compact />
              {blockers.length || error ? (
                <p role="alert" className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
                  {error ?? blockers[0]}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={placing || blockers.length > 0 || !method}
                className="mt-3 flex h-12 w-full items-center justify-between rounded-full bg-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:bg-surface-elevated disabled:text-foreground-muted"
              >
                <span className="flex items-center gap-2">
                  {placing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {method === "ONLINE_PIX" || method === "ONLINE_CARD" ? "Ir para o pagamento" : "Enviar pedido"}
                </span>
                <span className="font-mono">{formatCurrencyCents(total)}</span>
              </button>
            </div>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  ...rest
}: { id: string; label: string; value: string; onChange: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "id">) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
    </div>
  );
}

function Summary({ subtotal, quote, total, quoting, compact }: { subtotal: number; quote: CheckoutQuote | null; total: number; quoting: boolean; compact?: boolean }) {
  return (
    <dl className={cn("space-y-1.5 text-sm", compact ? "" : "mt-5")}>
      <div className="flex justify-between text-foreground-muted">
        <dt>Subtotal</dt>
        <dd className="font-mono">{formatCurrencyCents(subtotal)}</dd>
      </div>
      {quote?.discount_cents ? (
        <div className="flex justify-between text-success">
          <dt>Desconto</dt>
          <dd className="font-mono">−{formatCurrencyCents(quote.discount_cents)}</dd>
        </div>
      ) : null}
      {quote?.fee_cents ? (
        <div className="flex justify-between text-foreground-muted">
          <dt>Taxa de entrega</dt>
          <dd className="font-mono">{formatCurrencyCents(quote.fee_cents)}</dd>
        </div>
      ) : null}
      <div className="flex items-center justify-between pt-1 font-medium">
        <dt className="flex items-center gap-2">Total {quoting ? <Loader2 className="h-3 w-3 animate-spin text-foreground-subtle" /> : null}</dt>
        <dd className="font-mono text-base">{formatCurrencyCents(total)}</dd>
      </div>
    </dl>
  );
}
