"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import {
  LayoutDashboard,
  ClipboardList,
  UtensilsCrossed,
  Boxes,
  Users,
  Settings,
  ExternalLink,
  LogOut,
  Power,
  Menu,
  X,
  Store as StoreIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BenitLogo } from "@/components/layout/benit-logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { logoutAction } from "@/features/auth/actions";
import { toggleStoreOpenStatusAction } from "@/features/stores/actions";
import type { TenantContext } from "@/types/domain.types";

interface DashboardShellProps {
  tenant: TenantContext;
  newOrdersCount?: number;
  lowStockCount?: number;
  children: React.ReactNode;
}

export function DashboardShell({
  tenant,
  newOrdersCount = 0,
  lowStockCount = 0,
  children,
}: DashboardShellProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isOpenState, setIsOpenState] = useState(tenant.store.is_open);

  const navItems = [
    {
      label: "Dashboard",
      href: "/dashboard",
      icon: LayoutDashboard,
    },
    {
      label: "Pedidos",
      href: "/orders",
      icon: ClipboardList,
      badge: newOrdersCount > 0 ? newOrdersCount : undefined,
      badgeVariant: "default" as const,
    },
    {
      label: "Cardápio",
      href: "/menu-manager",
      icon: UtensilsCrossed,
    },
    {
      label: "Estoque",
      href: "/inventory",
      icon: Boxes,
      badge: lowStockCount > 0 ? lowStockCount : undefined,
      badgeVariant: "warning" as const,
    },
    {
      label: "Clientes",
      href: "/customers",
      icon: Users,
    },
    {
      label: "Configurações",
      href: "/settings",
      icon: Settings,
    },
  ];

  function handleToggleStoreOpen() {
    const nextValue = !isOpenState;
    setIsOpenState(nextValue);
    startTransition(async () => {
      const res = await toggleStoreOpenStatusAction(tenant.store.id, nextValue);
      if (!res.success) {
        setIsOpenState(!nextValue);
      }
    });
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-surface lg:flex">
        <div className="flex h-16 items-center justify-between border-b border-border px-5">
          <BenitLogo href="/dashboard" />
          <Badge variant="secondary" className="text-[10px] uppercase">
            SaaS
          </Badge>
        </div>

        {/* Active Store Card */}
        <div className="border-b border-border p-4">
          <div className="rounded-xl border border-border bg-surface-card p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/15 text-brand">
                  <StoreIcon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-foreground">
                    {tenant.store.name}
                  </p>
                  <p className="truncate text-[11px] text-foreground-muted">
                    /menu/{tenant.store.slug}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleToggleStoreOpen}
                disabled={isPending}
                title={
                  isOpenState
                    ? "Clique para pausar novos pedidos digitais"
                    : "Clique para abrir a loja para pedidos"
                }
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors",
                  isOpenState
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                    : "bg-red-500/15 text-red-400 border border-red-500/30"
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    isOpenState ? "bg-emerald-400" : "bg-red-400"
                  )}
                />
                {isOpenState ? "Aberta" : "Fechada"}
              </button>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <Link
                href={`/menu/${tenant.store.slug}`}
                target="_blank"
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground-muted transition-colors hover:border-brand/40 hover:text-foreground"
              >
                <span>Ver Cardápio Digital</span>
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-foreground-muted/70">
            Operação
          </p>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-brand/15 text-brand border border-brand/30"
                    : "text-foreground-muted hover:bg-surface-card hover:text-foreground border border-transparent"
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={cn(
                      "h-4 w-4 transition-colors",
                      isActive
                        ? "text-brand"
                        : "text-foreground-muted group-hover:text-foreground"
                    )}
                  />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && (
                  <Badge
                    variant={item.badgeVariant}
                    className="tabular-nums px-2 py-0 text-[11px]"
                  >
                    {item.badge}
                  </Badge>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User Footer */}
        <div className="border-t border-border p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-foreground">
                {tenant.user.full_name}
              </p>
              <p className="truncate text-[11px] text-foreground-muted">
                {tenant.user.email}
              </p>
            </div>
            <form action={logoutAction}>
              <Button
                type="submit"
                variant="ghost"
                size="icon"
                title="Sair da conta"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar (Mobile & Quick Operational Actions) */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur lg:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-foreground lg:hidden"
              aria-label="Abrir menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="lg:hidden">
              <BenitLogo href="/dashboard" />
            </div>
            <div className="hidden items-center gap-2 text-xs text-foreground-muted lg:flex">
              <span>Organização:</span>
              <span className="font-medium text-foreground">
                {tenant.organization.name}
              </span>
              <span className="text-border">/</span>
              <span className="font-medium text-brand">
                {tenant.store.name}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleToggleStoreOpen}
              disabled={isPending}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                isOpenState
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                  : "border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20"
              )}
            >
              <Power className="h-3.5 w-3.5" />
              <span>{isOpenState ? "Loja Aberta" : "Loja Fechada"}</span>
            </button>

            <Link
              href={`/menu/${tenant.store.slug}`}
              target="_blank"
              className="hidden items-center gap-1.5 rounded-lg border border-border bg-surface-card px-3 py-1.5 text-xs font-medium text-foreground hover:border-brand/50 sm:inline-flex"
            >
              <span>Cardápio Público</span>
              <ExternalLink className="h-3.5 w-3.5 text-brand" />
            </Link>
          </div>
        </header>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 flex lg:hidden">
            <div
              className="fixed inset-0 bg-black/75 backdrop-blur-sm"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="relative z-10 flex w-72 flex-col border-r border-border bg-surface">
              <div className="flex h-16 items-center justify-between border-b border-border px-5">
                <BenitLogo href="/dashboard" />
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-lg p-1.5 text-foreground-muted hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <nav className="flex-1 space-y-1 p-4">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    pathname === item.href ||
                    pathname.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        "flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium",
                        isActive
                          ? "bg-brand/15 text-brand border border-brand/30"
                          : "text-foreground-muted hover:bg-surface-card hover:text-foreground"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="h-4 w-4" />
                        <span>{item.label}</span>
                      </div>
                      {item.badge !== undefined && (
                        <Badge variant={item.badgeVariant} className="tabular-nums">
                          {item.badge}
                        </Badge>
                      )}
                    </Link>
                  );
                })}
              </nav>
              <div className="border-t border-border p-4">
                <form action={logoutAction}>
                  <Button
                    type="submit"
                    variant="secondary"
                    className="w-full justify-center"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Sair da conta</span>
                  </Button>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Page Content */}
        <main className="flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

