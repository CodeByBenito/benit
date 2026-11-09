import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { PageHeader } from "@/components/layout/page-header";
import { CouponsTab } from "@/components/settings/coupons-tab";
import { DeliveryTab } from "@/components/settings/delivery-tab";
import { HoursTab } from "@/components/settings/hours-tab";
import { PaymentsTab } from "@/components/settings/payments-tab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fixtureCoupons, fixtureTenant, fixtureZonesRows } from "../../dashboard-fixtures";

/** Development-only design preview of the settings tabs. */
export default async function DevSettings({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { tab = "payments" } = await searchParams;
  const store = fixtureTenant.store;
  const hours = [1, 2, 3, 4, 5]
    .map((d) => ({ id: `h${d}`, store_id: store.id, weekday: d, opens_at: "18:00:00", closes_at: "23:30:00" }))
    .concat([{ id: "h6", store_id: store.id, weekday: 6, opens_at: "18:00:00", closes_at: "02:00:00" }]);
  return (
    <DashboardShell tenant={fixtureTenant} newOrdersCount={2} lowStockCount={1}>
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Configurações" description={`Identidade, pagamentos, entrega, horários e cupons de ${store.name}.`} />
        <Tabs defaultValue={tab} className="mt-8">
          <TabsList>
            <TabsTrigger value="payments">Pagamentos</TabsTrigger>
            <TabsTrigger value="delivery">Entrega</TabsTrigger>
            <TabsTrigger value="hours">Horários</TabsTrigger>
            <TabsTrigger value="coupons">Cupons</TabsTrigger>
          </TabsList>
          <TabsContent value="payments" className="mt-8">
            <PaymentsTab store={store} account={{ connected: false, status: null, liveMode: null, providerUserId: null, configured: true }} canManage />
          </TabsContent>
          <TabsContent value="delivery" className="mt-8">
            <DeliveryTab storeId={store.id} zones={fixtureZonesRows} canManage />
          </TabsContent>
          <TabsContent value="hours" className="mt-8">
            <HoursTab storeId={store.id} hours={hours} canManage />
          </TabsContent>
          <TabsContent value="coupons" className="mt-8">
            <CouponsTab storeId={store.id} coupons={fixtureCoupons} canManage />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardShell>
  );
}
