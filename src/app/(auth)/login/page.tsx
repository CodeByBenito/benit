"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import { BenitLogo } from "@/components/layout/benit-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loginAction } from "@/features/auth/actions";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await loginAction(formData);
      if (res && !res.success) {
        setError(res.error ?? "Não foi possível entrar.");
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
              Entrar na sua operação
            </h1>
            <p className="mt-1 text-xs text-foreground-muted">
              Acesse o painel de controle do seu estabelecimento.
            </p>
          </div>

          {error && (
            <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          <form action={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="block text-xs font-medium text-foreground"
              >
                E-mail
              </label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="voce@seu-restaurante.com.br"
                required
                autoComplete="email"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="block text-xs font-medium text-foreground"
                >
                  Senha
                </label>
                <Link
                  href="/forgot-password"
                  className="text-xs font-medium text-brand hover:underline"
                >
                  Esqueceu a senha?
                </Link>
              </div>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </div>

            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Autenticando...</span>
                </>
              ) : (
                <>
                  <span>Entrar no Painel</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>

          <div className="mt-6 border-t border-border pt-5 text-center text-xs text-foreground-muted">
            Ainda não tem conta no BENIT?{" "}
            <Link
              href="/register"
              className="font-semibold text-brand hover:underline"
            >
              Cadastrar meu estabelecimento
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

