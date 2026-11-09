import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { OrdersBoardClient } from "@/components/orders/orders-board-client";
import { fixtureOrders, fixtureTenant } from "../dashboard-fixtures";

/** Development-only design preview of the dashboard shell + orders board. */
export default function DevPainel() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <DashboardShell tenant={fixtureTenant} newOrdersCount={2} lowStockCount={1}>
      <OrdersBoardClient storeId={fixtureTenant.store.id} storeName={fixtureTenant.store.name} initialOrders={fixtureOrders} products={[]} />
    </DashboardShell>
  );
}
