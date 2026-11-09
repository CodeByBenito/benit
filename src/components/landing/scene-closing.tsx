"use client";

import Link from "next/link";
import { useRef } from "react";
import { ArrowUpRight } from "lucide-react";
import { BenitLogo } from "@/components/layout/benit-logo";
import { gsap, MOTION_OK, useGSAP } from "./motion";

/**
 * Scene 7 — Closing (dark, resolved). Words slide in from opposite sides and
 * lock into one sentence; one clear call to action. The page ends, it doesn't fade.
 */
export function SceneClosing({ ctaHref }: { ctaHref: string }) {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap
          .timeline({ scrollTrigger: { trigger: root.current, start: "top 80%", end: "top 20%", scrub: 0.8 } })
          .from("[data-word-left]", { xPercent: -30, opacity: 0, ease: "power3.out" })
          .from("[data-word-right]", { xPercent: 30, opacity: 0, ease: "power3.out" }, "<")
          .from("[data-cta]", { y: 30, opacity: 0, ease: "power3.out" }, "<0.3");
      });
      return () => mm.revert();
    },
    { scope: root }
  );

  return (
    <section ref={root} className="relative overflow-hidden bg-background" aria-labelledby="closing-title">
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[60vw] w-[60vw] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/[0.07] blur-[120px]" />
      <div className="relative mx-auto max-w-[1400px] px-4 pb-16 pt-32 sm:px-8 sm:pt-48">
        <h2 id="closing-title" className="font-display text-display-xl font-extrabold" style={{ fontVariationSettings: '"opsz" 96, "wdth" 90' }}>
          <span data-word-left className="block">Bora colocar sua</span>
          <span data-word-right className="block text-right">
            cozinha sob controle<span className="text-brand">?</span>
          </span>
        </h2>
        <div data-cta className="mt-16 flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-md text-lg text-foreground-muted">
            Conta pra gente como funciona a sua operação. A gente mostra o BENIT rodando com o seu cardápio.
          </p>
          <a
            href={ctaHref}
            target={ctaHref.startsWith("http") ? "_blank" : undefined}
            rel="noopener noreferrer"
            className="group inline-flex h-16 items-center gap-4 rounded-full bg-brand pl-8 pr-2.5 text-lg font-semibold text-white shadow-glow transition-colors hover:bg-brand-hover"
          >
            Falar no WhatsApp
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 transition-transform duration-slow ease-out-expo group-hover:rotate-45">
              <ArrowUpRight className="h-5 w-5" />
            </span>
          </a>
        </div>

        <footer className="mt-32 flex flex-col gap-8 border-t border-white/[0.07] pt-10 text-sm text-foreground-muted sm:flex-row sm:items-center sm:justify-between">
          <BenitLogo href="/" showTagline />
          <nav aria-label="Rodapé" className="flex flex-wrap gap-x-8 gap-y-3">
            <Link href="/login" className="hover:text-foreground">Entrar</Link>
            <Link href="/register" className="hover:text-foreground">Criar conta</Link>
            <a href="#duvidas" className="hover:text-foreground">Dúvidas</a>
          </nav>
          <p className="text-xs text-foreground-subtle">© {new Date().getFullYear()} BENIT</p>
        </footer>
      </div>
    </section>
  );
}
