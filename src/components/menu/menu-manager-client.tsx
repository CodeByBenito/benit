"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { EyeOff, FolderPlus, GripVertical, ImageIcon, Loader2, Pencil, Plus, Search, Trash2, UtensilsCrossed } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { FormMessage } from "@/components/settings/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { cn, formatCurrencyCents } from "@/lib/utils";
import type { Category, Product } from "@/types/domain.types";
import { serverCatalogActions, type CatalogActions, type ProductPayload } from "./manager/catalog-actions";
import { ProductEditorSheet } from "./manager/product-editor-sheet";

interface MenuManagerClientProps {
  storeId: string;
  storeSlug: string;
  categories: Category[];
  products: Product[];
  actions?: CatalogActions;
}

type Availability = "ALL" | "AVAILABLE" | "PAUSED";
const UNCATEGORIZED = "uncategorized";

const bySort = <T extends { sort_order: number; created_at: string }>(a: T, b: T) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at);

/**
 * Menu manager: one list per category, drag to reorder (categories and the
 * products inside each one), availability switch with optimistic response
 * and the product editor in a side panel.
 */
export function MenuManagerClient({ storeId, storeSlug, categories: initialCategories, products: initialProducts, actions = serverCatalogActions }: MenuManagerClientProps) {
  const router = useRouter();
  const dndId = useId();
  const [categories, setCategories] = useState(() => [...initialCategories].sort(bySort));
  const [products, setProducts] = useState(() => [...initialProducts].sort(bySort));
  const [query, setQuery] = useState("");
  const [availability, setAvailability] = useState<Availability>("ALL");
  const [editor, setEditor] = useState<{ product: Product | null; categoryId: string | null } | null>(null);
  const [categoryDialog, setCategoryDialog] = useState<{ category: Category | null } | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [pending, start] = useTransition();

  // Server data wins whenever its content changes (after a save or an edit on
  // another device). Compared by content: a re-render that brings the same rows
  // must not undo what was just done on screen.
  const categoriesSignature = useMemo(() => JSON.stringify(initialCategories), [initialCategories]);
  const productsSignature = useMemo(() => JSON.stringify(initialProducts), [initialProducts]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setCategories([...initialCategories].sort(bySort)), [categoriesSignature]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setProducts([...initialProducts].sort(bySort)), [productsSignature]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const filtering = query.trim() !== "" || availability !== "ALL";
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (availability === "AVAILABLE" && !p.is_available) return false;
      if (availability === "PAUSED" && p.is_available) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q);
    });
  }, [products, query, availability]);

  const sections = useMemo(() => {
    const known = new Set(categories.map((c) => c.id));
    const list = categories.map((c) => ({ id: c.id, category: c as Category | null, products: visible.filter((p) => p.category_id === c.id) }));
    const orphans = visible.filter((p) => !p.category_id || !known.has(p.category_id));
    if (orphans.length) list.push({ id: UNCATEGORIZED, category: null, products: orphans });
    return filtering ? list.filter((s) => s.products.length > 0) : list;
  }, [categories, visible, filtering]);

  const pausedCount = products.filter((p) => !p.is_available).length;

  function toggleAvailability(product: Product, next: boolean) {
    setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, is_available: next } : p)));
    start(async () => {
      const res = await actions.toggleAvailability(storeId, product.id, next);
      if (!res.success) {
        setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, is_available: !next } : p)));
        toast.error(res.error ?? "Não foi possível alterar a disponibilidade.");
      } else toast.success(next ? `${product.name} voltou ao cardápio.` : `${product.name} pausado.`);
    });
  }

  function toggleCategory(category: Category, next: boolean) {
    setCategories((prev) => prev.map((c) => (c.id === category.id ? { ...c, is_active: next } : c)));
    start(async () => {
      const res = await actions.setCategoryActive(storeId, category.id, next);
      if (!res.success) {
        setCategories((prev) => prev.map((c) => (c.id === category.id ? { ...c, is_active: !next } : c)));
        toast.error(res.error ?? "Não foi possível alterar a categoria.");
      }
    });
  }

  function persistOrder(kind: "category" | "product", ids: string[], rollback: () => void) {
    start(async () => {
      const res = await actions.reorder({ storeId, kind, ids });
      if (!res.success) {
        rollback();
        toast.error(res.error ?? "Não foi possível salvar a ordem.");
      }
    });
  }

  function onCategoryDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = categories.findIndex((c) => c.id === active.id);
    const to = categories.findIndex((c) => c.id === over.id);
    if (from < 0 || to < 0) return;
    const before = categories;
    const next = arrayMove(categories, from, to).map((c, i) => ({ ...c, sort_order: i * 10 }));
    setCategories(next);
    persistOrder("category", next.map((c) => c.id), () => setCategories(before));
  }

  function onProductDragEnd(sectionId: string, event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const inSection = (p: Product) => (sectionId === UNCATEGORIZED ? !p.category_id || !categories.some((c) => c.id === p.category_id) : p.category_id === sectionId);
    const list = products.filter(inSection);
    const from = list.findIndex((p) => p.id === active.id);
    const to = list.findIndex((p) => p.id === over.id);
    if (from < 0 || to < 0) return;
    const before = products;
    const moved = arrayMove(list, from, to).map((p, i) => ({ ...p, sort_order: i * 10 }));
    const order = new Map(moved.map((p) => [p.id, p]));
    setProducts([...products.map((p) => order.get(p.id) ?? p)].sort(bySort));
    persistOrder("product", moved.map((p) => p.id), () => setProducts(before));
  }

  function onProductSaved(id: string, payload: ProductPayload) {
    const editing = editor?.product ?? null;
    const now = new Date().toISOString();
    const option_groups = payload.optionGroups.map((g, gi) => ({
      id: g.id ?? `tmp-${id}-${gi}`,
      store_id: storeId,
      product_id: id,
      name: g.name,
      min_select: g.minSelect,
      max_select: g.maxSelect,
      is_required: g.isRequired,
      sort_order: gi,
      created_at: now,
      updated_at: now,
      options: g.options.map((o, oi) => ({ id: o.id ?? `tmp-${id}-${gi}-${oi}`, store_id: storeId, group_id: g.id ?? "", name: o.name, price_cents: o.priceCents, is_available: o.isAvailable, sort_order: oi, created_at: now, updated_at: now })),
    }));
    const base: Product = editing ?? {
      id,
      store_id: storeId,
      category_id: null,
      sku: null,
      name: "",
      description: null,
      price_cents: 0,
      image_url: null,
      is_available: true,
      is_archived: false,
      track_stock: false,
      stock_quantity: payload.trackStock ? payload.stockQuantity : 0,
      low_stock_threshold: 5,
      sort_order: 100000,
      created_at: now,
      updated_at: now,
    };
    const saved: Product = {
      ...base,
      category_id: payload.categoryId,
      sku: payload.sku,
      name: payload.name,
      description: payload.description,
      price_cents: payload.priceCents,
      image_url: payload.imageUrl,
      is_available: payload.isAvailable,
      track_stock: payload.trackStock,
      low_stock_threshold: payload.lowStockThreshold,
      sort_order: editing && editing.category_id === payload.categoryId ? editing.sort_order : 100000,
      option_groups,
    };
    setProducts((prev) => (editing ? prev.map((p) => (p.id === id ? saved : p)) : [...prev, saved]).sort(bySort));
    setEditor(null);
    toast.success(editing ? "Produto salvo." : "Produto criado.");
    router.refresh();
  }

  function onCategorySaved(category: Category, created: boolean) {
    setCategories((prev) => (created ? [...prev, category] : prev.map((c) => (c.id === category.id ? category : c))).sort(bySort));
    setCategoryDialog(null);
    toast.success(created ? "Categoria criada." : "Categoria salva.");
    router.refresh();
  }

  function confirmDeleteCategory() {
    if (!deleting) return;
    const category = deleting;
    start(async () => {
      const res = await actions.deleteCategory(storeId, category.id);
      if (!res.success) {
        toast.error(res.error ?? "Não foi possível excluir a categoria.");
        return;
      }
      setCategories((prev) => prev.filter((c) => c.id !== category.id));
      setProducts((prev) => prev.map((p) => (p.category_id === category.id ? { ...p, category_id: null } : p)));
      setDeleting(null);
      toast.success("Categoria excluída. Os produtos ficaram em “Sem categoria”.");
      router.refresh();
    });
  }

  const empty = categories.length === 0 && products.length === 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Cardápio"
        description={`${products.length} ${products.length === 1 ? "produto" : "produtos"} em ${categories.length} ${categories.length === 1 ? "categoria" : "categorias"}${pausedCount ? ` · ${pausedCount} pausado${pausedCount > 1 ? "s" : ""}` : ""}. O cliente vê em /menu/${storeSlug}.`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setCategoryDialog({ category: null })}>
              <FolderPlus className="h-4 w-4" /> Nova categoria
            </Button>
            <Button onClick={() => setEditor({ product: null, categoryId: categories[0]?.id ?? null })}>
              <Plus className="h-4 w-4" /> Novo produto
            </Button>
          </>
        }
      />

      {empty ? (
        <EmptyState
          icon={<UtensilsCrossed className="h-5 w-5" />}
          title="Seu cardápio começa aqui"
          description="Crie uma categoria (Burgers, Bebidas, Sobremesas) e depois os produtos dentro dela."
          action={
            <Button onClick={() => setCategoryDialog({ category: null })}>
              <FolderPlus className="h-4 w-4" /> Criar primeira categoria
            </Button>
          }
        />
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative sm:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-subtle" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar produto"
                aria-label="Buscar produto"
                className="h-11 w-full rounded-xl border border-border bg-surface pl-9 pr-3 text-sm placeholder:text-foreground-subtle focus-visible:border-brand/60 focus-visible:outline-none"
              />
            </div>
            <Segmented
              name="Filtrar disponibilidade"
              value={availability}
              onChange={setAvailability}
              options={[
                { value: "ALL", label: "Todos" },
                { value: "AVAILABLE", label: "Disponíveis" },
                { value: "PAUSED", label: "Pausados" },
              ]}
            />
          </div>
          {filtering ? <p className="text-xs text-foreground-subtle">Para arrastar e reordenar, limpe a busca e o filtro.</p> : null}

          {sections.length === 0 ? (
            <EmptyState title="Nenhum produto encontrado" description="Ajuste a busca ou o filtro." />
          ) : (
            <DndContext id={`${dndId}-cats`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onCategoryDragEnd}>
              <SortableContext items={sections.filter((s) => s.category).map((s) => s.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-5">
                  {sections.map((section) => (
                    <CategorySection
                      key={section.id}
                      id={section.id}
                      category={section.category}
                      products={section.products}
                      sortable={!filtering}
                      sensors={sensors}
                      dndId={`${dndId}-${section.id}`}
                      onProductDragEnd={(e) => onProductDragEnd(section.id, e)}
                      onToggleCategory={toggleCategory}
                      onEditCategory={(c) => setCategoryDialog({ category: c })}
                      onDeleteCategory={setDeleting}
                      onAddProduct={() => setEditor({ product: null, categoryId: section.category?.id ?? null })}
                      onEditProduct={(p) => setEditor({ product: p, categoryId: p.category_id })}
                      onToggleProduct={toggleAvailability}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </>
      )}

      {pending ? (
        <p role="status" className="sr-only">
          Salvando
        </p>
      ) : null}

      {editor ? (
        <ProductEditorSheet
          key={editor.product?.id ?? "new"}
          storeId={storeId}
          product={editor.product}
          defaultCategoryId={editor.categoryId}
          categories={categories}
          actions={actions}
          onClose={() => setEditor(null)}
          onSaved={onProductSaved}
          onArchived={(id) => {
            setProducts((prev) => prev.filter((p) => p.id !== id));
            setEditor(null);
            toast.success("Produto removido do cardápio.");
            router.refresh();
          }}
        />
      ) : null}

      {categoryDialog ? (
        <CategoryDialog
          storeId={storeId}
          category={categoryDialog.category}
          nextSortOrder={(categories.at(-1)?.sort_order ?? -10) + 10}
          actions={actions}
          onClose={() => setCategoryDialog(null)}
          onSaved={onCategorySaved}
        />
      ) : null}

      <Dialog open={Boolean(deleting)} onOpenChange={(open) => (!open ? setDeleting(null) : undefined)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir a categoria {deleting?.name}?</DialogTitle>
            <DialogDescription>Os produtos não são apagados: eles passam para “Sem categoria” e continuam no cardápio.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleting(null)} disabled={pending}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmDeleteCategory} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Excluir categoria
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CategorySection({
  id,
  category,
  products,
  sortable,
  sensors,
  dndId,
  onProductDragEnd,
  onToggleCategory,
  onEditCategory,
  onDeleteCategory,
  onAddProduct,
  onEditProduct,
  onToggleProduct,
}: {
  id: string;
  category: Category | null;
  products: Product[];
  sortable: boolean;
  sensors: ReturnType<typeof useSensors>;
  dndId: string;
  onProductDragEnd: (event: DragEndEvent) => void;
  onToggleCategory: (category: Category, next: boolean) => void;
  onEditCategory: (category: Category) => void;
  onDeleteCategory: (category: Category) => void;
  onAddProduct: () => void;
  onEditProduct: (product: Product) => void;
  onToggleProduct: (product: Product, next: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !sortable || !category });
  const title = category?.name ?? "Sem categoria";
  const hidden = category ? !category.is_active : false;

  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      aria-label={title}
      className={cn("rounded-2xl border border-border bg-surface/50", isDragging && "relative z-10 border-brand/50 shadow-float")}
    >
      <header className="flex items-center gap-2 px-3 py-3 sm:px-4">
        {category && sortable ? (
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={`Reordenar categoria ${title}`}
            className="flex h-9 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-foreground-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        ) : (
          <span className="w-1" />
        )}
        <div className="min-w-0 flex-1">
          <h2 className="flex flex-wrap items-center gap-2 font-display text-base font-bold">
            <span className="truncate">{title}</span>
            <span className="rounded-full bg-surface-card px-2 py-0.5 font-mono text-[11px] font-normal text-foreground-muted">{products.length}</span>
            {hidden ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-normal text-foreground-muted">
                <EyeOff className="h-3 w-3" /> Oculta
              </span>
            ) : null}
          </h2>
          {category?.description ? <p className="truncate text-xs text-foreground-muted">{category.description}</p> : null}
          {!category ? <p className="text-xs text-foreground-muted">Aparecem no fim do cardápio. Edite o produto para escolher uma categoria.</p> : null}
        </div>
        {category ? (
          <div className="flex shrink-0 items-center gap-1">
            <Switch checked={category.is_active} onCheckedChange={(v) => onToggleCategory(category, v)} aria-label={`Categoria ${title} visível no cardápio`} />
            <Button variant="ghost" size="icon" aria-label={`Editar categoria ${title}`} onClick={() => onEditCategory(category)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" aria-label={`Excluir categoria ${title}`} onClick={() => onDeleteCategory(category)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
      </header>

      <div className="px-2 pb-2 sm:px-2.5 sm:pb-2.5">
        {products.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-foreground-subtle">Nenhum produto nesta categoria.</p>
        ) : (
          <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onProductDragEnd}>
            <SortableContext items={products.map((p) => p.id)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-1.5">
                {products.map((p) => (
                  <ProductRow key={p.id} product={p} sortable={sortable} dimmed={hidden} onEdit={() => onEditProduct(p)} onToggle={(v) => onToggleProduct(p, v)} />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
        <button
          type="button"
          onClick={onAddProduct}
          className="mt-1.5 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm text-foreground-muted transition-colors hover:border-border-strong hover:text-foreground"
        >
          <Plus className="h-4 w-4" /> Adicionar produto{category ? ` em ${title}` : ""}
        </button>
      </div>
    </section>
  );
}

function ProductRow({ product, sortable, dimmed, onEdit, onToggle }: { product: Product; sortable: boolean; dimmed: boolean; onEdit: () => void; onToggle: (next: boolean) => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: product.id, disabled: !sortable });
  const out = product.track_stock && product.stock_quantity <= 0;
  const low = product.track_stock && !out && product.stock_quantity <= product.low_stock_threshold;
  const groups = product.option_groups?.length ?? 0;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2 rounded-xl border border-white/[0.06] bg-surface-elevated/60 p-2 pr-3 sm:gap-3",
        isDragging && "relative z-10 border-brand/50 shadow-float",
        (!product.is_available || dimmed) && "opacity-70"
      )}
    >
      {sortable ? (
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Reordenar ${product.name}`}
          className="flex h-12 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-foreground-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      ) : null}

      <button type="button" onClick={onEdit} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50" aria-label={`Editar ${product.name}`}>
        <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-card text-foreground-subtle">
          {product.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.image_url} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <ImageIcon className="h-4 w-4" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{product.name}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-foreground-muted">
            <span className="font-mono text-foreground">{formatCurrencyCents(product.price_cents)}</span>
            {groups ? <span>· {groups} {groups === 1 ? "grupo de adicionais" : "grupos de adicionais"}</span> : null}
            {out ? <span className="text-danger">· esgotado</span> : low ? <span className="text-warning">· restam {product.stock_quantity}</span> : product.track_stock ? <span>· {product.stock_quantity} un</span> : null}
          </span>
        </span>
      </button>

      <Switch checked={product.is_available} onCheckedChange={onToggle} aria-label={`${product.name} disponível`} />
    </li>
  );
}

function CategoryDialog({
  storeId,
  category,
  nextSortOrder,
  actions,
  onClose,
  onSaved,
}: {
  storeId: string;
  category: Category | null;
  nextSortOrder: number;
  actions: CatalogActions;
  onClose: () => void;
  onSaved: (category: Category, created: boolean) => void;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [description, setDescription] = useState(category?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Dê um nome à categoria.");
    setError(null);
    const payload = { storeId, name: name.trim(), description: description.trim() || null, sortOrder: category?.sort_order ?? nextSortOrder, isActive: category?.is_active ?? true };
    start(async () => {
      const now = new Date().toISOString();
      if (category) {
        const res = await actions.updateCategory(category.id, payload);
        if (!res.success) return setError(res.error ?? "Erro ao salvar categoria.");
        onSaved({ ...category, name: payload.name, description: payload.description, updated_at: now }, false);
      } else {
        const res = await actions.createCategory(payload);
        if (!res.success || !res.data) return setError(res.error ?? "Erro ao criar categoria.");
        onSaved({ id: res.data.id, store_id: storeId, name: payload.name, description: payload.description, sort_order: payload.sortOrder, is_active: true, created_at: now, updated_at: now }, true);
      }
    });
  }

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{category ? "Editar categoria" : "Nova categoria"}</DialogTitle>
          <DialogDescription>Categorias organizam o cardápio e viram os atalhos no topo da página do cliente.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cat-name">Nome</Label>
            <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} placeholder="Ex.: Burgers" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cat-description">Descrição (opcional)</Label>
            <Input id="cat-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={250} />
          </div>
          <FormMessage error={error} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {category ? "Salvar" : "Criar categoria"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
