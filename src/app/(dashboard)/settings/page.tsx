import { requireTenantContext } from "@/lib/permissions/tenant";
import { StoreSettingsForm } from "@/components/layout/store-settings-form";

export default async function SettingsPage() {
  const tenant = await requireTenantContext();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">
          Configurações da Loja
        </h1>
        <p className="text-xs text-foreground-muted">
          Gerencie a identidade, link do cardápio digital e horário de operação
          de {tenant.store.name}.
        </p>
      </div>

      <StoreSettingsForm store={tenant.store} />
    </div>
  );
}

