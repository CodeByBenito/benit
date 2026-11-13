import { notFound } from "next/navigation";
import { OverviewView } from "@/components/dashboard/overview-view";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { buildOverview, type OverviewOrder } from "@/lib/dashboard/overview";
import { fixtureCatalogProducts, fixtureCustomerOrders } from "../../catalog-fixtures";
import { fixtureOrders, fixtureTenant } from "../../dashboard-fixtures";

const DAY = 24 * 60 * 60 * 1000;

/** A week of fictional sales so the chart has something to show. */
function weekOfOrders(): OverviewOrder[] {
  const perDay = [4, 6, 3, 7, 5, 9];
  return perDay.flatMap((count, i) =>
    Array.from({ length: count }, (_, n) => ({
      id: `w${i}-${n}`,
      order_number: 300 + i * 10 + n,
      status: "COMPLETED" as const,
      total_cents: 3200 + ((i * 7 + n * 13) % 9) * 450,
      created_at: new Date(Date.now() - (6 - i) * DAY - n * 600_000).toISOString(),
      customer_name_snapshot: "Cliente",
      fulfillment_type: "DELIVERY" as const,
      payment_status: "APPROVED" as const,
    }))
  );
}

/**
 * Development-only preview of the overview.
 * `?estado=novo` shows a store that has just been created; `?estado=mp` the Mercado Pago warning.
 */
export default async function DevVisaoGeral({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { estado } = await searchParams;
  const fresh = estado === "novo";
  const store = fixtureTenant.store;
  const overview = buildOverview({
    orders: fresh ? [] : [...fixtureOrders, ...fixtureCustomerOrders.slice(1), ...weekOfOrders()],
    products: fresh ? [] : fixtureCatalogProducts,
    timezone: store.timezone,
    store: { ...store, logo_url: fresh ? null : "set" },
    zonesCount: fresh ? 0 : 2,
    hoursCount: fresh ? 0 : 7,
    paymentConnected: !fresh,
  });
  return (
    <DashboardShell tenant={fixtureTenant} newOrdersCount={overview.queue.NEW} lowStockCount={overview.lowStock.length}>
      <OverviewView
        overview={overview}
        dateLabel={new Intl.DateTimeFormat("pt-BR", { timeZone: store.timezone, weekday: "long", day: "numeric", month: "long" }).format(new Date())}
        firstName="Carla"
        storeName={store.name}
        storeSlug={store.slug}
        paymentIssue={estado === "mp"}
      />
    </DashboardShell>
  );
}
