import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import type { MembershipRole } from "@/types/domain.types";
import { fixtureCustomerOrders, fixtureCustomers } from "../../catalog-fixtures";
import { fixtureTenant } from "../../dashboard-fixtures";
import { CustomersPreview } from "./customers-preview";

/** Development-only preview of the customers screen. `?vazio=1` shows the empty state, `?role=ATTENDANT` the attendant's panel. */
export default async function DevClientes({ searchParams }: { searchParams: Promise<{ vazio?: string; role?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { vazio, role } = await searchParams;
  const tenant = { ...fixtureTenant, role: (role?.toUpperCase() === "ATTENDANT" ? "ATTENDANT" : fixtureTenant.role) as MembershipRole };
  return (
    <DashboardShell tenant={tenant} newOrdersCount={2} lowStockCount={3}>
      <CustomersPreview storeId={tenant.store.id} storeName={tenant.store.name} customers={vazio ? [] : fixtureCustomers} orders={fixtureCustomerOrders} />
    </DashboardShell>
  );
}
