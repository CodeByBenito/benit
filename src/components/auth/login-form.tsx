"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { AuthError } from "@/components/layout/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction } from "@/features/auth/actions";

export function LoginForm({ next, initialError }: { next?: string; initialError?: string | null }) {
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [pending, start] = useTransition();

  function submit(formData: FormData) {
    setError(null);
    start(async () => {
      const res = await loginAction(formData);
      if (res && !res.success) setError(res.error ?? "Não foi possível entrar.");
    });
  }

  return (
    <>
      <AuthError message={error} />
      <form action={submit} className="space-y-5">
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" className="h-11" placeholder="voce@seurestaurante.com.br" />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Senha</Label>
            <Link href="/forgot-password" className="text-xs text-foreground-muted hover:text-foreground">
              Esqueci a senha
            </Link>
          </div>
          <Input id="password" name="password" type="password" required autoComplete="current-password" className="h-11" />
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {pending ? "Entrando…" : "Entrar"}
          {!pending ? <ArrowRight className="h-4 w-4" /> : null}
        </Button>
      </form>
    </>
  );
}
