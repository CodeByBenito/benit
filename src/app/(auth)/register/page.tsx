"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowRight, Loader2, MailCheck } from "lucide-react";
import { AuthError, AuthShell } from "@/components/layout/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerAction } from "@/features/auth/actions";

export default function RegisterPage() {
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();

  function submit(formData: FormData) {
    setError(null);
    start(async () => {
      const res = await registerAction(formData);
      if (res && !res.success) setError(res.error ?? "Não foi possível criar a conta.");
      else if (res?.data?.requiresEmailConfirmation) setConfirm(true);
    });
  }

  if (confirm) {
    return (
      <AuthShell title="Confira seu e-mail." subtitle="Enviamos um link de confirmação. Ao abrir o link, você já cai na configuração da sua loja.">
        <div className="flex items-center gap-3 rounded-2xl border border-success/30 bg-success/10 p-5 text-sm text-success">
          <MailCheck className="h-5 w-5 shrink-0" /> Conta criada. Não achou o e-mail? Olhe a caixa de spam.
        </div>
        <Button asChild variant="secondary" className="mt-6 w-full" size="lg">
          <Link href="/login">Ir para o login</Link>
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Crie sua conta."
      subtitle="Em poucos minutos sua loja está no ar, com cardápio, pedidos e estoque."
      footer={
        <>
          Já tem conta?{" "}
          <Link href="/login" className="font-medium text-foreground underline decoration-brand underline-offset-4">
            Entrar
          </Link>
        </>
      }
    >
      <AuthError message={error} />
      <form action={submit} className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="fullName">Seu nome</Label>
          <Input id="fullName" name="fullName" required autoComplete="name" className="h-11" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" className="h-11" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">WhatsApp (opcional)</Label>
          <Input id="phone" name="phone" inputMode="tel" autoComplete="tel" className="h-11" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Senha</Label>
          <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" className="h-11" />
          <p className="text-xs text-foreground-subtle">Mínimo de 8 caracteres.</p>
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {pending ? "Criando conta…" : "Criar conta"}
          {!pending ? <ArrowRight className="h-4 w-4" /> : null}
        </Button>
      </form>
    </AuthShell>
  );
}
