import { notFound } from "next/navigation";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { AuthShell } from "@/components/layout/auth-shell";

async function previewAction() {
  "use server";
  return { success: false, error: "Prévia: a senha passou na validação e seria salva." };
}

/** Development-only preview of the new-password form (no session needed). */
export default function DevResetPassword() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <AuthShell title="Crie uma nova senha." subtitle="Depois de salvar, você entra direto no painel.">
      <ResetPasswordForm action={previewAction} />
    </AuthShell>
  );
}
