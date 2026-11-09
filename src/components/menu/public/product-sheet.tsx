"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Minus, Plus } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatCurrencyCents } from "@/lib/utils";
import type { CartItem, PublicOptionGroup, PublicOptionItem, PublicProduct } from "./types";

function groupRule(g: PublicOptionGroup) {
  const min = Math.max(g.is_required ? 1 : 0, g.min_select);
  if (min > 0 && g.max_select === min) return `Escolha ${min}`;
  if (min > 0) return `Escolha de ${min} a ${g.max_select}`;
  return g.max_select === 1 ? "Opcional · até 1" : `Opcional · até ${g.max_select}`;
}

export function ProductSheet({
  product,
  onClose,
  onAdd,
  disabled,
}: {
  product: PublicProduct | null;
  onClose: () => void;
  onAdd: (item: Omit<CartItem, "key">, origin?: DOMRect) => void;
  disabled: boolean;
}) {
  const [qty, setQty] = useState(1);
  const [selected, setSelected] = useState<Record<string, PublicOptionItem[]>>({});
  const [notes, setNotes] = useState("");
  const [touched, setTouched] = useState(false);
  const addRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setQty(1);
    setSelected({});
    setNotes("");
    setTouched(false);
  }, [product?.id]);

  const unmet = useMemo(() => {
    if (!product) return [];
    return product.option_groups.filter((g) => (selected[g.id]?.length ?? 0) < Math.max(g.is_required ? 1 : 0, g.min_select));
  }, [product, selected]);

  if (!product) return null;

  const options = Object.values(selected).flat();
  const unit = product.price_cents + options.reduce((n, o) => n + o.price_cents, 0);
  const soldOut = !product.is_available || !product.in_stock;

  function toggle(group: PublicOptionGroup, option: PublicOptionItem) {
    setSelected((prev) => {
      const current = prev[group.id] ?? [];
      const has = current.some((o) => o.id === option.id);
      if (has) return { ...prev, [group.id]: current.filter((o) => o.id !== option.id) };
      if (group.max_select === 1) return { ...prev, [group.id]: [option] };
      if (current.length >= group.max_select) return prev;
      return { ...prev, [group.id]: [...current, option] };
    });
  }

  function submit() {
    setTouched(true);
    if (unmet.length || soldOut || disabled || !product) return;
    onAdd({ productId: product.id, name: product.name, unitCents: unit, quantity: qty, options, notes: notes.trim() }, addRef.current?.getBoundingClientRect());
    onClose();
  }

  return (
    <Sheet open={Boolean(product)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="p-0">
        <div className="flex-1 overflow-y-auto">
          {product.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.image_url} alt="" className="aspect-[16/10] w-full object-cover" />
          ) : (
            <div aria-hidden className="aspect-[16/7] w-full bg-gradient-to-br from-brand/25 via-surface-card to-surface" />
          )}
          <div className="p-5 sm:p-6">
            <SheetTitle className="font-display text-display-sm font-extrabold">{product.name}</SheetTitle>
            {product.description ? (
              <SheetDescription className="mt-2 text-[15px] leading-relaxed text-foreground-muted">{product.description}</SheetDescription>
            ) : (
              <SheetDescription className="sr-only">Personalize e adicione à sacola</SheetDescription>
            )}
            <p className="mt-3 font-mono text-lg">{formatCurrencyCents(product.price_cents)}</p>

            {product.option_groups.map((g) => {
              const count = selected[g.id]?.length ?? 0;
              const missing = touched && unmet.some((u) => u.id === g.id);
              return (
                <fieldset key={g.id} className="mt-7">
                  <legend className="flex w-full items-center justify-between gap-3">
                    <span className="font-display text-base font-bold">{g.name}</span>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-[11px] font-medium",
                        missing ? "bg-danger/15 text-danger" : g.is_required || g.min_select > 0 ? "bg-foreground text-background" : "bg-surface-card text-foreground-muted"
                      )}
                    >
                      {groupRule(g)}
                    </span>
                  </legend>
                  <div className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border">
                    {g.options.map((o) => {
                      const active = selected[g.id]?.some((s) => s.id === o.id) ?? false;
                      const blocked = !active && g.max_select > 1 && count >= g.max_select;
                      return (
                        <button
                          key={o.id}
                          type="button"
                          role={g.max_select === 1 ? "radio" : "checkbox"}
                          aria-checked={active}
                          disabled={blocked}
                          onClick={() => toggle(g, o)}
                          className={cn(
                            "flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left text-sm transition-colors",
                            active ? "bg-brand/[0.07]" : "hover:bg-surface-card",
                            blocked && "opacity-40"
                          )}
                        >
                          <span className="flex items-center gap-3">
                            <span
                              className={cn(
                                "flex h-5 w-5 shrink-0 items-center justify-center border transition-colors",
                                g.max_select === 1 ? "rounded-full" : "rounded-md",
                                active ? "border-brand bg-brand text-white" : "border-border-strong"
                              )}
                            >
                              {active ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                            </span>
                            {o.name}
                          </span>
                          <span className="font-mono text-foreground-muted">{o.price_cents ? `+ ${formatCurrencyCents(o.price_cents)}` : "—"}</span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              );
            })}

            <label className="mt-7 block">
              <span className="font-display text-base font-bold">Alguma observação?</span>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value.slice(0, 240))}
                placeholder="Ex.: sem cebola, ponto da carne…"
                className="mt-3"
              />
            </label>
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-border bg-surface p-4">
          <div className="flex items-center rounded-full border border-border">
            <button type="button" aria-label="Diminuir" onClick={() => setQty((q) => Math.max(1, q - 1))} className="flex h-11 w-11 items-center justify-center text-foreground-muted hover:text-foreground">
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-6 text-center font-mono" aria-live="polite">{qty}</span>
            <button type="button" aria-label="Aumentar" onClick={() => setQty((q) => Math.min(50, q + 1))} className="flex h-11 w-11 items-center justify-center text-foreground-muted hover:text-foreground">
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            ref={addRef}
            onClick={submit}
            disabled={soldOut || disabled}
            className="flex h-12 flex-1 items-center justify-between rounded-full bg-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:bg-surface-elevated disabled:text-foreground-muted"
          >
            <span>{soldOut ? "Esgotado" : disabled ? "Loja fechada" : unmet.length && touched ? "Faltam escolhas" : "Adicionar"}</span>
            <span className="font-mono">{formatCurrencyCents(unit * qty)}</span>
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
