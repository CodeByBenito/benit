"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Check, Copy, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { createBrandImageIO } from "@/features/stores/brand-image-client";
import { updateStoreSettingsAction } from "@/features/stores/actions";
import { slugify } from "@/lib/utils";
import type { Store } from "@/types/domain.types";
import { ImageUploadField, type BrandImageIO } from "./image-upload";
import { FormMessage, SettingsSection, ToggleRow } from "./shared";

/**
 * "Loja" tab: identity (logo, cover, name), public link, contact and the two
 * switches that decide whether customers can see the menu and order.
 */
export function StoreTab({ store, canManage, imageIO }: { store: Store; canManage: boolean; imageIO?: BrandImageIO }) {
  const [s, setS] = useState({
    name: store.name,
    slug: store.slug,
    description: store.description ?? "",
    phone: store.phone ?? "",
    whatsapp: store.whatsapp ?? "",
    address: store.address ?? "",
    isOpen: store.is_open,
    isPublished: store.is_published,
  });
  const [logoUrl, setLogoUrl] = useState(store.logo_url);
  const [bannerUrl, setBannerUrl] = useState(store.banner_url);
  const [savedSlug, setSavedSlug] = useState(store.slug);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saving, startSaving] = useTransition();
  const io = useMemo(() => imageIO ?? createBrandImageIO(store.id), [imageIO, store.id]);
  const set = <K extends keyof typeof s>(k: K, v: (typeof s)[K]) => setS((prev) => ({ ...prev, [k]: v }));

  const slugChanged = s.slug !== savedSlug;
  const publicPath = `/menu/${savedSlug}`;

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startSaving(async () => {
      const slug = slugify(s.slug);
      const res = await updateStoreSettingsAction({ storeId: store.id, ...s, slug });
      if (!res.success) setError(res.error ?? "Erro ao salvar.");
      else {
        set("slug", slug);
        setSavedSlug(slug);
        toast.success("Dados da loja salvos.");
      }
    });
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${publicPath}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar. Selecione o link e copie manualmente.");
    }
  }

  return (
    <form onSubmit={save}>
      <SettingsSection title="Link do cardápio" description="É o endereço que você coloca na bio do Instagram, no WhatsApp e no QR code das mesas.">
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 truncate font-mono text-sm">
            <span className="text-foreground-subtle">/menu/</span>
            <span className="text-brand">{savedSlug}</span>
          </p>
          <div className="flex shrink-0 gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={copyLink}>
              {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copiado" : "Copiar link"}
            </Button>
            <Button type="button" variant="secondary" size="sm" asChild>
              <Link href={publicPath} target="_blank" rel="noopener">
                Abrir
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
        {!s.isPublished ? <p className="mt-2 text-xs text-warning">O cardápio está despublicado: quem abrir o link verá "página não encontrada".</p> : null}
      </SettingsSection>

      <SettingsSection title="Identidade" description="Como a loja aparece para o cliente no cardápio, no acompanhamento do pedido e quando o link é compartilhado.">
        <div className="space-y-6">
          <ImageUploadField kind="logo" value={logoUrl} onChange={(url) => { setLogoUrl(url); toast.success(url ? "Logo atualizado." : "Logo removido."); }} io={io} disabled={!canManage} fallbackInitial={s.name.charAt(0).toUpperCase()} />
          <ImageUploadField kind="banner" value={bannerUrl} onChange={(url) => { setBannerUrl(url); toast.success(url ? "Capa atualizada." : "Capa removida."); }} io={io} disabled={!canManage} />
          <div className="space-y-1.5">
            <Label htmlFor="store-name">Nome da loja</Label>
            <Input id="store-name" value={s.name} onChange={(e) => set("name", e.target.value)} required maxLength={80} disabled={!canManage} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="store-description">Descrição</Label>
            <Textarea
              id="store-description"
              value={s.description}
              onChange={(e) => set("description", e.target.value)}
              maxLength={400}
              rows={3}
              placeholder="Uma ou duas frases sobre a casa. Aparece logo abaixo do nome no cardápio."
              disabled={!canManage}
            />
            <p className="text-right font-mono text-[11px] text-foreground-subtle">{s.description.length}/400</p>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Endereço do cardápio" description="Letras minúsculas, números e hífens. Escolha algo curto e fácil de ditar.">
        <div className="space-y-1.5">
          <Label htmlFor="store-slug">Identificador</Label>
          <div className="flex items-center rounded-lg border border-border bg-surface focus-within:border-brand/60 focus-within:ring-2 focus-within:ring-brand/25">
            <span className="pl-3 font-mono text-sm text-foreground-subtle">/menu/</span>
            <input
              id="store-slug"
              value={s.slug}
              onChange={(e) => set("slug", slugify(e.target.value))}
              required
              maxLength={60}
              disabled={!canManage}
              className="h-10 w-full min-w-0 bg-transparent pr-3 font-mono text-sm text-foreground outline-none disabled:opacity-50"
            />
          </div>
          {slugChanged ? (
            <p className="text-xs text-warning">Ao salvar, o link antigo (/menu/{savedSlug}) para de funcionar. Atualize a bio, o WhatsApp e os QR codes impressos.</p>
          ) : null}
        </div>
      </SettingsSection>

      <SettingsSection title="Contato" description="O WhatsApp é usado no botão de falar com a loja e nas mensagens de aviso ao cliente.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="store-phone">Telefone</Label>
            <Input id="store-phone" value={s.phone} onChange={(e) => set("phone", e.target.value)} inputMode="tel" autoComplete="tel" placeholder="(11) 3333-4444" disabled={!canManage} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="store-whatsapp">WhatsApp de pedidos</Label>
            <Input id="store-whatsapp" value={s.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} inputMode="tel" placeholder="(11) 99999-9999" disabled={!canManage} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="store-address">Endereço</Label>
            <Input id="store-address" value={s.address} onChange={(e) => set("address", e.target.value)} maxLength={250} autoComplete="street-address" placeholder="Rua, número, bairro e cidade" disabled={!canManage} />
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Funcionamento" description="Os horários de cada dia ficam na aba Horários. Estes dois interruptores valem na hora.">
        <div className="divide-y divide-border rounded-2xl border border-border bg-surface px-5">
          <ToggleRow
            label="Loja aberta para pedidos"
            description="Desligado, o cliente vê o cardápio mas não consegue fechar o pedido. Use para pausar em um dia de casa cheia."
            checked={s.isOpen}
            onCheckedChange={(v) => set("isOpen", v)}
            disabled={!canManage}
          />
          <ToggleRow
            label="Cardápio publicado"
            description="Desligado, o link do cardápio deixa de existir para o público e sai dos buscadores."
            checked={s.isPublished}
            onCheckedChange={(v) => set("isPublished", v)}
            disabled={!canManage}
          />
        </div>
      </SettingsSection>

      <div className="sticky bottom-4 z-10 mt-2 flex flex-col items-end gap-3">
        <FormMessage error={error} />
        {canManage ? (
          <Button type="submit" disabled={saving} size="lg" className="shadow-float">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Salvar alterações
          </Button>
        ) : (
          <p className="text-sm text-foreground-muted">Apenas proprietário ou gerente podem alterar.</p>
        )}
      </div>
    </form>
  );
}
