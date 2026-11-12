import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { KitchenBoard } from "@/components/orders/kitchen-board";
import { toKitchenOrders } from "@/lib/orders/kitchen";
import { fixtureOrders, fixtureTenant } from "../../dashboard-fixtures";

async function previewTransition() {
  "use server";
  return { success: true };
}

/** Development-only preview of what a KITCHEN member sees: one nav item and the kitchen board. */
export default function DevCozinha() {
  if (process.env.NODE_ENV === "production") notFound();
  const tenant = { ...fixtureTenant, role: "KITCHEN" as const, user: { ...fixtureTenant.user, full_name: "Diego Ramos" } };
  return (
    <DashboardShell tenant={tenant} newOrdersCount={2}>
      <KitchenBoard storeId={tenant.store.id} storeName={tenant.store.name} orders={toKitchenOrders(fixtureOrders)} waitingConfirmation={2} transition={previewTransition} />
    </DashboardShell>
  );
}
