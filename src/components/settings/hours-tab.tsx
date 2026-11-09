"use client";

import { useState, useTransition } from "react";
import { Copy, Loader2, Plus, X } from "lucide-react";
import { saveBusinessHoursAction } from "@/features/delivery/actions";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { WEEKDAY_LABEL } from "@/lib/labels";
import type { BusinessHour } from "@/types/domain.types";
import { FormMessage, SettingsSection } from "./shared";

type Slot = { opensAt: string; closesAt: string };
const ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first

export function HoursTab({ storeId, hours, canManage }: { storeId: string; hours: BusinessHour[]; canManage: boolean }) {
  const [week, setWeek] = useState<Record<number, Slot[]>>(() => {
    const w: Record<number, Slot[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    hours.forEach((h) => w[h.weekday].push({ opensAt: h.opens_at.slice(0, 5), closesAt: h.closes_at.slice(0, 5) }));
    return w;
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const alwaysOpen = Object.values(week).every((s) => s.length === 0);

  const update = (day: number, slots: Slot[]) => setWeek((w) => ({ ...w, [day]: slots }));

  function copyToAll(day: number) {
    setWeek((w) => Object.fromEntries(Object.keys(w).map((d) => [d, w[day].map((s) => ({ ...s }))])) as Record<number, Slot[]>);
  }

  function save() {
    setError(null);
    const slots = Object.entries(week).flatMap(([d, s]) => s.map((x) => ({ weekday: Number(d), opensAt: x.opensAt, closesAt: x.closesAt })));
    start(async () => {
      const res = await saveBusinessHoursAction({ storeId, slots });
      if (!res.success) setError(res.error ?? "Erro ao salvar.");
      else toast.success("Horários salvos.");
    });
  }

  return (
    <div>
      <SettingsSection
        title="Horário de funcionamento"
        description="Fora destes horários o cardápio continua visível, mas não recebe pedidos. Para fechar na hora, use o botão Aberto/Fechado no topo do painel. Turno que passa da meia-noite? Ex.: 18:00 → 02:00 funciona."
      >
        {alwaysOpen ? (
          <p className="mb-4 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-foreground-muted">
            Nenhum horário definido: a loja aceita pedidos sempre que estiver marcada como aberta.
          </p>
        ) : null}
        <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
          {ORDER.map((day) => {
            const slots = week[day];
            const open = slots.length > 0;
            return (
              <li key={day} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start">
                <div className="flex w-40 shrink-0 items-center gap-3 pt-1.5">
                  <Switch
                    checked={open}
                    disabled={!canManage}
                    aria-label={`${WEEKDAY_LABEL[day]} aberto`}
                    onCheckedChange={(v) => update(day, v ? [{ opensAt: "18:00", closesAt: "23:00" }] : [])}
                  />
                  <span className={open ? "text-sm font-medium" : "text-sm text-foreground-muted"}>{WEEKDAY_LABEL[day]}</span>
                </div>
                <div className="flex flex-1 flex-col gap-2">
                  {open ? (
                    slots.map((s, i) => (
                      <div key={i} className="flex flex-wrap items-center gap-2">
                        <input
                          type="time"
                          aria-label={`${WEEKDAY_LABEL[day]} abre`}
                          value={s.opensAt}
                          disabled={!canManage}
                          onChange={(e) => update(day, slots.map((x, k) => (k === i ? { ...x, opensAt: e.target.value } : x)))}
                          className="h-9 rounded-lg border border-border bg-background px-2 font-mono text-sm [color-scheme:dark]"
                        />
                        <span className="text-foreground-subtle">→</span>
                        <input
                          type="time"
                          aria-label={`${WEEKDAY_LABEL[day]} fecha`}
                          value={s.closesAt}
                          disabled={!canManage}
                          onChange={(e) => update(day, slots.map((x, k) => (k === i ? { ...x, closesAt: e.target.value } : x)))}
                          className="h-9 rounded-lg border border-border bg-background px-2 font-mono text-sm [color-scheme:dark]"
                        />
                        {s.closesAt <= s.opensAt ? <span className="basis-full text-xs text-foreground-muted xl:basis-auto">até o dia seguinte</span> : null}
                        {canManage && slots.length > 1 ? (
                          <button type="button" aria-label="Remover turno" onClick={() => update(day, slots.filter((_, k) => k !== i))} className="rounded-md p-1 text-foreground-muted hover:text-foreground">
                            <X className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <span className="pt-1.5 text-sm text-foreground-subtle">Fechado</span>
                  )}
                </div>
                {open && canManage ? (
                  <div className="flex shrink-0 gap-1 sm:pt-0.5">
                    <Button variant="ghost" size="sm" onClick={() => update(day, [...slots, { opensAt: "11:00", closesAt: "15:00" }])}>
                      <Plus className="h-3.5 w-3.5" /> Turno
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => copyToAll(day)}>
                      <Copy className="h-3.5 w-3.5" /> Copiar p/ todos
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        <div className="mt-5 flex flex-col items-end gap-3">
          <FormMessage error={error} />
          {canManage ? (
            <Button onClick={save} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Salvar horários
            </Button>
          ) : null}
        </div>
      </SettingsSection>
    </div>
  );
}
