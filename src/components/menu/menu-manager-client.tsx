"use client";

import { useMemo, useState, useTransition } from "react";
import {
  AlertCircle,
  Edit3,
  FolderPlus,
  Image as ImageIcon,
  Loader2,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatCurrencyCents, parsePriceToCents } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  createCategoryAction,
  deleteCategoryAction,
} from "@/features/categories/actions";
import {
  deleteOrArchiveProductAction,
  saveProductAction,
  toggleProductAvailabilityAction,
} from "@/features/products/actions";
import type { Category, Product } from "@/types/domain.types";

interface OptionDraft {
  name: string;
  priceFormatted: string;
  isAvailable: boolean;
}

interface OptionGroupDraft {
  name: string;
  minSelect: number;
  maxSelect: number;
  isRequired: boolean;
  options: OptionDraft[];
}

interface MenuManagerClientProps {
  storeId: string;
  storeSlug: string;
  categories: Category[];
  products: Product[];
}

export function MenuManagerClient({
  storeId,
  categories,
  products,
}: MenuManagerClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("ALL");
  const [availabilityFilter, setAvailabilityFilter] = useState<
    "ALL" | "AVAILABLE" | "UNAVAILABLE"
  >("ALL");

  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [catName, setCatName] = useState("");
  const [catDesc, setCatDesc] = useState("");
  const [catSortOrder, setCatSortOrder] = useState(categories.length * 10);

  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Product Form State
  const [prodName, setProdName] = useState("");
  const [prodSku, setProdSku] = useState("");
  const [prodDesc, setProdDesc] = useState("");
  const [prodCategoryId, setProdCategoryId] = useState("");
  const [prodPriceStr, setProdPriceStr] = useState("");
  const [prodImageUrl, setProdImageUrl] = useState("");
  const [prodAvailable, setProdAvailable] = useState(true);
  const [prodTrackStock, setProdTrackStock] = useState(true);
  const [prodStockQty, setProdStockQty] = useState(20);
  const [prodLowStock, setProdLowStock] = useState(5);
  const [optionGroups, setOptionGroups] = useState<OptionGroupDraft[]>([]);

  const [uploadingImage, setUploadingImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.sku ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.description ?? "").toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCategory =
        selectedCategoryId === "ALL" || p.category_id === selectedCategoryId;

      const matchesAvailability =
        availabilityFilter === "ALL" ||
        (availabilityFilter === "AVAILABLE" && p.is_available) ||
        (availabilityFilter === "UNAVAILABLE" && !p.is_available);

      return matchesSearch && matchesCategory && matchesAvailability;
    });
  }, [products, searchQuery, selectedCategoryId, availabilityFilter]);

  function openNewProductModal() {
    setEditingProduct(null);
    setProdName("");
    setProdSku(`SKU-${Math.floor(1000 + Math.random() * 9000)}`);
    setProdDesc("");
    setProdCategoryId(categories[0]?.id ?? "");
    setProdPriceStr("29,90");
    setProdImageUrl("");
    setProdAvailable(true);
    setProdTrackStock(true);
    setProdStockQty(25);
    setProdLowStock(5);
    setOptionGroups([]);
    setError(null);
    setProductModalOpen(true);
  }

  function openEditProductModal(product: Product) {
    setEditingProduct(product);
    setProdName(product.name);
    setProdSku(product.sku ?? "");
    setProdDesc(product.description ?? "");
    setProdCategoryId(product.category_id ?? "");
    setProdPriceStr((product.price_cents / 100).toFixed(2).replace(".", ","));
    setProdImageUrl(product.image_url ?? "");
    setProdAvailable(product.is_available);
    setProdTrackStock(product.track_stock);
    setProdStockQty(product.stock_quantity);
    setProdLowStock(product.low_stock_threshold);
    setOptionGroups(
      (product.option_groups ?? []).map((g) => ({
        name: g.name,
        minSelect: g.min_select,
        maxSelect: g.max_select,
        isRequired: g.is_required,
        options: (g.options ?? []).map((o) => ({
          name: o.name,
          priceFormatted: (o.price_cents / 100).toFixed(2).replace(".", ","),
          isAvailable: o.is_available,
        })),
      }))
    );
    setError(null);
    setProductModalOpen(true);
  }

  async function handleImageFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    setError(null);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() || "jpg";
      const filePath = `${storeId}/products/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 7)}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from("benit-assets")
        .upload(filePath, file, { upsert: true });

      if (uploadErr) {
        setError(`Falha no upload da imagem: ${uploadErr.message}`);
      } else {
        const { data } = supabase.storage
          .from("benit-assets")
          .getPublicUrl(filePath);
        setProdImageUrl(data.publicUrl);
      }
    } catch {
      setError("Erro ao enviar imagem para o Supabase Storage.");
    } finally {
      setUploadingImage(false);
    }
  }

  function handleSaveCategory(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createCategoryAction({
        storeId,
        name: catName,
        description: catDesc,
        sortOrder: catSortOrder,
        isActive: true,
      });
      if (!res.success) {
        setError(res.error ?? "Erro ao criar categoria.");
      } else {
        setCatName("");
        setCatDesc("");
        setCategoryModalOpen(false);
      }
    });
  }

  function handleSaveProduct(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const priceCents = parsePriceToCents(prodPriceStr);

    startTransition(async () => {
      const res = await saveProductAction(
        {
          storeId,
          categoryId: prodCategoryId || null,
          sku: prodSku || null,
          name: prodName,
          description: prodDesc || null,
          priceCents,
          imageUrl: prodImageUrl || null,
          isAvailable: prodAvailable,
          trackStock: prodTrackStock,
          stockQuantity: prodStockQty,
          lowStockThreshold: prodLowStock,
          sortOrder: 0,
          optionGroups: optionGroups.map((g) => ({
            name: g.name,
            minSelect: g.minSelect,
            maxSelect: g.maxSelect,
            isRequired: g.isRequired,
            options: g.options
              .filter((o) => o.name.trim().length > 0)
              .map((o) => ({
                name: o.name,
                priceCents: parsePriceToCents(o.priceFormatted),
                isAvailable: o.isAvailable,
              })),
          })),
        },
        editingProduct?.id
      );

      if (!res.success) {
        setError(res.error ?? "Erro ao salvar produto.");
      } else {
        setProductModalOpen(false);
      }
    });
  }

  function handleToggleAvailability(product: Product) {
    startTransition(async () => {
      await toggleProductAvailabilityAction(
        storeId,
        product.id,
        !product.is_available
      );
    });
  }

  function handleDeleteProduct(product: Product) {
    if (!confirm(`Deseja remover "${product.name}" do cardápio?`)) return;
    startTransition(async () => {
      await deleteOrArchiveProductAction(storeId, product.id);
    });
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-display text-display-sm font-extrabold sm:text-3xl">
            Gestão de Produtos & Cardápio
          </h1>
          <p className="text-xs text-foreground-muted">
            Organize categorias, produtos, preços, opcionais e disponibilidade
            no cardápio digital.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setCategoryModalOpen(true)}
          >
            <FolderPlus className="h-4 w-4 text-brand" />
            <span>Nova Categoria</span>
          </Button>
          <Button size="sm" onClick={openNewProductModal}>
            <Plus className="h-4 w-4" />
            <span>Adicionar Produto</span>
          </Button>
        </div>
      </div>

      {/* Category Chips Strip */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface p-3">
        <button
          type="button"
          onClick={() => setSelectedCategoryId("ALL")}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            selectedCategoryId === "ALL"
              ? "bg-brand text-white"
              : "bg-surface text-foreground-muted hover:text-foreground"
          }`}
        >
          Todas ({products.length})
        </button>
        {categories.map((cat) => {
          const count = products.filter((p) => p.category_id === cat.id).length;
          const isSelected = selectedCategoryId === cat.id;
          return (
            <div
              key={cat.id}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                isSelected
                  ? "border-brand bg-brand/15 text-brand"
                  : "border-border bg-surface text-foreground-muted hover:text-foreground"
              }`}
            >
              <button
                type="button"
                onClick={() => setSelectedCategoryId(cat.id)}
                className="flex items-center gap-1.5"
              >
                <span>{cat.name}</span>
                <span className="tabular-nums opacity-75">({count})</span>
              </button>
              <button
                type="button"
                title="Excluir categoria"
                onClick={() => {
                  if (confirm(`Remover categoria "${cat.name}"?`)) {
                    startTransition(async () => {
                      await deleteCategoryAction(storeId, cat.id);
                    });
                  }
                }}
                className="ml-1 text-foreground-muted/60 hover:text-danger"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Filters & Search Bar */}
      <div className="flex flex-col justify-between gap-3 rounded-2xl border border-border bg-surface p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-foreground-muted" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar produto por nome, código SKU ou descrição..."
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2">
          {(
            [
              { key: "ALL", label: "Todos" },
              { key: "AVAILABLE", label: "Ativos" },
              { key: "UNAVAILABLE", label: "Pausados" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setAvailabilityFilter(tab.key)}
              className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                availabilityFilter === tab.key
                  ? "bg-brand/15 text-brand border border-brand/30"
                  : "bg-surface text-foreground-muted hover:text-foreground border border-border"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Products Management Table (ShopPoint reference style) */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        {filteredProducts.length === 0 ? (
          <div className="p-12 text-center">
            <ImageIcon className="mx-auto h-10 w-10 text-foreground-muted" />
            <h3 className="mt-3 font-display text-base font-bold text-foreground">
              Nenhum produto encontrado
            </h3>
            <p className="mx-auto mt-1 max-w-md text-xs text-foreground-muted">
              Cadastre seus produtos com fotos, preços e adicionais para que
              apareçam imediatamente no seu cardápio digital e no lançamento de
              pedidos.
            </p>
            <Button size="sm" className="mt-4" onClick={openNewProductModal}>
              <Plus className="h-4 w-4" />
              <span>Criar Primeiro Produto</span>
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-surface text-[11px] uppercase tracking-wider text-foreground-muted">
                  <th className="px-4 py-3.5 font-semibold">Produto</th>
                  <th className="px-4 py-3.5 font-semibold">SKU</th>
                  <th className="px-4 py-3.5 font-semibold">Categoria</th>
                  <th className="px-4 py-3.5 font-semibold">Estoque</th>
                  <th className="px-4 py-3.5 font-semibold">Preço</th>
                  <th className="px-4 py-3.5 font-semibold">Status</th>
                  <th className="px-4 py-3.5 text-right font-semibold">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredProducts.map((product) => {
                  const categoryName =
                    categories.find((c) => c.id === product.category_id)
                      ?.name ?? "Sem categoria";
                  const isOut =
                    product.track_stock && product.stock_quantity === 0;
                  const isLow =
                    product.track_stock &&
                    product.stock_quantity > 0 &&
                    product.stock_quantity <= product.low_stock_threshold;

                  return (
                    <tr
                      key={product.id}
                      className="transition-colors hover:bg-surface/60"
                    >
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface">
                            {product.image_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={product.image_url}
                                alt={product.name}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <ImageIcon className="h-4 w-4 text-foreground-muted" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-foreground">
                              {product.name}
                            </p>
                            {product.description && (
                              <p className="max-w-xs truncate text-[11px] text-foreground-muted">
                                {product.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-foreground-muted">
                        {product.sku || "—"}
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge variant="secondary">{categoryName}</Badge>
                      </td>
                      <td className="px-4 py-3.5 tabular-nums">
                        {!product.track_stock ? (
                          <span className="text-foreground-muted">Livre</span>
                        ) : isOut ? (
                          <span className="font-semibold text-danger">
                            Esgotado (0)
                          </span>
                        ) : isLow ? (
                          <span className="font-semibold text-warning">
                            Baixo ({product.stock_quantity} un.)
                          </span>
                        ) : (
                          <span className="font-medium text-success">
                            Em estoque ({product.stock_quantity} un.)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 font-display font-bold text-foreground tabular-nums">
                        {formatCurrencyCents(product.price_cents)}
                      </td>
                      <td className="px-4 py-3.5">
                        <button
                          type="button"
                          onClick={() => handleToggleAvailability(product)}
                          disabled={isPending}
                          className="cursor-pointer"
                        >
                          <Badge
                            variant={
                              product.is_available && !isOut
                                ? "success"
                                : "danger"
                            }
                          >
                            {product.is_available && !isOut
                              ? "Publicado"
                              : "Indisponível"}
                          </Badge>
                        </button>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditProductModal(product)}
                            title="Editar produto"
                          >
                            <Edit3 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteProduct(product)}
                            title="Arquivar/Remover produto"
                            className="hover:text-danger"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Category Modal */}
      {categoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface-card p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <h2 className="font-display text-lg font-bold text-foreground">
                Nova Categoria do Cardápio
              </h2>
              <button
                type="button"
                onClick={() => setCategoryModalOpen(false)}
                className="text-foreground-muted hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="mt-4 space-y-4">
              {error && (
                <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-foreground">
                  Nome da Categoria
                </label>
                <Input
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  placeholder="Ex: Burgers Artesanais, Pizzas, Bebidas"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-foreground">
                  Descrição (opcional)
                </label>
                <Input
                  value={catDesc}
                  onChange={(e) => setCatDesc(e.target.value)}
                  placeholder="Todos acompanham maionese da casa"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-foreground">
                  Ordem de Exibição
                </label>
                <Input
                  type="number"
                  value={catSortOrder}
                  onChange={(e) => setCatSortOrder(Number(e.target.value))}
                  min={0}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setCategoryModalOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Salvar Categoria"
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Product Create / Edit Modal */}
      {productModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm">
          <div className="my-8 w-full max-w-2xl rounded-2xl border border-border bg-surface-card p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <h2 className="font-display text-lg font-bold text-foreground">
                {editingProduct ? "Editar Produto" : "Novo Produto"}
              </h2>
              <button
                type="button"
                onClick={() => setProductModalOpen(false)}
                className="text-foreground-muted hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="mt-4 space-y-5">
              {error && (
                <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="block text-xs font-medium text-foreground">
                    Nome do Produto
                  </label>
                  <Input
                    value={prodName}
                    onChange={(e) => setProdName(e.target.value)}
                    placeholder="Ex: Classic Smash Burger Duplo"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-foreground">
                    Preço (R$)
                  </label>
                  <Input
                    value={prodPriceStr}
                    onChange={(e) => setProdPriceStr(e.target.value)}
                    placeholder="34,90"
                    required
                    className="tabular-nums font-semibold"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-foreground">
                    Categoria
                  </label>
                  <select
                    value={prodCategoryId}
                    onChange={(e) => setProdCategoryId(e.target.value)}
                    className="flex h-10 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/60"
                  >
                    <option value="">Sem categoria</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-foreground">
                    Código SKU (opcional)
                  </label>
                  <Input
                    value={prodSku}
                    onChange={(e) => setProdSku(e.target.value)}
                    placeholder="BRG-001"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-foreground">
                  Descrição e Ingredientes
                </label>
                <Input
                  value={prodDesc}
                  onChange={(e) => setProdDesc(e.target.value)}
                  placeholder="Pão brioche selado na manteiga, 2 blends 90g, queijo cheddar inglês, picles e molho especial."
                />
              </div>

              {/* Image URL or Upload */}
              <div className="space-y-2 rounded-xl border border-border bg-surface p-4">
                <label className="block text-xs font-semibold text-foreground">
                  Imagem do Produto
                </label>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Input
                    value={prodImageUrl}
                    onChange={(e) => setProdImageUrl(e.target.value)}
                    placeholder="Cole uma URL de imagem (https://...) ou envie um arquivo"
                    className="flex-1"
                  />
                  <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-surface-card px-3 py-2 text-xs font-medium text-foreground hover:border-brand/50">
                    {uploadingImage ? (
                      <Loader2 className="h-4 w-4 animate-spin text-brand" />
                    ) : (
                      <Upload className="h-4 w-4 text-brand" />
                    )}
                    <span>{uploadingImage ? "Enviando..." : "Upload"}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageFileChange}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* Inventory Configuration */}
              <div className="rounded-xl border border-border bg-surface p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-foreground">
                      Controle de Estoque por Produto
                    </p>
                    <p className="text-[11px] text-foreground-muted">
                      Deduz automaticamente ao confirmar pedidos e bloqueia
                      vendas quando zerado.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={prodTrackStock}
                    onChange={(e) => setProdTrackStock(e.target.checked)}
                    className="h-4 w-4 accent-brand"
                  />
                </div>

                {prodTrackStock && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {!editingProduct && (
                      <div className="space-y-1.5">
                        <label className="block text-xs font-medium text-foreground">
                          Quantidade Inicial em Estoque
                        </label>
                        <Input
                          type="number"
                          min={0}
                          value={prodStockQty}
                          onChange={(e) =>
                            setProdStockQty(Number(e.target.value))
                          }
                          className="tabular-nums"
                        />
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-foreground">
                        Alerta de Estoque Baixo (unidades)
                      </label>
                      <Input
                        type="number"
                        min={0}
                        value={prodLowStock}
                        onChange={(e) =>
                          setProdLowStock(Number(e.target.value))
                        }
                        className="tabular-nums"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Product Options & Add-ons */}
              <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-foreground">
                      Grupos de Opcionais / Adicionais
                    </p>
                    <p className="text-[11px] text-foreground-muted">
                      Ex: Ponto da Carne, Adicionais Extras, Borda Recheada
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      setOptionGroups((prev) => [
                        ...prev,
                        {
                          name: "Adicionais",
                          minSelect: 0,
                          maxSelect: 3,
                          isRequired: false,
                          options: [
                            {
                              name: "Bacon Crocante",
                              priceFormatted: "6,00",
                              isAvailable: true,
                            },
                          ],
                        },
                      ])
                    }
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Novo Grupo</span>
                  </Button>
                </div>

                {optionGroups.map((group, gIdx) => (
                  <div
                    key={gIdx}
                    className="space-y-3 rounded-lg border border-border bg-surface-card p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Input
                        value={group.name}
                        onChange={(e) => {
                          const next = [...optionGroups];
                          next[gIdx].name = e.target.value;
                          setOptionGroups(next);
                        }}
                        placeholder="Nome do Grupo (ex: Escolha o Ponto)"
                        className="h-8 text-xs"
                      />
                      <label className="flex items-center gap-1.5 text-[11px] text-foreground-muted whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={group.isRequired}
                          onChange={(e) => {
                            const next = [...optionGroups];
                            next[gIdx].isRequired = e.target.checked;
                            next[gIdx].minSelect = e.target.checked ? 1 : 0;
                            setOptionGroups(next);
                          }}
                          className="accent-brand"
                        />
                        Obrigatório
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setOptionGroups(
                            optionGroups.filter((_, i) => i !== gIdx)
                          )
                        }
                        className="text-foreground-muted hover:text-danger"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="space-y-2 pl-2">
                      {group.options.map((opt, oIdx) => (
                        <div key={oIdx} className="flex items-center gap-2">
                          <Input
                            value={opt.name}
                            onChange={(e) => {
                              const next = [...optionGroups];
                              next[gIdx].options[oIdx].name = e.target.value;
                              setOptionGroups(next);
                            }}
                            placeholder="Nome da opção (ex: Cheddar Extra)"
                            className="h-8 flex-1 text-xs"
                          />
                          <Input
                            value={opt.priceFormatted}
                            onChange={(e) => {
                              const next = [...optionGroups];
                              next[gIdx].options[oIdx].priceFormatted =
                                e.target.value;
                              setOptionGroups(next);
                            }}
                            placeholder="0,00"
                            className="h-8 w-24 text-xs tabular-nums"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const next = [...optionGroups];
                              next[gIdx].options = next[gIdx].options.filter(
                                (_, i) => i !== oIdx
                              );
                              setOptionGroups(next);
                            }}
                            className="text-foreground-muted hover:text-danger"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          const next = [...optionGroups];
                          next[gIdx].options.push({
                            name: "",
                            priceFormatted: "0,00",
                            isAvailable: true,
                          });
                          setOptionGroups(next);
                        }}
                        className="text-[11px] font-medium text-brand hover:underline"
                      >
                        + Adicionar item opcional
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-2">
                <label className="flex items-center gap-2 text-xs font-medium text-foreground">
                  <input
                    type="checkbox"
                    checked={prodAvailable}
                    onChange={(e) => setProdAvailable(e.target.checked)}
                    className="h-4 w-4 accent-brand"
                  />
                  Disponível para venda imediata no cardápio
                </label>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setProductModalOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={isPending}>
                    {isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : editingProduct ? (
                      "Salvar Alterações"
                    ) : (
                      "Cadastrar Produto"
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

