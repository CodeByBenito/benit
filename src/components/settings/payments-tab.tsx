"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Link2, Loader2, Unplug } from "lucide-react";
import { saveCheckoutSettingsAction } from "@/features/delivery/actions";
import { disconnectMercadoPagoAction, startMercadoPagoConnectAction, type PaymentAccountStatus } from "@/features/payments/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { PAYMENT_METHOD_LABEL } from "@/lib/labels";
import type { PaymentMethod, Store } from "@/types/domain.types";
import { FormMessage, MoneyInput, SettingsSection, ToggleRow } from "./shared";

const OFFLINE: PaymentMethod[] = ["CASH", "CARD_ON_DELIVERY", "PIX_MANUAL"];

export function PaymentsTab({ store, account, canManage, mpResult }: { store: Store; account: PaymentAccountStatus; canManage: boolean; mpResult?: string }) {
  const [s, setS] = useState({
    minOrderCents: store.min_order_cents,
    defaultEtaMinutes: store.default_eta_minutes,
    acceptsDelivery: store.accepts_delivery,
    acceptsPickup: store.accepts_pickup,
    acceptsDineIn: store.accepts_dine_in,
    offlineMethods: store.offline_methods,
    pixKey: store.pix_key ?? "",
    onlinePaymentEnabled: store.online_payment_enabled,
    paymentWindowMinutes: store.payment_window_minutes,
    notifyOwnerEmail: store.notify_owner_email,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [connecting, startConnecting] = useTransition();
  const set = <K extends keyof typeof s>(k: K, v: (typeof s)[K]) => setS((prev) => ({ ...prev, [k]: v }));

  function save() {
    setError(null);
    startSaving(async () => {
      const res = await saveCheckoutSettingsAction({ storeId: store.id, ...s });
      if (!res.success) setError(res.error ?? "Erro ao salvar.");
      else toast.success("Pagamentos e atendimento salvos.");
    });
  }

  function connect() {
    startConnecting(async () => {
      const res = await startMercadoPagoConnectAction(store.id);
      // On success the action redirects to Mercado Pago; we only get here on error.
      if (res && !res.success) toast.error(res.error ?? "Não foi possível conectar.");
    });
  }

  function disconnect() {
    if (!confirm("Desconectar o Mercado Pago? O pagamento online será desativado.")) return;
    startConnecting(async () => {
      const res = await disconnectMercadoPagoAction(store.id);
      if (!res.success) toast.error(res.error ?? "Erro ao desconectar.");
      else {
        set("onlinePaymentEnabled", false);
        toast.success("Mercado Pago desconectado.");
      }
    });
  }

  return (
    <div>
      {mpResult === "connected" ? <FormMessage success="Mercado Pago conectado! Agora você pode ativar o pagamento online." /> : null}
      {mpResult === "error" ? <FormMessage error="A conexão com o Mercado Pago não foi concluída. Tente novamente." /> : null}

      <SettingsSection
        title="Mercado Pago"
        description="Pix e cartão online caem direto na sua conta. O BENIT nunca fica com o dinheiro dos seus pedidos."
      >
        <div className="rounded-2xl border border-border bg-surface p-5">
          {account.connected ? (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-success" />
                <div>
                  <p className="font-medium">Conta conectada</p>
                  <p className="text-xs text-foreground-muted">
                    ID {account.providerUserId}
                    {account.liveMode === false ? " · modo de teste" : ""}
                  </p>
                </div>
              </div>
              {canManage ? (
                <Button variant="outline" size="sm" onClick={disconnect} disabled={connecting}>
                  <Unplug className="h-4 w-4" /> Desconectar
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {account.status === "REFRESH_FAILED" ? <AlertTriangle className="h-6 w-6 text-warning" /> : <Link2 className="h-6 w-6 text-foreground-muted" />}
                <div>
                  <p className="font-medium">{account.status === "REFRESH_FAILED" ? "Reconecte sua conta" : "Nenhuma conta conectada"}</p>
                  <p className="text-xs text-foreground-muted">
                    {account.status === "REFRESH_FAILED"
                      ? "A conexão expirou e o pagamento online foi desligado. Reconecte para voltar a receber Pix e cartão."
                      : account.configured
                        ? "Leva menos de um minuto."
                        : "A integração ainda não foi configurada no servidor."}
                  </p>
                </div>
              </div>
              {canManage ? (
                <Button onClick={connect} disabled={connecting || !account.configured}>
                  {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Conectar Mercado Pago
                </Button>
              ) : null}
            </div>
          )}
          <div className="mt-4 border-t border-border pt-2">
            <ToggleRow
              label="Aceitar pagamento online"
              description="Pix e cartão no checkout do cardápio."
              checked={s.onlinePaymentEnabled}
              onCheckedChange={(v) => set("onlinePaymentEnabled", v)}
              disabled={!account.connected || !canManage}
            />
            {s.onlinePaymentEnabled ? (
              <div className="max-w-[220px] pb-2">
                <Label htmlFor="win">Prazo para pagar (minutos)</Label>
                <Input
                  id="win"
                  type="number"
                  min={5}
                  max={120}
                  className="mt-1.5 font-mono"
                  value={s.paymentWindowMinutes}
                  onChange={(e) => set("paymentWindowMinutes", Number(e.target.value))}
                />
                <p className="mt-1 text-xs text-foreground-muted">Depois disso o pedido não pago é cancelado.</p>
              </div>
            ) : null}
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Pagar ao receber" description="Formas aceitas na entrega, na retirada ou na mesa.">
        <div className="divide-y divide-border rounded-2xl border border-border bg-surface px-5">
          {OFFLINE.map((m) => (
            <ToggleRow
              key={m}
              label={PAYMENT_METHOD_LABEL[m]}
              checked={s.offlineMethods.includes(m)}
              onCheckedChange={(v) => set("offlineMethods", v ? [...s.offlineMethods, m] : s.offlineMethods.filter((x) => x !== m))}
              disabled={!canManage}
            />
          ))}
        </div>
        {s.offlineMethods.includes("PIX_MANUAL") ? (
          <div className="mt-4 max-w-md space-y-1.5">
            <Label htmlFor="pix">Chave Pix exibida ao cliente</Label>
            <Input id="pix" value={s.pixKey} onChange={(e) => set("pixKey", e.target.value)} placeholder="CNPJ, e-mail, telefone ou chave aleatória" />
          </div>
        ) : null}
      </SettingsSection>

      <SettingsSection title="Atendimento" description="Como o cliente pode receber o pedido.">
        <div className="divide-y divide-border rounded-2xl border border-border bg-surface px-5">
          <ToggleRow label="Entrega" checked={s.acceptsDelivery} onCheckedChange={(v) => set("acceptsDelivery", v)} disabled={!canManage} />
          <ToggleRow label="Retirada no local" checked={s.acceptsPickup} onCheckedChange={(v) => set("acceptsPickup", v)} disabled={!canManage} />
          <ToggleRow label="Pedido na mesa" checked={s.acceptsDineIn} onCheckedChange={(v) => set("acceptsDineIn", v)} disabled={!canManage} />
        </div>
        <div className="mt-4 grid max-w-md gap-4 sm:grid-cols-2">
          <MoneyInput id="min" label="Pedido mínimo" cents={s.minOrderCents} onChange={(c) => set("minOrderCents", c ?? 0)} />
          <div className="space-y-1.5">
            <Label htmlFor="eta">Tempo médio de preparo + entrega (min)</Label>
            <Input id="eta" type="number" min={0} max={600} className="font-mono" value={s.defaultEtaMinutes} onChange={(e) => set("defaultEtaMinutes", Number(e.target.value))} />
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Avisos" description="Notificações para o dono da loja.">
        <div className="rounded-2xl border border-border bg-surface px-5">
          <ToggleRow label="E-mail a cada novo pedido" checked={s.notifyOwnerEmail} onCheckedChange={(v) => set("notifyOwnerEmail", v)} disabled={!canManage} />
        </div>
      </SettingsSection>

      <div className="sticky bottom-4 z-10 mt-2 flex flex-col items-end gap-3">
        <FormMessage error={error} />
        {canManage ? (
          <Button onClick={save} disabled={saving} size="lg" className="shadow-float">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Salvar alterações
          </Button>
        ) : (
          <p className="text-sm text-foreground-muted">Apenas proprietário ou gerente podem alterar.</p>
        )}
      </div>
    </div>
  );
}
