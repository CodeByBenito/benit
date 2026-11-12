"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ArrowUpRight, Boxes, ClipboardList, LayoutDashboard, LogOut, Menu, Settings, UtensilsCrossed, Users, X } from "lucide-react";
import { BenitLogo } from "@/components/layout/benit-logo";
import { toast } from "@/components/ui/toast";
import { logoutAction } from "@/features/auth/actions";
import { toggleStoreOpenStatusAction } from "@/features/stores/actions";
import { ROLE_LABEL, canAccessArea, homePath, type DashboardArea } from "@/lib/permissions/roles";
import { cn } from "@/lib/utils";
import type { TenantContext } from "@/types/domain.types";

interface DashboardShellProps {
  tenant: TenantContext;
  newOrdersCount?: number;
  lowStockCount?: number;
  children: React.ReactNode;
}

export function DashboardShell({ tenant, newOrdersCount = 0, lowStockCount = 0, children }: DashboardShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(tenant.store.is_open);

  useEffect(() => setMobileOpen(false), [pathname]);

  const role = tenant.role;
  const home = homePath(role);
  // Kitchen staff follow the store status but do not pause the store.
  const canToggleOpen = role !== "KITCHEN";

  const allNav: { label: string; href: string; area: DashboardArea; icon: typeof LayoutDashboard; badge?: number; tone?: "brand" | "warning" }[] = [
    { label: "Visão geral", href: "/dashboard", area: "overview", icon: LayoutDashboard },
    { label: "Pedidos", href: "/orders", area: "orders", icon: ClipboardList, badge: newOrdersCount || undefined, tone: "brand" },
    { label: "Cardápio", href: "/menu-manager", area: "menu", icon: UtensilsCrossed },
    { label: "Estoque", href: "/inventory", area: "inventory", icon: Boxes, badge: lowStockCount || undefined, tone: "warning" },
    { label: "Clientes", href: "/customers", area: "customers", icon: Users },
    { label: "Configurações", href: "/settings", area: "settings", icon: Settings },
  ];
  // Each role only sees the areas it works in (see lib/permissions/roles).
  const nav = allNav.filter((item) => canAccessArea(role, item.area));

  function toggleOpen() {
    const next = !isOpen;
    setIsOpen(next);
    startTransition(async () => {
      const res = await toggleStoreOpenStatusAction(tenant.store.id, next);
      if (!res.success) {
        setIsOpen(!next);
        toast.error("Não foi possível alterar o status da loja.");
      } else toast.success(next ? "Loja aberta para pedidos." : "Loja pausada. Novos pedidos bloqueados.");
    });
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5">
        <BenitLogo href={home} />
      </div>

      <div className="px-3">
        <div className="rounded-2xl border border-border bg-surface-card/60 p-3">
          <div className="flex items-center gap-3">
            {tenant.store.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tenant.store.logo_url} alt="" className="h-9 w-9 rounded-xl object-cover" />
            ) : (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand font-display font-extrabold text-white">
                {tenant.store.name.charAt(0)}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{tenant.store.name}</p>
              <p className="truncate font-mono text-[11px] text-foreground-subtle">/menu/{tenant.store.slug}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={toggleOpen}
            disabled={pending || !canToggleOpen}
            aria-pressed={isOpen}
            className={cn(
              "mt-3 flex w-full items-center justify-between rounded-xl border px-3 py-2 text-xs font-medium transition-colors duration-base disabled:cursor-default",
              isOpen ? "border-success/30 bg-success/10 text-success" : "border-danger/30 bg-danger/10 text-danger"
            )}
          >
            <span className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                {isOpen ? <span className="absolute inline-flex h-full w-full animate-ring rounded-full bg-success" /> : null}
                <span className={cn("relative inline-flex h-2 w-2 rounded-full", isOpen ? "bg-success" : "bg-danger")} />
              </span>
              {isOpen ? "Recebendo pedidos" : "Loja pausada"}
            </span>
            {canToggleOpen ? <span className="text-[10px] uppercase tracking-wider opacity-70">{isOpen ? "Pausar" : "Abrir"}</span> : null}
          </button>
        </div>
      </div>

      <nav aria-label="Painel" className="mt-6 flex-1 space-y-0.5 px-3">
        {nav.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative flex items-center justify-between rounded-xl px-3 py-2.5 text-sm transition-colors duration-fast",
                active ? "bg-surface-elevated font-medium text-foreground shadow-hairline" : "text-foreground-muted hover:bg-surface-card hover:text-foreground"
              )}
            >
              {active ? <span aria-hidden className="absolute -left-3 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand" /> : null}
              <span className="flex items-center gap-3">
                <Icon className={cn("h-[18px] w-[18px]", active ? "text-brand" : "text-foreground-subtle group-hover:text-foreground-muted")} />
                {item.label}
              </span>
              {item.badge ? (
                <span
                  className={cn(
                    "min-w-[22px] rounded-full px-1.5 py-0.5 text-center font-mono text-[11px] font-medium",
                    item.tone === "brand" ? "bg-brand text-white" : "bg-warning/15 text-warning"
                  )}
                >
                  {item.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-3 p-3">
        <a
          href={`/menu/${tenant.store.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5 text-sm text-foreground-muted transition-colors hover:border-border-strong hover:text-foreground"
        >
          Ver cardápio público <ArrowUpRight className="h-4 w-4" />
        </a>
        <div className="flex items-center justify-between gap-2 rounded-xl px-2 py-1.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{tenant.user.full_name}</p>
            <p className="truncate text-[11px] text-foreground-subtle">{ROLE_LABEL[role]} · {tenant.organization.name}</p>
          </div>
          <form action={logoutAction}>
            <button type="submit" aria-label="Sair da conta" className="rounded-lg p-2 text-foreground-subtle transition-colors hover:bg-surface-card hover:text-foreground">
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="sticky top-0 hidden h-screen w-[264px] shrink-0 border-r border-border bg-surface/60 lg:block">{sidebar}</aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 animate-overlay-in bg-black/70 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[284px] animate-slide-in-left border-r border-border bg-surface">
            <button type="button" onClick={() => setMobileOpen(false)} aria-label="Fechar menu" className="absolute right-3 top-4 rounded-lg p-1.5 text-foreground-muted hover:text-foreground">
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-xl lg:hidden">
          <button type="button" onClick={() => setMobileOpen(true)} aria-label="Abrir menu" className="flex h-9 w-9 items-center justify-center rounded-lg border border-border">
            <Menu className="h-5 w-5" />
          </button>
          <BenitLogo href={home} />
          <button
            type="button"
            onClick={toggleOpen}
            disabled={pending || !canToggleOpen}
            aria-label={canToggleOpen ? (isOpen ? "Pausar loja" : "Abrir loja") : isOpen ? "Loja aberta" : "Loja pausada"}
            className={cn("flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium", isOpen ? "border-success/30 text-success" : "border-danger/30 text-danger")}
          >
            <span className={cn("h-2 w-2 rounded-full", isOpen ? "bg-success" : "bg-danger")} />
            {isOpen ? "Aberta" : "Pausada"}
          </button>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
