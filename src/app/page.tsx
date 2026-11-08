import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Boxes,
  UtensilsCrossed,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { BenitLogo } from "@/components/layout/benit-logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Navbar */}
      <header className="border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <BenitLogo href="/" />
          <div className="flex items-center gap-3">
            <Button variant="ghost" asChild>
              <Link href="/login">Entrar</Link>
            </Button>
            <Button asChild>
              <Link href="/register">
                Criar Conta
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <Badge className="mb-4">Food Tech • Operação em Tempo Real</Badge>
            <h1 className="font-heading text-4xl font-extrabold tracking-tight text-foreground sm:text-6xl">
              Sua operação.{" "}
              <span className="text-brand">Sob controle.</span>
            </h1>
            <p className="mt-6 text-base leading-relaxed text-foreground-muted sm:text-lg">
              Centralize cardápio digital, gestão de pedidos por estágios,
              atendimento via WhatsApp e controle de estoque em uma única
              plataforma moderna para restaurantes, hamburguerias, pizzarias e
              cafeterias.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Button size="lg" asChild>
                <Link href="/register">
                  Começar Agora
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="secondary" asChild>
                <Link href="/login">Acessar Painel</Link>
              </Button>
            </div>
          </div>

          {/* 4 Operational Pillars */}
          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: ClipboardList,
                title: "Gestão de Pedidos",
                desc: "Board por estágios em tempo real para pedidos do cardápio digital e lançamentos manuais no balcão.",
              },
              {
                icon: UtensilsCrossed,
                title: "Cardápio Digital",
                desc: "Link exclusivo da sua loja (/menu/sua-loja), mobile-first, com adicionais, fotos e carrinho rápido.",
              },
              {
                icon: Boxes,
                title: "Controle de Estoque",
                desc: "Baixa automática na confirmação do pedido, estorno em cancelamentos e histórico auditável.",
              },
              {
                icon: Zap,
                title: "Atendimento & CRM",
                desc: "Histórico completo de clientes por loja e contato direto em 1 clique via WhatsApp.",
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="rounded-xl border border-border bg-surface-card p-6 transition-colors hover:border-brand/40"
                >
                  <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand/15 text-brand">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h2 className="font-heading text-base font-bold text-foreground">
                    {item.title}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
                    {item.desc}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Trust bar */}
          <div className="mt-12 flex flex-wrap items-center justify-center gap-6 rounded-xl border border-border bg-surface px-6 py-4 text-xs text-foreground-muted">
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-brand" />
              Isolamento Multi-Tenant com Row Level Security (RLS)
            </span>
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              Sincronização em Tempo Real via Supabase Realtime
            </span>
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              Preços e Estoque Validados no Servidor
            </span>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-6 text-center text-xs text-foreground-muted">
        BENIT. — Plataforma SaaS para Gestão Operacional de Negócios de Alimentação.
      </footer>
    </div>
  );
}

