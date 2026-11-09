"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Loader2, MailCheck } from "lucide-react";
import { AuthError, AuthShell } from "@/components/layout/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forgotPasswordAction } from "@/features/auth/actions";

export default function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();

  function submit(formData: FormData) {
    setError(null);
    start(async () => {
      const res = await forgotPasswordAction(formData);
      if (res && !res.success) setError(res.error ?? "Não foi possível enviar o e-mail.");
      else setSent(true);
    });
  }

  return (
    <AuthShell
      title="Recuperar acesso."
      subtitle="Informe o e-mail da sua conta e enviaremos um link para criar uma nova senha."
      footer={
        <Link href="/login" className="font-medium text-foreground underline decoration-brand underline-offset-4">
          Voltar para o login
        </Link>
      }
    >
      {sent ? (
        <div className="flex items-center gap-3 rounded-2xl border border-success/30 bg-success/10 p-5 text-sm text-success">
          <MailCheck className="h-5 w-5 shrink-0" /> Se houver uma conta com esse e-mail, o link chega em instantes.
        </div>
      ) : (
        <>
          <AuthError message={error} />
          <form action={submit} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" name="email" type="email" required autoComplete="email" className="h-11" />
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Enviar link
            </Button>
          </form>
        </>
      )}
    </AuthShell>
  );
}
