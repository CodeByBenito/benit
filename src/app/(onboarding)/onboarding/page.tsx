import { redirect } from "next/navigation";
import { AuthShell } from "@/components/layout/auth-shell";
import { OnboardingForm } from "@/components/layout/onboarding-form";
import { getTenantContext } from "@/lib/permissions/tenant";

export default async function OnboardingPage() {
  const existingTenant = await getTenantContext();
  if (existingTenant) redirect("/dashboard");

  return (
    <AuthShell
      title="Vamos montar sua loja."
      subtitle="Nome, link do cardápio e WhatsApp. O resto — cardápio, bairros, horários e pagamentos — você ajusta no painel."
    >
      <OnboardingForm />
    </AuthShell>
  );
}
