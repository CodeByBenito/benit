import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { OrdersBoardClient } from "@/components/orders/orders-board-client";
import type { MembershipRole } from "@/types/domain.types";
import { fixtureOrders, fixtureTenant } from "../dashboard-fixtures";

const ROLES: MembershipRole[] = ["OWNER", "MANAGER", "ATTENDANT", "KITCHEN"];

/**
 * Development-only design preview of the dashboard shell + orders board.
 * `?role=ATTENDANT` shows the navigation of another role.
 */
export default async function DevPainel({ searchParams }: { searchParams: Promise<{ role?: string; mp?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { role, mp } = await searchParams;
  const tenant = { ...fixtureTenant, role: ROLES.find((r) => r === role?.toUpperCase()) ?? fixtureTenant.role };
  return (
    <DashboardShell tenant={tenant} newOrdersCount={2} lowStockCount={1} paymentIssue={mp === "falhou"}>
      <OrdersBoardClient storeId={tenant.store.id} storeName={tenant.store.name} initialOrders={fixtureOrders} products={[]} />
    </DashboardShell>
  );
}
