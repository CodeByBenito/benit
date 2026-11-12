import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { fixtureCatalogCategories, fixtureCatalogProducts, fixtureStockMovements } from "../../catalog-fixtures";
import { fixtureTenant } from "../../dashboard-fixtures";
import { InventoryPreview } from "./inventory-preview";

/** Development-only preview of the inventory screen. */
export default function DevEstoque() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <DashboardShell tenant={fixtureTenant} newOrdersCount={2} lowStockCount={3}>
      <InventoryPreview storeId={fixtureTenant.store.id} categories={fixtureCatalogCategories} products={fixtureCatalogProducts} movements={fixtureStockMovements} />
    </DashboardShell>
  );
}
