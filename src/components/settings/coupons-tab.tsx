"use client";

import { useState, useTransition } from "react";
import { Loader2, Pencil, Plus, Ticket, Trash2 } from "lucide-react";
import { deleteCouponAction, saveCouponAction, toggleCouponAction } from "@/features/coupons/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { cn, formatCurrencyCents } from "@/lib/utils";
import type { Coupon, CouponKind } from "@/types/domain.types";
import { FormMessage, MoneyInput, SettingsSection } from "./shared";

type Draft = {
  id?: string;
  code: string;
  description: string;
  kind: CouponKind;
  value: number;
  maxDiscountCents: number | null;
  minOrderCents: number;
  startsAt: string; // datetime-local
  endsAt: string;
  usageLimit: string;
  perCustomerLimit: string;
  isActive: boolean;
};

const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
const toIso = (local: string) => (local ? new Date(local).toISOString() : null);

function describe(c: Coupon) {
  const value = c.kind === "PERCENT" ? `${c.value}%` : formatCurrencyCents(c.value);
  const parts = [`${value} de desconto`];
  if (c.min_order_cents) parts.push(`mínimo ${formatCurrencyCents(c.min_order_cents)}`);
  if (c.per_customer_limit) parts.push(`${c.per_customer_limit}× por cliente`);
  return parts.join(" · ");
}

export function CouponsTab({ storeId, coupons: initial, canManage }: { storeId: string; coupons: Coupon[]; canManage: boolean }) {
  const [coupons, setCoupons] = useState(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function edit(c?: Coupon) {
    setError(null);
    setDraft(
      c
        ? {
            id: c.id,
            code: c.code,
            description: c.description ?? "",
            kind: c.kind,
            value: c.value,
            maxDiscountCents: c.max_discount_cents,
            minOrderCents: c.min_order_cents,
            startsAt: toLocal(c.starts_at),
            endsAt: toLocal(c.ends_at),
            usageLimit: c.usage_limit?.toString() ?? "",
            perCustomerLimit: c.per_customer_limit?.toString() ?? "",
            isActive: c.is_active,
          }
        : { code: "", description: "", kind: "PERCENT", value: 10, maxDiscountCents: null, minOrderCents: 0, startsAt: "", endsAt: "", usageLimit: "", perCustomerLimit: "1", isActive: true }
    );
  }

  function save() {
    if (!draft) return;
    setError(null);
    const payload = {
      storeId,
      id: draft.id,
      code: draft.code,
      description: draft.description || null,
      kind: draft.kind,
      value: draft.value,
      maxDiscountCents: draft.maxDiscountCents,
      minOrderCents: draft.minOrderCents,
      startsAt: toIso(draft.startsAt),
      endsAt: toIso(draft.endsAt),
      usageLimit: draft.usageLimit ? Number(draft.usageLimit) : null,
      perCustomerLimit: draft.perCustomerLimit ? Number(draft.perCustomerLimit) : null,
      isActive: draft.isActive,
    };
    start(async () => {
      const res = await saveCouponAction(payload);
      if (!res.success || !res.data) return setError(res.error ?? "Erro ao salvar.");
      const row: Coupon = {
        id: res.data.id,
        store_id: storeId,
        code: payload.code.toUpperCase(),
        description: payload.description,
        kind: payload.kind,
        value: payload.value,
        max_discount_cents: payload.kind === "PERCENT" ? payload.maxDiscountCents : null,
        min_order_cents: payload.minOrderCents,
        starts_at: payload.startsAt,
        ends_at: payload.endsAt,
        usage_limit: payload.usageLimit,
        per_customer_limit: payload.perCustomerLimit,
        used_count: coupons.find((c) => c.id === res.data!.id)?.used_count ?? 0,
        is_active: payload.isActive,
        created_at: new Date().toISOString(),
      };
      setCoupons((prev) => (draft.id ? prev.map((c) => (c.id === draft.id ? row : c)) : [row, ...prev]));
      setDraft(null);
      toast.success(`Cupom ${row.code} salvo.`);
    });
  }

  function toggle(c: Coupon, v: boolean) {
    setCoupons((prev) => prev.map((x) => (x.id === c.id ? { ...x, is_active: v } : x)));
    start(async () => {
      const res = await toggleCouponAction(storeId, c.id, v);
      if (!res.success) {
        toast.error(res.error ?? "Erro.");
        setCoupons((prev) => prev.map((x) => (x.id === c.id ? { ...x, is_active: !v } : x)));
      }
    });
  }

  function remove(c: Coupon) {
    if (!confirm(`Remover o cupom ${c.code}? Se ele já foi usado, será apenas desativado.`)) return;
    start(async () => {
      const res = await deleteCouponAction(storeId, c.id);
      if (!res.success) { toast.error(res.error ?? "Erro."); return; }
      setCoupons((prev) => (c.used_count ? prev.map((x) => (x.id === c.id ? { ...x, is_active: false } : x)) : prev.filter((x) => x.id !== c.id)));
    });
  }

  return (
    <div>
      <SettingsSection
        title="Cupons"
        description="O desconto é validado no servidor: validade, pedido mínimo, limite total e por cliente (pelo WhatsApp)."
        aside={
          canManage ? (
            <Button className="mt-5" onClick={() => edit()}>
              <Plus className="h-4 w-4" /> Novo cupom
            </Button>
          ) : null
        }
      >
        {coupons.length === 0 ? (
          <EmptyState icon={<Ticket className="h-5 w-5" />} title="Nenhum cupom" description="Crie um cupom de boas-vindas para trazer o cliente do marketplace para o seu link." />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {coupons.map((c) => {
              const expired = c.ends_at ? new Date(c.ends_at) < new Date() : false;
              const exhausted = c.usage_limit ? c.used_count >= c.usage_limit : false;
              return (
                <li key={c.id} className={cn("relative overflow-hidden rounded-2xl border bg-surface p-5", c.is_active && !expired && !exhausted ? "border-brand/40" : "border-border")}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-lg font-medium tracking-wider">{c.code}</p>
                      <p className="mt-1 text-sm text-foreground-muted">{describe(c)}</p>
                      <p className="mt-2 text-xs text-foreground-subtle">
                        {c.usage_limit ? `${c.used_count} de ${c.usage_limit} usos` : `${c.used_count} ${c.used_count === 1 ? "uso" : "usos"}`}
                        {expired ? " · expirado" : exhausted ? " · esgotado" : ""}
                      </p>
                    </div>
                    <Switch checked={c.is_active} disabled={!canManage} onCheckedChange={(v) => toggle(c, v)} aria-label={`Cupom ${c.code} ativo`} />
                  </div>
                  {canManage ? (
                    <div className="mt-3 flex gap-1 border-t border-border pt-3">
                      <Button variant="ghost" size="sm" onClick={() => edit(c)}>
                        <Pencil className="h-3.5 w-3.5" /> Editar
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => remove(c)}>
                        <Trash2 className="h-3.5 w-3.5" /> Remover
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </SettingsSection>

      <Dialog open={Boolean(draft)} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Editar cupom" : "Novo cupom"}</DialogTitle>
            <DialogDescription>O cliente digita o código na sacola.</DialogDescription>
          </DialogHeader>
          {draft ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="code">Código</Label>
                  <Input id="code" className="font-mono uppercase tracking-wider" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") })} placeholder="BEMVINDO10" />
                </div>
                <div className="space-y-1.5">
                  <Label>Tipo</Label>
                  <Segmented
                    name="Tipo de desconto"
                    value={draft.kind}
                    onChange={(k) => setDraft({ ...draft, kind: k, value: k === "PERCENT" ? 10 : 1000 })}
                    options={[
                      { value: "PERCENT", label: "Porcentagem" },
                      { value: "FIXED", label: "Valor fixo" },
                    ]}
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                {draft.kind === "PERCENT" ? (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="pct">Desconto (%)</Label>
                      <Input id="pct" type="number" min={1} max={100} className="font-mono" value={draft.value} onChange={(e) => setDraft({ ...draft, value: Number(e.target.value) })} />
                    </div>
                    <MoneyInput id="cap" label="Desconto máximo" cents={draft.maxDiscountCents} onChange={(c) => setDraft({ ...draft, maxDiscountCents: c })} allowEmpty placeholder="sem teto" />
                  </>
                ) : (
                  <MoneyInput id="fixed" label="Valor do desconto" cents={draft.value} onChange={(c) => setDraft({ ...draft, value: c ?? 0 })} />
                )}
                <MoneyInput id="cmin" label="Pedido mínimo" cents={draft.minOrderCents} onChange={(c) => setDraft({ ...draft, minOrderCents: c ?? 0 })} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="start">Começa em (opcional)</Label>
                  <Input id="start" type="datetime-local" className="[color-scheme:dark]" value={draft.startsAt} onChange={(e) => setDraft({ ...draft, startsAt: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="end">Termina em (opcional)</Label>
                  <Input id="end" type="datetime-local" className="[color-scheme:dark]" value={draft.endsAt} onChange={(e) => setDraft({ ...draft, endsAt: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lim">Limite total de usos</Label>
                  <Input id="lim" type="number" min={1} className="font-mono" placeholder="ilimitado" value={draft.usageLimit} onChange={(e) => setDraft({ ...draft, usageLimit: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="per">Usos por cliente</Label>
                  <Input id="per" type="number" min={1} className="font-mono" placeholder="ilimitado" value={draft.perCustomerLimit} onChange={(e) => setDraft({ ...draft, perCustomerLimit: e.target.value })} />
                </div>
              </div>
              <FormMessage error={error} />
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Salvar cupom
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
