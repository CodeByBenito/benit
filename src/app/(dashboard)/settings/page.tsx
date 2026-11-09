import { CouponsTab } from "@/components/settings/coupons-tab";
import { DeliveryTab } from "@/components/settings/delivery-tab";
import { HoursTab } from "@/components/settings/hours-tab";
import { PaymentsTab } from "@/components/settings/payments-tab";
import { StoreSettingsForm } from "@/components/layout/store-settings-form";
import { PageHeader } from "@/components/layout/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getPaymentAccountStatus } from "@/features/payments/actions";
import { requireTenantContext } from "@/lib/permissions/tenant";
import { createClient } from "@/lib/supabase/server";
import type { BusinessHour, Coupon, DeliveryZone } from "@/types/domain.types";

const TABS = ["loja", "payments", "delivery", "hours", "coupons"] as const;

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string; mp?: string }> }) {
  const tenant = await requireTenantContext();
  const { tab, mp } = await searchParams;
  const supabase = await createClient();
  const storeId = tenant.store.id;

  const [{ data: zones }, { data: hours }, { data: coupons }, { data: canManage }, account] = await Promise.all([
    supabase.from("delivery_zones").select("*").eq("store_id", storeId).order("sort_order").order("name"),
    supabase.from("store_business_hours").select("*").eq("store_id", storeId).order("weekday").order("opens_at"),
    supabase.from("coupons").select("*").eq("store_id", storeId).order("created_at", { ascending: false }),
    supabase.rpc("can_manage_store", { p_store_id: storeId }),
    getPaymentAccountStatus(storeId),
  ]);

  const initialTab = TABS.includes(tab as (typeof TABS)[number]) ? (tab as string) : "loja";

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Configurações" description={`Identidade, pagamentos, entrega, horários e cupons de ${tenant.store.name}.`} />
      <Tabs defaultValue={initialTab} className="mt-8">
        <TabsList>
          <TabsTrigger value="loja">Loja</TabsTrigger>
          <TabsTrigger value="payments">Pagamentos</TabsTrigger>
          <TabsTrigger value="delivery">Entrega</TabsTrigger>
          <TabsTrigger value="hours">Horários</TabsTrigger>
          <TabsTrigger value="coupons">Cupons</TabsTrigger>
        </TabsList>
        <TabsContent value="loja" className="mt-8">
          <StoreSettingsForm store={tenant.store} />
        </TabsContent>
        <TabsContent value="payments" className="mt-8">
          <PaymentsTab store={tenant.store} account={account} canManage={Boolean(canManage)} mpResult={mp} />
        </TabsContent>
        <TabsContent value="delivery" className="mt-8">
          <DeliveryTab storeId={storeId} zones={(zones ?? []) as DeliveryZone[]} canManage={Boolean(canManage)} />
        </TabsContent>
        <TabsContent value="hours" className="mt-8">
          <HoursTab storeId={storeId} hours={(hours ?? []) as BusinessHour[]} canManage={Boolean(canManage)} />
        </TabsContent>
        <TabsContent value="coupons" className="mt-8">
          <CouponsTab storeId={storeId} coupons={(coupons ?? []) as Coupon[]} canManage={Boolean(canManage)} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
