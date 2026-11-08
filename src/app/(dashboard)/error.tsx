"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-border bg-surface-card p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15 text-red-400">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <h2 className="mt-4 font-heading text-lg font-bold text-foreground">
        Ocorreu um erro ao carregar esta página operacional
      </h2>
      <p className="mt-1 max-w-md text-xs text-foreground-muted">
        {error.message ||
          "Verifique sua conexão ou as credenciais do banco de dados e tente novamente."}
      </p>
      <Button size="sm" className="mt-5" onClick={reset}>
        <RefreshCw className="h-4 w-4" />
        <span>Tentar Novamente</span>
      </Button>
    </div>
  );
}

