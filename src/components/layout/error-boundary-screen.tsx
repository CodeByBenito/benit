"use client";

import Link from "next/link";
import { useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { StatusScreen } from "@/components/layout/status-screen";
import { Button } from "@/components/ui/button";

export interface BoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Body of every error.tsx. The raw error message is never shown: it can carry
 * internal details. The digest is enough to find the server log.
 */
export function ErrorBoundaryScreen({
  error,
  reset,
  title = "Algo deu errado por aqui.",
  description = "Não foi você. Tente de novo em instantes; se continuar, fale com a gente.",
  home = { href: "/", label: "Voltar ao início" },
  embedded = false,
  logoHref,
}: BoundaryProps & {
  title?: string;
  description?: string;
  home?: { href: string; label: string } | null;
  embedded?: boolean;
  logoHref?: string | null;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StatusScreen
      code="Erro"
      title={title}
      description={description}
      reference={error.digest}
      embedded={embedded}
      logoHref={logoHref}
      actions={
        <>
          <Button onClick={reset}>
            <RefreshCw className="h-4 w-4" /> Tentar de novo
          </Button>
          {home ? (
            <Button asChild variant="secondary">
              <Link href={home.href}>{home.label}</Link>
            </Button>
          ) : null}
        </>
      }
    />
  );
}
