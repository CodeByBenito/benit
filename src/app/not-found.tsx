import type { Metadata } from "next";
import Link from "next/link";
import { StatusScreen } from "@/components/layout/status-screen";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Página não encontrada", robots: { index: false } };

export default function NotFoundPage() {
  return (
    <StatusScreen
      code="404"
      title="Esta página não existe."
      description="O endereço pode ter sido digitado errado ou a página saiu do ar. Se você procurava o cardápio de uma loja, peça o link de novo para ela."
      actions={
        <>
          <Button asChild>
            <Link href="/">Ir para o início</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/login">Entrar no painel</Link>
          </Button>
        </>
      }
    />
  );
}
