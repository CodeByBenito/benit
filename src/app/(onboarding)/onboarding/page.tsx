import { redirect } from "next/navigation";
import { BenitLogo } from "@/components/layout/benit-logo";
import { OnboardingForm } from "@/components/layout/onboarding-form";
import { getTenantContext } from "@/lib/permissions/tenant";
import { Badge } from "@/components/ui/badge";

export default async function OnboardingPage() {
  const existingTenant = await getTenantContext();
  if (existingTenant) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-xl">
        <div className="mb-8 flex flex-col items-center text-center">
          <BenitLogo href="/" showTagline />
        </div>

        <div className="rounded-2xl border border-border bg-surface-card p-6 shadow-xl sm:p-8">
          <div className="mb-6">
            <Badge className="mb-2">Passo 1 de 1 • Configuração Inicial</Badge>
            <h1 className="font-heading text-2xl font-bold text-foreground">
              Configure seu estabelecimento
            </h1>
            <p className="mt-1 text-xs leading-relaxed text-foreground-muted">
              Crie sua organização e defina o link exclusivo do seu cardápio
              digital. Todos os seus produtos, pedidos e estoque ficarão
              isolados com segurança nesta loja.
            </p>
          </div>

          <OnboardingForm />
        </div>
      </div>
    </div>
  );
}

