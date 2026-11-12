import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { fixtureCatalogCategories, fixtureCatalogProducts } from "../../catalog-fixtures";
import { fixtureTenant } from "../../dashboard-fixtures";
import { MenuPreview } from "./menu-preview";

/** Development-only preview of the menu manager. `?vazio=1` shows the empty state. */
export default async function DevCardapio({ searchParams }: { searchParams: Promise<{ vazio?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { vazio } = await searchParams;
  return (
    <DashboardShell tenant={fixtureTenant} newOrdersCount={2} lowStockCount={3}>
      <MenuPreview
        storeId={fixtureTenant.store.id}
        storeSlug={fixtureTenant.store.slug}
        categories={vazio ? [] : fixtureCatalogCategories}
        products={vazio ? [] : fixtureCatalogProducts}
      />
    </DashboardShell>
  );
}
