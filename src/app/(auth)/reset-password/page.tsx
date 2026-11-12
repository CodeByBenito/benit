import type { Metadata } from "next";
import Link from "next/link";
import { Link2Off } from "lucide-react";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { AuthShell } from "@/components/layout/auth-shell";
import { Button } from "@/components/ui/button";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Nova senha", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Reached from the recovery e-mail through /auth/callback, which leaves a
 * session. Without one the link is expired, used or opened by hand.
 */
export default async function ResetPasswordPage() {
  let hasSession = false;
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    hasSession = Boolean(user);
  }

  if (!hasSession) {
    return (
      <AuthShell
        title="Este link não vale mais."
        subtitle="Links de recuperação expiram em pouco tempo e só funcionam uma vez. Peça um novo e ele chega no seu e-mail."
        footer={
          <Link href="/login" className="font-medium text-foreground underline decoration-brand underline-offset-4">
            Voltar para o login
          </Link>
        }
      >
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface-card p-5 text-sm text-foreground-muted">
          <Link2Off className="h-5 w-5 shrink-0 text-brand" /> Abra o link no mesmo navegador em que você pediu a recuperação.
        </div>
        <Button asChild className="mt-6 w-full" size="lg">
          <Link href="/forgot-password">Pedir novo link</Link>
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Crie uma nova senha." subtitle="Depois de salvar, você entra direto no painel.">
      <ResetPasswordForm />
    </AuthShell>
  );
}
