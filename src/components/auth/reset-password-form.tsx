"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { AuthError } from "@/components/layout/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPasswordAction, type ActionResult } from "@/features/auth/actions";
import { resetPasswordSchema } from "@/lib/validations";

/**
 * New-password form. Validates with the same Zod schema the server uses, so
 * the error shows before a round trip. `action` is injectable for the
 * development preview.
 */
export function ResetPasswordForm({ action = resetPasswordAction }: { action?: (formData: FormData) => Promise<ActionResult | void> }) {
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [pending, start] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const parsed = resetPasswordSchema.safeParse({
      password: formData.get("password"),
      confirmPassword: formData.get("confirmPassword"),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Senha inválida.");
      return;
    }
    setError(null);
    start(async () => {
      const res = await action(formData);
      if (res && !res.success) setError(res.error ?? "Não foi possível salvar a nova senha.");
    });
  }

  const type = show ? "text" : "password";
  return (
    <>
      <AuthError message={error} />
      <form onSubmit={submit} className="space-y-5" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="password">Nova senha</Label>
          <div className="relative">
            <Input id="password" name="password" type={type} required autoComplete="new-password" className="h-11 pr-11" aria-describedby="password-hint" />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? "Ocultar senha" : "Mostrar senha"}
              aria-pressed={show}
              className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-foreground-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p id="password-hint" className="text-xs text-foreground-subtle">
            Mínimo de 8 caracteres.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword">Repita a nova senha</Label>
          <Input id="confirmPassword" name="confirmPassword" type={type} required autoComplete="new-password" className="h-11" />
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {pending ? "Salvando…" : "Salvar nova senha"}
        </Button>
      </form>
    </>
  );
}
