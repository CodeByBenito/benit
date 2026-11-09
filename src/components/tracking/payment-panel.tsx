"use client";

import { useEffect, useMemo, useState } from "react";
import { initMercadoPago, CardPayment } from "@mercadopago/sdk-react";
import { Check, Copy, Loader2, QrCode, TimerReset } from "lucide-react";
import { createPixCharge, payWithCardAction, type TrackedOrder } from "@/features/checkout/actions";
import { cn, formatCurrencyCents } from "@/lib/utils";

function useCountdown(iso: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!iso) return null;
  const ms = Math.max(0, new Date(iso).getTime() - now);
  return { ms, label: `${String(Math.floor(ms / 60000)).padStart(2, "0")}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}` };
}

let mpInitializedWith: string | null = null;

export function PaymentPanel({ token, order, onPaid }: { token: string; order: TrackedOrder; onPaid: () => void }) {
  const isCard = order.payment_method === "ONLINE_CARD";
  const [pix, setPix] = useState(order.pix);
  const [loadingPix, setLoadingPix] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [cardResult, setCardResult] = useState<string | null>(null);
  const countdown = useCountdown(order.payment_expires_at);
  const expired = countdown?.ms === 0;

  // Generate the Pix QR if it wasn't created at checkout (e.g. MP was briefly unavailable).
  useEffect(() => {
    if (isCard || pix?.qr_code || loadingPix) return;
    setLoadingPix(true);
    createPixCharge(token).then((res) => {
      setLoadingPix(false);
      if (res.success && res.data) setPix({ qr_code: res.data.qrCode, qr_code_base64: res.data.qrCodeBase64, expires_at: res.data.expiresAt });
      else setError(res.error ?? "Não foi possível gerar o Pix.");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCard, token]);

  const publicKey = order.mp_public_key;
  const ready = useMemo(() => {
    if (!isCard || !publicKey) return false;
    if (mpInitializedWith !== publicKey) {
      initMercadoPago(publicKey, { locale: "pt-BR" });
      mpInitializedWith = publicKey;
    }
    return true;
  }, [isCard, publicKey]);

  async function copy() {
    if (!pix?.qr_code) return;
    try {
      await navigator.clipboard.writeText(pix.qr_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copie o código manualmente.");
    }
  }

  if (expired) {
    return (
      <div className="mt-8 rounded-2xl border border-border bg-surface p-6 text-center">
        <TimerReset className="mx-auto h-8 w-8 text-foreground-muted" />
        <p className="mt-3 font-display text-lg font-bold">O prazo de pagamento acabou</p>
        <p className="mt-1 text-sm text-foreground-muted">O pedido será cancelado automaticamente. Você pode fazer um novo pedido no cardápio.</p>
      </div>
    );
  }

  return (
    <div className="mt-8 rounded-2xl border border-border bg-surface p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-foreground-muted">Total a pagar</p>
        {countdown ? (
          <p className={cn("font-mono text-sm", countdown.ms < 120_000 ? "text-warning" : "text-foreground-muted")}>expira em {countdown.label}</p>
        ) : null}
      </div>
      <p className="mt-1 font-display text-display-sm font-extrabold">{formatCurrencyCents(order.total_cents)}</p>

      {isCard ? (
        <div className="mt-6">
          {cardResult ? (
            <p role="status" className="mb-4 rounded-lg bg-surface-card px-3 py-2 text-sm">{cardResult}</p>
          ) : null}
          {ready ? (
            <div className="overflow-hidden rounded-xl bg-white p-2">
              <CardPayment
                initialization={{ amount: order.total_cents / 100 }}
                customization={{ paymentMethods: { maxInstallments: 1 }, visual: { style: { theme: "default" } } }}
                onSubmit={async (data) => {
                  const res = await payWithCardAction({
                    publicToken: token,
                    token: data.token,
                    paymentMethodId: data.payment_method_id,
                    issuerId: data.issuer_id,
                    installments: data.installments,
                    payerEmail: data.payer.email,
                    identificationType: data.payer.identification?.type,
                    identificationNumber: data.payer.identification?.number,
                  });
                  if (!res.success) {
                    setCardResult(res.error ?? "Pagamento não aprovado.");
                    return;
                  }
                  if (res.data?.status === "APPROVED") setCardResult("Pagamento aprovado! Atualizando…");
                  else if (res.data?.status === "REJECTED") setCardResult("Pagamento recusado. Confira os dados ou tente outro cartão.");
                  else setCardResult("Pagamento em análise. Avisaremos aqui assim que for aprovado.");
                  onPaid();
                }}
                onError={() => setCardResult("Não foi possível carregar o formulário do cartão. Recarregue a página.")}
              />
            </div>
          ) : (
            <p className="text-sm text-danger">Pagamento com cartão indisponível no momento. Fale com a loja.</p>
          )}
        </div>
      ) : (
        <div className="mt-6">
          <div className="mx-auto flex aspect-square w-full max-w-[240px] items-center justify-center rounded-2xl bg-cream p-4">
            {pix?.qr_code_base64 ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`data:image/png;base64,${pix.qr_code_base64}`} alt="QR Code Pix para pagamento" className="h-full w-full" />
            ) : loadingPix ? (
              <Loader2 className="h-8 w-8 animate-spin text-cream-muted" />
            ) : (
              <QrCode className="h-10 w-10 text-cream-muted" />
            )}
          </div>
          <ol className="mt-6 space-y-1.5 text-sm text-foreground-muted">
            <li>1. Abra o app do seu banco e escolha <span className="text-foreground">Pix copia e cola</span> ou leia o QR.</li>
            <li>2. Confirme o valor e pague.</li>
            <li>3. Esta tela atualiza sozinha quando o pagamento for aprovado.</li>
          </ol>
          {pix?.qr_code ? (
            <button
              type="button"
              onClick={copy}
              className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Código copiado" : "Copiar código Pix"}
            </button>
          ) : null}
          <p className="mt-4 flex items-center justify-center gap-2 text-xs text-foreground-muted">
            <Loader2 className="h-3 w-3 animate-spin" /> Aguardando confirmação do pagamento…
          </p>
        </div>
      )}
      {error ? <p role="alert" className="mt-4 text-sm text-danger">{error}</p> : null}
    </div>
  );
}
