"use client";

import { useState, useTransition } from "react";
import { AlertCircle, ArrowRight, Loader2, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { slugify } from "@/lib/utils";
import { completeOnboardingAction } from "@/features/auth/actions";

export function OnboardingForm() {
  const [storeName, setStoreName] = useState("");
  const [storeSlug, setStoreSlug] = useState("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleStoreNameChange(value: string) {
    setStoreName(value);
    if (!slugManuallyEdited) {
      setStoreSlug(slugify(value));
    }
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await completeOnboardingAction(formData);
      if (res && !res.success) {
        setError(res.error ?? "Erro ao concluir o cadastro do estabelecimento.");
      }
    });
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      {error && (
        <div className="flex items-start gap-2.5 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label
            htmlFor="organizationName"
            className="block text-xs font-medium text-foreground"
          >
            Nome da Empresa / Grupo
          </label>
          <Input
            id="organizationName"
            name="organizationName"
            placeholder="Ex: Grupo Benit Foods"
            required
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="storeName"
            className="block text-xs font-medium text-foreground"
          >
            Nome do Estabelecimento (Loja)
          </label>
          <Input
            id="storeName"
            name="storeName"
            value={storeName}
            onChange={(e) => handleStoreNameChange(e.target.value)}
            placeholder="Ex: Benit Burger Artesanal"
            required
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="storeSlug"
          className="block text-xs font-medium text-foreground"
        >
          Link Público do Cardápio Digital
        </label>
        <div className="flex items-center rounded-lg border border-border bg-surface focus-within:ring-2 focus-within:ring-brand/60">
          <span className="select-none border-r border-border px-3 py-2 text-xs text-foreground-muted">
            /menu/
          </span>
          <input
            id="storeSlug"
            name="storeSlug"
            value={storeSlug}
            onChange={(e) => {
              setSlugManuallyEdited(true);
              setStoreSlug(slugify(e.target.value));
            }}
            placeholder="benit-burger"
            required
            className="h-10 flex-1 bg-transparent px-3 text-sm text-foreground focus:outline-none"
          />
        </div>
        <p className="text-[11px] text-foreground-muted">
          Seus clientes acessarão seu cardápio através de{" "}
          <span className="font-mono text-brand">
            /menu/{storeSlug || "sua-loja"}
          </span>
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label
            htmlFor="phone"
            className="block text-xs font-medium text-foreground"
          >
            WhatsApp de Atendimento
          </label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            placeholder="(11) 99999-9999"
            required
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="address"
            className="block text-xs font-medium text-foreground"
          >
            Endereço / Bairro (opcional)
          </label>
          <Input
            id="address"
            name="address"
            placeholder="Rua Exemplo, 120 - Centro"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="description"
          className="block text-xs font-medium text-foreground"
        >
          Descrição curta da loja (exibida no cardápio)
        </label>
        <Input
          id="description"
          name="description"
          placeholder="Hambúrgueres artesanais na brasa, porções e bebidas geladas."
        />
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={isPending}>
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Criando ambiente da loja...</span>
          </>
        ) : (
          <>
            <Store className="h-4 w-4" />
            <span>Concluir Configuração e Acessar Painel</span>
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </Button>
    </form>
  );
}

