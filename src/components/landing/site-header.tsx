"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { BenitLogo } from "@/components/layout/benit-logo";
import { cn } from "@/lib/utils";

export function SiteHeader({ ctaHref }: { ctaHref: string }) {
  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 24);
      setHidden(y > 400 && y > last + 4);
      if (y < last - 4) setHidden(false);
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-[transform,background-color,border-color] duration-slow ease-out-expo",
        hidden ? "-translate-y-full" : "translate-y-0",
        scrolled ? "border-b border-white/[0.06] bg-background/75 backdrop-blur-xl" : "border-b border-transparent"
      )}
    >
      <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-4 sm:px-8">
        <BenitLogo href="/" />
        <nav aria-label="Principal" className="hidden items-center gap-8 text-sm text-foreground-muted md:flex">
          <a href="#como-funciona" className="transition-colors hover:text-foreground">Como funciona</a>
          <a href="#pagamentos" className="transition-colors hover:text-foreground">Pagamentos</a>
          <a href="#duvidas" className="transition-colors hover:text-foreground">Dúvidas</a>
        </nav>
        <div className="flex items-center gap-2 sm:gap-4">
          <Link href="/login" className="hidden px-2 text-sm text-foreground-muted transition-colors hover:text-foreground sm:block">
            Entrar
          </Link>
          <a
            href={ctaHref}
            target={ctaHref.startsWith("http") ? "_blank" : undefined}
            rel="noopener noreferrer"
            className="group inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground pl-4 pr-3 text-sm font-medium text-background transition-colors hover:bg-white"
          >
            Falar com a gente
            <ArrowUpRight className="h-4 w-4 transition-transform duration-base ease-out-expo group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </a>
        </div>
      </div>
    </header>
  );
}
