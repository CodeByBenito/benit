"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { BenitLogo } from "@/components/layout/benit-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { forgotPasswordAction } from "@/features/auth/actions";

export default function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await forgotPasswordAction(formData);
      if (res && !res.success) {
        setError(res.error ?? "Erro ao solicitar recuperação.");
      } else {
        setSent(true);
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
              Recuperar senha
            </h1>
            <p className="mt-1 text-xs text-foreground-muted">
              Informe seu e-mail cadastrado para receber as instruções de
              redefinição.
            </p>
          </div>

          {error && (
            <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {sent ? (
            <div className="space-y-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs text-emerald-300">
              <div className="flex items-center gap-2 font-semibold text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                <span>E-mail enviado!</span>
              </div>
              <p className="leading-relaxed">
                Se houver uma conta associada a este endereço, você receberá um
                link seguro para redefinir sua senha em instantes.
              </p>
              <Button variant="secondary" asChild className="w-full">
                <Link href="/login">Voltar para o Login</Link>
              </Button>
            </div>
          ) : (
            <form action={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="email"
                  className="block text-xs font-medium text-foreground"
                >
                  E-mail cadastrado
                </label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="voce@sua-loja.com.br"
                  required
                />
              </div>

              <Button type="submit" className="w-full" disabled={isPending}>
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Enviando...</span>
                  </>
                ) : (
                  <span>Enviar Link de Recuperação</span>
                )}
              </Button>
            </form>
          )}

          <div className="mt-6 border-t border-border pt-5 text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground-muted hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Voltar ao login</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

