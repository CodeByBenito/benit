"use client";

import { useState, useTransition } from "react";
import { Loader2, MapPin, Pencil, Plus, Trash2, X } from "lucide-react";
import { deleteDeliveryZoneAction, saveDeliveryZoneAction } from "@/features/delivery/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { formatCurrencyCents } from "@/lib/utils";
import type { DeliveryZone } from "@/types/domain.types";
import { FormMessage, MoneyInput, SettingsSection } from "./shared";

type Draft = {
  id?: string;
  name: string;
  neighborhoods: string[];
  feeCents: number;
  minOrderCents: number | null;
  etaMinutes: number | null;
  isActive: boolean;
};

const empty: Draft = { name: "", neighborhoods: [], feeCents: 0, minOrderCents: null, etaMinutes: null, isActive: true };

export function DeliveryTab({ storeId, zones: initial, canManage }: { storeId: string; zones: DeliveryZone[]; canManage: boolean }) {
  const [zones, setZones] = useState(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [nbInput, setNbInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function edit(z?: DeliveryZone) {
    setError(null);
    setNbInput("");
    setDraft(
      z
        ? { id: z.id, name: z.name, neighborhoods: z.neighborhoods, feeCents: z.fee_cents, minOrderCents: z.min_order_cents, etaMinutes: z.eta_minutes, isActive: z.is_active }
        : { ...empty }
    );
  }

  function addNeighborhoods() {
    if (!draft) return;
    const parts = nbInput.split(/[,;\n]/).map((p) => p.trim()).filter((p) => p.length >= 2);
    const merged = Array.from(new Set([...draft.neighborhoods, ...parts]));
    setDraft({ ...draft, neighborhoods: merged });
    setNbInput("");
  }

  function save() {
    if (!draft) return;
    setError(null);
    const pendingParts = nbInput.split(/[,;\n]/).map((p) => p.trim()).filter((p) => p.length >= 2);
    const payload = { ...draft, neighborhoods: Array.from(new Set([...draft.neighborhoods, ...pendingParts])), storeId };
    start(async () => {
      const res = await saveDeliveryZoneAction(payload);
      if (!res.success || !res.data) return setError(res.error ?? "Erro ao salvar.");
      const row: DeliveryZone = {
        id: res.data.id,
        store_id: storeId,
        name: payload.name,
        neighborhoods: payload.neighborhoods,
        fee_cents: payload.feeCents,
        min_order_cents: payload.minOrderCents,
        eta_minutes: payload.etaMinutes,
        is_active: payload.isActive,
        sort_order: 0,
      };
      setZones((prev) => (draft.id ? prev.map((z) => (z.id === draft.id ? row : z)) : [...prev, row]));
      setDraft(null);
      toast.success("Zona de entrega salva.");
    });
  }

  function remove(z: DeliveryZone) {
    if (!confirm(`Remover a zona "${z.name}"?`)) return;
    start(async () => {
      const res = await deleteDeliveryZoneAction(storeId, z.id);
      if (!res.success) { toast.error(res.error ?? "Erro ao remover."); return; }
      setZones((prev) => prev.filter((x) => x.id !== z.id));
    });
  }

  return (
    <div>
      <SettingsSection
        title="Bairros atendidos"
        description="Agrupe bairros com a mesma taxa. O cliente escolhe o bairro no checkout e vê taxa, prazo e pedido mínimo na hora. Sem zonas cadastradas, a entrega fica sem taxa."
        aside={
          canManage ? (
            <Button className="mt-5" onClick={() => edit()}>
              <Plus className="h-4 w-4" /> Nova zona
            </Button>
          ) : null
        }
      >
        {zones.length === 0 ? (
          <EmptyState icon={<MapPin className="h-5 w-5" />} title="Nenhuma zona ainda" description="Crie sua primeira zona com os bairros mais próximos da loja." />
        ) : (
          <ul className="grid gap-3">
            {zones.map((z) => (
              <li key={z.id} className="rounded-2xl border border-border bg-surface p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="flex items-center gap-2 font-display font-bold">
                      {z.name}
                      {!z.is_active ? <span className="rounded-full bg-surface-card px-2 py-0.5 text-[11px] font-normal text-foreground-muted">Pausada</span> : null}
                    </p>
                    <p className="mt-1 text-sm text-foreground-muted">
                      <span className="font-mono text-foreground">{formatCurrencyCents(z.fee_cents)}</span>
                      {z.eta_minutes ? ` · ~${z.eta_minutes} min` : ""}
                      {z.min_order_cents ? ` · mínimo ${formatCurrencyCents(z.min_order_cents)}` : ""}
                    </p>
                  </div>
                  {canManage ? (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" aria-label={`Editar ${z.name}`} onClick={() => edit(z)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={`Remover ${z.name}`} onClick={() => remove(z)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {z.neighborhoods.map((n) => (
                    <span key={n} className="rounded-full border border-border px-2.5 py-0.5 text-xs text-foreground-muted">
                      {n}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>

      <Dialog open={Boolean(draft)} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Editar zona" : "Nova zona de entrega"}</DialogTitle>
            <DialogDescription>Bairros com a mesma taxa e prazo.</DialogDescription>
          </DialogHeader>
          {draft ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="zn">Nome da zona</Label>
                <Input id="zn" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Ex.: Até 3 km" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nb">Bairros</Label>
                <div className="flex gap-2">
                  <Input
                    id="nb"
                    value={nbInput}
                    onChange={(e) => setNbInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addNeighborhoods();
                      }
                    }}
                    placeholder="Digite e aperte Enter (ou cole separados por vírgula)"
                  />
                  <Button type="button" variant="secondary" onClick={addNeighborhoods}>
                    Adicionar
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {draft.neighborhoods.map((n) => (
                    <span key={n} className="inline-flex items-center gap-1 rounded-full bg-surface-card py-0.5 pl-2.5 pr-1 text-xs">
                      {n}
                      <button type="button" aria-label={`Remover ${n}`} onClick={() => setDraft({ ...draft, neighborhoods: draft.neighborhoods.filter((x) => x !== n) })} className="rounded-full p-0.5 hover:bg-surface-elevated">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <MoneyInput id="fee" label="Taxa" cents={draft.feeCents} onChange={(c) => setDraft({ ...draft, feeCents: c ?? 0 })} />
                <MoneyInput id="zmin" label="Mínimo (opcional)" cents={draft.minOrderCents} onChange={(c) => setDraft({ ...draft, minOrderCents: c })} allowEmpty placeholder="—" />
                <div className="space-y-1.5">
                  <Label htmlFor="eta">Prazo (min)</Label>
                  <Input
                    id="eta"
                    type="number"
                    min={0}
                    className="font-mono"
                    value={draft.etaMinutes ?? ""}
                    onChange={(e) => setDraft({ ...draft, etaMinutes: e.target.value ? Number(e.target.value) : null })}
                  />
                </div>
              </div>
              <label className="flex items-center justify-between rounded-xl border border-border px-4 py-3 text-sm">
                Zona ativa
                <Switch checked={draft.isActive} onCheckedChange={(v) => setDraft({ ...draft, isActive: v })} />
              </label>
              <FormMessage error={error} />
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Salvar zona
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
