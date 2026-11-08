"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { AlertCircle, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { BenitLogo } from "@/components/layout/benit-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { registerAction } from "@/features/auth/actions";

export default function RegisterPage() {
  const [error, setError] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await registerAction(formData);
      if (res && !res.success) {
        setError(res.error ?? "Erro ao criar conta.");
      } else if (res?.data?.requiresEmailConfirmation) {
        setNeedsConfirmation(true);
      }
    });
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <BenitLogo href="/" showTagline />
        </div>

        <div className="rounded-2xl border border-border bg-surface-card p-6 shadow-xl sm:p-8">
          <div className="mb-6">
            <h1 className="font-heading text-xl font-bold text-foreground">
              Criar conta de proprietário
            </h1>
            <p className="mt-1 text-xs text-foreground-muted">
              Cadastre-se para configurar sua loja e publicar seu cardápio
              digital.
            </p>
          </div>

          {error && (
            <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {needsConfirmation ? (
            <div className="space-y-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs text-emerald-300">
              <div className="flex items-center gap-2 font-semibold text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                <span>Conta criada com sucesso!</span>
              </div>
              <p className="leading-relaxed">
                Enviamos um link de confirmação para o seu e-mail. Confirme seu
                e-mail e depois faça login para concluir a configuração da sua
                loja.
              </p>
              <Button asChild className="w-full">
                <Link href="/login">Ir para Login</Link>
              </Button>
            </div>
          ) : (
            <form action={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="fullName"
                  className="block text-xs font-medium text-foreground"
                >
                  Seu Nome Completo
                </label>
                <Input
                  id="fullName"
                  name="fullName"
                  type="text"
                  placeholder="Ex: Guilherme Benito"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="email"
                  className="block text-xs font-medium text-foreground"
                >
                  E-mail Profissional
                </label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="voce@sua-loja.com.br"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="phone"
                  className="block text-xs font-medium text-foreground"
                >
                  WhatsApp / Telefone
                </label>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  placeholder="(11) 99999-9999"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="password"
                  className="block text-xs font-medium text-foreground"
                >
                  Senha (mínimo 6 caracteres)
                </label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
              </div>

              <Button type="submit" className="w-full" disabled={isPending}>
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Criando conta...</span>
                  </>
                ) : (
                  <>
                    <span>Continuar para Configurar Loja</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </form>
          )}

          <div className="mt-6 border-t border-border pt-5 text-center text-xs text-foreground-muted">
            Já possui uma conta?{" "}
            <Link
              href="/login"
              className="font-semibold text-brand hover:underline"
            >
              Fazer login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

