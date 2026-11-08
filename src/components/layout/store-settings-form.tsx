"use client";

import { useState, useTransition } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  Save,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { slugify } from "@/lib/utils";
import { updateStoreSettingsAction } from "@/features/stores/actions";
import type { Store } from "@/types/domain.types";

export function StoreSettingsForm({ store }: { store: Store }) {
  const [name, setName] = useState(store.name);
  const [slug, setSlug] = useState(store.slug);
  const [description, setDescription] = useState(store.description ?? "");
  const [phone, setPhone] = useState(store.phone ?? "");
  const [whatsapp, setWhatsapp] = useState(store.whatsapp ?? "");
  const [address, setAddress] = useState(store.address ?? "");
  const [logoUrl, setLogoUrl] = useState(store.logo_url ?? "");
  const [bannerUrl, setBannerUrl] = useState(store.banner_url ?? "");
  const [isOpen, setIsOpen] = useState(store.is_open);
  const [isPublished, setIsPublished] = useState(store.is_published);
  const [copied, setCopied] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    startTransition(async () => {
      const res = await updateStoreSettingsAction({
        storeId: store.id,
        name,
        slug: slugify(slug),
        description,
        phone,
        whatsapp,
        address,
        logoUrl,
        bannerUrl,
        isOpen,
        isPublished,
      });

      if (!res.success) {
        setError(res.error ?? "Erro ao salvar configurações.");
      } else {
        setSaved(true);
      }
    });
  }

  function handleCopyPublicLink() {
    const url = `${window.location.origin}/menu/${slug}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {saved && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>Configurações atualizadas com sucesso!</span>
        </div>
      )}

      {/* Public Link Banner */}
      <div className="rounded-xl border border-border bg-surface-card p-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-heading text-sm font-bold text-foreground">
              Link do Cardápio Digital
            </h2>
            <p className="mt-0.5 text-xs text-foreground-muted">
              Compartilhe este link na bio do Instagram e no WhatsApp da loja:{" "}
              <span className="font-mono text-brand">/menu/{slug}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleCopyPublicLink}
            >
              <Copy className="h-3.5 w-3.5" />
              <span>{copied ? "Link Copiado!" : "Copiar Link"}</span>
            </Button>
            <Button type="button" size="sm" asChild>
              <Link href={`/menu/${slug}`} target="_blank">
                <span>Abrir Cardápio</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Store Identity */}
      <div className="rounded-xl border border-border bg-surface-card p-6 space-y-4">
        <h2 className="font-heading text-base font-bold text-foreground">
          Dados do Estabelecimento
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">
              Nome da Loja
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">
              Slug do Cardápio (/menu/...)
            </label>
            <Input
              value={slug}
              onChange={(e) => setSlug(slugify(e.target.value))}
              required
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">
            Descrição da Loja
          </label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Breve apresentação exibida no topo do cardápio digital"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">
              Telefone Principal
            </label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(11) 99999-9999"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">
              WhatsApp de Pedidos
            </label>
            <Input
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="(11) 99999-9999"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">
              Endereço
            </label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Rua, Número, Bairro"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">
              URL da Logo (opcional)
            </label>
            <Input
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">
              URL do Banner (opcional)
            </label>
            <Input
              value={bannerUrl}
              onChange={(e) => setBannerUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>
        </div>
      </div>

      {/* Operational Toggles */}
      <div className="rounded-xl border border-border bg-surface-card p-6 space-y-4">
        <h2 className="font-heading text-base font-bold text-foreground">
          Status de Funcionamento
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border bg-surface p-4">
            <div>
              <p className="text-xs font-semibold text-foreground">
                Loja Aberta para Pedidos
              </p>
              <p className="text-[11px] text-foreground-muted">
                Quando desativado, clientes podem ver o cardápio mas não podem
                finalizar pedidos.
              </p>
            </div>
            <input
              type="checkbox"
              checked={isOpen}
              onChange={(e) => setIsOpen(e.target.checked)}
              className="h-4 w-4 accent-brand"
            />
          </label>

          <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border bg-surface p-4">
            <div>
              <p className="text-xs font-semibold text-foreground">
                Cardápio Digital Publicado
              </p>
              <p className="text-[11px] text-foreground-muted">
                Torna a página pública /menu/{slug} visível para visitantes.
              </p>
            </div>
            <input
              type="checkbox"
              checked={isPublished}
              onChange={(e) => setIsPublished(e.target.checked)}
              className="h-4 w-4 accent-brand"
            />
          </label>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Salvando...</span>
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              <span>Salvar Alterações</span>
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

