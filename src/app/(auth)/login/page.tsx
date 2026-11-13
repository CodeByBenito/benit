import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";
import { AuthShell } from "@/components/layout/auth-shell";
import { safeNextPath } from "@/lib/utils";

export const metadata: Metadata = { title: "Entrar" };

const LINK_ERRORS: Record<string, string> = {
  link: "Este link expirou ou já foi usado. Se você estava confirmando o e-mail, tente entrar; para trocar a senha, peça um novo link.",
  config: "O acesso por e-mail ainda não está configurado neste ambiente.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const safeNext = next ? safeNextPath(next) : undefined;
  return (
    <AuthShell
      title="Bem-vindo de volta."
      subtitle="Entre para ver os pedidos de hoje."
      footer={
        <>
          Ainda não usa o BENIT?{" "}
          <Link href="/register" className="font-medium text-foreground underline decoration-brand underline-offset-4">
            Criar conta
          </Link>
        </>
      }
    >
      <LoginForm next={safeNext} initialError={error ? (LINK_ERRORS[error] ?? null) : null} />
    </AuthShell>
  );
}
