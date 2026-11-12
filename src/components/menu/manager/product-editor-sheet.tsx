"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ImagePlus, Loader2, Plus, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { FormMessage, MoneyInput } from "@/components/settings/shared";
import { ACCEPT_ATTRIBUTE } from "@/lib/images/brand-assets";
import { formatCurrencyCents, parsePriceToCents } from "@/lib/utils";
import type { Category, Product } from "@/types/domain.types";
import type { CatalogActions, ProductPayload } from "./catalog-actions";

interface OptionDraft {
  key: string;
  id?: string;
  name: string;
  price: string;
  isAvailable: boolean;
}

interface GroupDraft {
  key: string;
  id?: string;
  name: string;
  isRequired: boolean;
  minSelect: number;
  maxSelect: number;
  options: OptionDraft[];
}

const NO_CATEGORY = "none";
let seq = 0;
const key = () => `k${++seq}`;
const priceText = (cents: number) => formatCurrencyCents(cents).replace("R$", "").trim();

function toDrafts(product: Product | null): GroupDraft[] {
  return (product?.option_groups ?? []).map((g) => ({
    key: key(),
    id: g.id,
    name: g.name,
    isRequired: g.is_required,
    minSelect: g.min_select,
    maxSelect: g.max_select,
    options: (g.options ?? []).map((o) => ({ key: key(), id: o.id, name: o.name, price: priceText(o.price_cents), isAvailable: o.is_available })),
  }));
}

/**
 * Product editor as a side panel (bottom sheet on phones). Add-on groups are
 * edited inline; ids are sent back so the server keeps the ones that still exist.
 */
export function ProductEditorSheet({
  storeId,
  product,
  defaultCategoryId,
  categories,
  actions,
  onClose,
  onSaved,
  onArchived,
}: {
  storeId: string;
  /** null = new product. */
  product: Product | null;
  defaultCategoryId: string | null;
  categories: Category[];
  actions: CatalogActions;
  onClose: () => void;
  onSaved: (id: string, payload: ProductPayload) => void;
  onArchived: (id: string) => void;
}) {
  const isNew = !product;
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(product?.name ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [categoryId, setCategoryId] = useState<string>(product ? (product.category_id ?? NO_CATEGORY) : (defaultCategoryId ?? NO_CATEGORY));
  const [priceCents, setPriceCents] = useState<number>(product?.price_cents ?? 0);
  const [sku, setSku] = useState(product?.sku ?? "");
  const [imageUrl, setImageUrl] = useState<string | null>(product?.image_url ?? null);
  const [isAvailable, setIsAvailable] = useState(product?.is_available ?? true);
  const [trackStock, setTrackStock] = useState(product?.track_stock ?? false);
  const [stockQuantity, setStockQuantity] = useState(0);
  const [lowStock, setLowStock] = useState(product?.low_stock_threshold ?? 5);
  const [groups, setGroups] = useState<GroupDraft[]>(() => toDrafts(product));
  const [error, setError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [pending, start] = useTransition();

  const patchGroup = (k: string, patch: Partial<GroupDraft>) => setGroups((prev) => prev.map((g) => (g.key === k ? { ...g, ...patch } : g)));
  const patchOption = (gk: string, ok: string, patch: Partial<OptionDraft>) =>
    setGroups((prev) => prev.map((g) => (g.key === gk ? { ...g, options: g.options.map((o) => (o.key === ok ? { ...o, ...patch } : o)) } : g)));

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoError(null);
    setUploading(true);
    const res = await actions.uploadPhoto(storeId, file);
    setUploading(false);
    if (!res.ok) setPhotoError(res.error);
    else setImageUrl(res.url);
  }

  function validate(): string | null {
    if (!name.trim()) return "Dê um nome ao produto.";
    for (const g of groups) {
      if (!g.name.trim()) return "Todo grupo de adicionais precisa de um nome.";
      const filled = g.options.filter((o) => o.name.trim());
      if (!filled.length) return `Adicione pelo menos uma opção em "${g.name}".`;
      if (g.maxSelect < 1) return `Em "${g.name}", o máximo precisa ser pelo menos 1.`;
      if (g.minSelect > g.maxSelect) return `Em "${g.name}", o mínimo não pode passar do máximo.`;
      if (g.maxSelect > filled.length) return `Em "${g.name}", o máximo (${g.maxSelect}) é maior que o número de opções (${filled.length}).`;
    }
    return null;
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    const invalid = validate();
    if (invalid) return setError(invalid);
    setError(null);
    const payload: ProductPayload = {
      storeId,
      categoryId: categoryId === NO_CATEGORY ? null : categoryId,
      sku: sku.trim() || null,
      name: name.trim(),
      description: description.trim() || null,
      priceCents,
      imageUrl,
      isAvailable,
      trackStock,
      stockQuantity: isNew && trackStock ? stockQuantity : 0,
      lowStockThreshold: lowStock,
      optionGroups: groups.map((g) => ({
        id: g.id,
        name: g.name.trim(),
        isRequired: g.isRequired,
        minSelect: g.isRequired ? Math.max(1, g.minSelect) : g.minSelect,
        maxSelect: g.maxSelect,
        options: g.options.filter((o) => o.name.trim()).map((o) => ({ id: o.id, name: o.name.trim(), priceCents: parsePriceToCents(o.price), isAvailable: o.isAvailable })),
      })),
    };
    start(async () => {
      const res = await actions.saveProduct(payload, product?.id);
      if (!res.success || !res.data) setError(res.error ?? "Erro ao salvar produto.");
      else onSaved(res.data.id, payload);
    });
  }

  function archive() {
    if (!product) return;
    start(async () => {
      const res = await actions.archiveProduct(storeId, product.id);
      if (!res.success) {
        setConfirmArchive(false);
        setError(res.error ?? "Não foi possível remover.");
      } else onArchived(product.id);
    });
  }

  return (
    <Sheet open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <SheetContent className="p-0 sm:max-w-xl" aria-describedby="product-editor-description">
        <div className="border-b border-border px-6 py-5 pr-14">
          <SheetTitle className="font-display text-xl font-bold">{isNew ? "Novo produto" : "Editar produto"}</SheetTitle>
          <SheetDescription id="product-editor-description" className="mt-1 text-sm text-foreground-muted">
            {isNew ? "Aparece no cardápio assim que você salvar." : "As mudanças valem na hora para quem está com o cardápio aberto."}
          </SheetDescription>
        </div>

        <form onSubmit={save} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-8 overflow-y-auto px-6 py-6">
            {/* Photo */}
            <section aria-labelledby="pe-photo" className="flex items-center gap-4">
              <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-border bg-surface-card">
                {imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt="Foto atual do produto" className="h-full w-full object-cover" />
                ) : (
                  <div aria-hidden className="flex h-full w-full items-center justify-center text-foreground-subtle">
                    <ImagePlus className="h-6 w-6" />
                  </div>
                )}
                {uploading ? (
                  <div role="status" className="absolute inset-0 flex items-center justify-center bg-background/70">
                    <Loader2 className="h-5 w-5 animate-spin text-brand" />
                    <span className="sr-only">Enviando foto</span>
                  </div>
                ) : null}
              </div>
              <div className="min-w-0">
                <p id="pe-photo" className="text-sm font-medium">
                  Foto
                </p>
                <p className="mt-0.5 text-xs text-foreground-muted">Produtos com foto vendem mais. A imagem é reduzida automaticamente.</p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <input ref={fileRef} type="file" accept={ACCEPT_ATTRIBUTE} className="sr-only" onChange={onPhoto} aria-label={imageUrl ? "Trocar foto" : "Enviar foto"} disabled={uploading} />
                  <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                    <Upload className="h-3.5 w-3.5" /> {imageUrl ? "Trocar" : "Enviar foto"}
                  </Button>
                  {imageUrl ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setImageUrl(null)} disabled={uploading}>
                      <Trash2 className="h-3.5 w-3.5" /> Remover
                    </Button>
                  ) : null}
                </div>
                {photoError ? (
                  <p role="alert" className="mt-2 text-xs text-danger">
                    {photoError}
                  </p>
                ) : null}
              </div>
            </section>

            {/* Basics */}
            <section className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="pe-name">Nome</Label>
                <Input id="pe-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} placeholder="Ex.: Smash duplo" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pe-description">Descrição</Label>
                <Textarea id="pe-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={3} placeholder="Ingredientes e o que faz este prato valer a pena." />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <MoneyInput id="pe-price" label="Preço" cents={priceCents} onChange={(c) => setPriceCents(c ?? 0)} />
                <div className="space-y-1.5">
                  <Label htmlFor="pe-category">Categoria</Label>
                  <Select value={categoryId} onValueChange={setCategoryId}>
                    <SelectTrigger id="pe-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_CATEGORY}>Sem categoria</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-start justify-between gap-6 rounded-xl border border-border bg-surface px-4 py-3">
                <label htmlFor="pe-available" className="cursor-pointer">
                  <span className="block text-sm font-medium">Disponível no cardápio</span>
                  <span className="mt-0.5 block text-xs text-foreground-muted">Desligado, o cliente vê o produto como indisponível.</span>
                </label>
                <Switch id="pe-available" checked={isAvailable} onCheckedChange={setIsAvailable} />
              </div>
            </section>

            {/* Stock */}
            <section aria-labelledby="pe-stock" className="space-y-3">
              <h3 id="pe-stock" className="font-display text-sm font-bold">
                Estoque
              </h3>
              <div className="flex items-start justify-between gap-6 rounded-xl border border-border bg-surface px-4 py-3">
                <label htmlFor="pe-track" className="cursor-pointer">
                  <span className="block text-sm font-medium">Controlar estoque</span>
                  <span className="mt-0.5 block text-xs text-foreground-muted">Cada pedido confirmado baixa a quantidade. Zerou, some do cardápio.</span>
                </label>
                <Switch id="pe-track" checked={trackStock} onCheckedChange={setTrackStock} />
              </div>
              {trackStock ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {isNew ? (
                    <div className="space-y-1.5">
                      <Label htmlFor="pe-qty">Quantidade inicial</Label>
                      <Input id="pe-qty" type="number" min={0} inputMode="numeric" className="font-mono" value={stockQuantity} onChange={(e) => setStockQuantity(Math.max(0, Number(e.target.value) || 0))} />
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium tracking-wide text-foreground-muted">Em estoque agora</p>
                      <p className="flex h-10 items-center gap-3 font-mono text-sm">
                        {product.stock_quantity} un
                        <Link href="/inventory" className="font-sans text-xs text-foreground-muted underline underline-offset-4 hover:text-foreground">
                          Ajustar no Estoque
                        </Link>
                      </p>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label htmlFor="pe-low">Avisar quando chegar em</Label>
                    <Input id="pe-low" type="number" min={0} inputMode="numeric" className="font-mono" value={lowStock} onChange={(e) => setLowStock(Math.max(0, Number(e.target.value) || 0))} />
                  </div>
                </div>
              ) : null}
            </section>

            {/* Add-ons */}
            <section aria-labelledby="pe-addons" className="space-y-3">
              <div>
                <h3 id="pe-addons" className="font-display text-sm font-bold">
                  Adicionais e escolhas
                </h3>
                <p className="mt-0.5 text-xs text-foreground-muted">Ponto da carne, molhos, extras. O valor de cada opção soma no preço.</p>
              </div>

              {groups.map((g, gi) => (
                <fieldset key={g.key} className="space-y-3 rounded-2xl border border-border bg-surface p-4">
                  <legend className="sr-only">Grupo {gi + 1}</legend>
                  <div className="flex items-end gap-2">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Label htmlFor={`${g.key}-name`}>Nome do grupo</Label>
                      <Input id={`${g.key}-name`} value={g.name} onChange={(e) => patchGroup(g.key, { name: e.target.value })} placeholder="Ex.: Ponto da carne" maxLength={80} />
                    </div>
                    <Button type="button" variant="ghost" size="icon" aria-label={`Remover grupo ${g.name || gi + 1}`} onClick={() => setGroups((prev) => prev.filter((x) => x.key !== g.key))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
                    <label className="flex cursor-pointer items-center gap-2.5">
                      <Switch
                        checked={g.isRequired}
                        onCheckedChange={(v) => patchGroup(g.key, { isRequired: v, minSelect: v ? Math.max(1, g.minSelect) : 0 })}
                        aria-label={`Escolha obrigatória em ${g.name || `grupo ${gi + 1}`}`}
                      />
                      Obrigatório
                    </label>
                    <label className="flex items-center gap-2 text-foreground-muted">
                      Mín.
                      <input
                        type="number"
                        min={g.isRequired ? 1 : 0}
                        max={20}
                        value={g.minSelect}
                        onChange={(e) => patchGroup(g.key, { minSelect: Math.max(g.isRequired ? 1 : 0, Number(e.target.value) || 0) })}
                        aria-label={`Mínimo de escolhas em ${g.name || `grupo ${gi + 1}`}`}
                        className="h-9 w-16 rounded-lg border border-border bg-background px-2 text-center font-mono text-sm text-foreground"
                      />
                    </label>
                    <label className="flex items-center gap-2 text-foreground-muted">
                      Máx.
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={g.maxSelect}
                        onChange={(e) => patchGroup(g.key, { maxSelect: Math.max(1, Number(e.target.value) || 1) })}
                        aria-label={`Máximo de escolhas em ${g.name || `grupo ${gi + 1}`}`}
                        className="h-9 w-16 rounded-lg border border-border bg-background px-2 text-center font-mono text-sm text-foreground"
                      />
                    </label>
                  </div>

                  <ul className="space-y-2">
                    {g.options.map((o, oi) => (
                      <li key={o.key} className="flex items-center gap-2">
                        <Input
                          value={o.name}
                          onChange={(e) => patchOption(g.key, o.key, { name: e.target.value })}
                          placeholder="Opção"
                          aria-label={`Nome da opção ${oi + 1} de ${g.name || `grupo ${gi + 1}`}`}
                          className="min-w-0 flex-1"
                          maxLength={80}
                        />
                        <div className="relative w-28 shrink-0">
                          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-foreground-subtle">+R$</span>
                          <Input
                            value={o.price}
                            onChange={(e) => patchOption(g.key, o.key, { price: e.target.value })}
                            onBlur={() => patchOption(g.key, o.key, { price: priceText(parsePriceToCents(o.price)) })}
                            inputMode="decimal"
                            aria-label={`Preço da opção ${o.name || oi + 1}`}
                            className="pl-10 font-mono"
                          />
                        </div>
                        <Switch checked={o.isAvailable} onCheckedChange={(v) => patchOption(g.key, o.key, { isAvailable: v })} aria-label={`Opção ${o.name || oi + 1} disponível`} />
                        <button
                          type="button"
                          aria-label={`Remover opção ${o.name || oi + 1}`}
                          onClick={() => patchGroup(g.key, { options: g.options.filter((x) => x.key !== o.key) })}
                          className="rounded-md p-1.5 text-foreground-muted hover:bg-surface-card hover:text-foreground"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <Button type="button" variant="ghost" size="sm" onClick={() => patchGroup(g.key, { options: [...g.options, { key: key(), name: "", price: "0,00", isAvailable: true }] })}>
                    <Plus className="h-3.5 w-3.5" /> Adicionar opção
                  </Button>
                </fieldset>
              ))}

              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  setGroups((prev) => [...prev, { key: key(), name: "", isRequired: false, minSelect: 0, maxSelect: 1, options: [{ key: key(), name: "", price: "0,00", isAvailable: true }] }])
                }
              >
                <Plus className="h-4 w-4" /> Novo grupo
              </Button>
            </section>

            {/* Advanced */}
            <section className="space-y-1.5">
              <Label htmlFor="pe-sku">Código interno (opcional)</Label>
              <Input id="pe-sku" value={sku} onChange={(e) => setSku(e.target.value)} maxLength={50} className="max-w-[220px] font-mono" placeholder="SKU" />
            </section>
          </div>

          <div className="space-y-3 border-t border-border bg-surface px-6 py-4">
            <FormMessage error={error} />
            <div className="flex items-center justify-between gap-2">
              {!isNew ? (
                <Button type="button" variant="ghost" onClick={() => setConfirmArchive(true)} disabled={pending} className="text-danger hover:bg-danger/10 hover:text-danger">
                  <Trash2 className="h-4 w-4" /> Remover
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={pending || uploading}>
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {isNew ? "Criar produto" : "Salvar"}
                </Button>
              </div>
            </div>
          </div>
        </form>

        <Dialog open={confirmArchive} onOpenChange={setConfirmArchive}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Remover {product?.name}?</DialogTitle>
              <DialogDescription>O produto sai do cardápio e do estoque. Os pedidos antigos que têm este item continuam no histórico.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setConfirmArchive(false)} disabled={pending}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={archive} disabled={pending}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Remover produto
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}
