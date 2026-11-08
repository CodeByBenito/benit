import Link from "next/link";
import { UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BenitLogo } from "@/components/layout/benit-logo";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
      <BenitLogo href="/" className="mb-8" />
      <div className="max-w-md rounded-2xl border border-border bg-surface-card p-8">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand/15 text-brand">
          <UtensilsCrossed className="h-6 w-6" />
        </div>
        <h1 className="mt-4 font-heading text-xl font-bold text-foreground">
          Página ou Cardápio não encontrado
        </h1>
        <p className="mt-2 text-xs leading-relaxed text-foreground-muted">
          O link acessado não existe ou o cardápio digital deste estabelecimento
          está temporariamente despublicado.
        </p>
        <Button className="mt-6" asChild>
          <Link href="/">Voltar para o Início</Link>
        </Button>
      </div>
    </div>
  );
}

