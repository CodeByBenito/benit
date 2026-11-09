"use client";

import Link from "next/link";
import { useRef } from "react";
import { ArrowUpRight } from "lucide-react";
import { BOARD_COLUMNS, DEMO_ORDER } from "./content";
import { gsap, MOTION_OK, useGSAP } from "./motion";

/**
 * Scene 1 — Opening (dark, medium energy).
 * Display type rises line by line out of a mask; the board assembles as a
 * silhouette; a single orange dot pulses "novo pedido #0412" — the same order
 * that will cross the board in the peak.
 */
export function SceneHero({ ctaHref }: { ctaHref: string }) {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
        tl.from("[data-line]", { yPercent: 110, duration: 1.3, stagger: 0.09 })
          .from("[data-fade]", { opacity: 0, y: 14, duration: 0.9, stagger: 0.08 }, "-=0.8")
          .from("[data-col]", { opacity: 0, scaleY: 0.4, transformOrigin: "top", duration: 1.1, stagger: 0.07 }, "-=1.1")
          .from("[data-ghost]", { opacity: 0, y: 10, duration: 0.8, stagger: 0.05 }, "-=0.8")
          .from("[data-ping]", { opacity: 0, scale: 0.6, duration: 0.7, ease: "back.out(2)" }, "-=0.3");

        // Leaving the hero: type drifts up and dims while the board stays — hand-off to the next scenes.
        gsap.to("[data-hero-copy]", {
          yPercent: -18,
          opacity: 0.15,
          ease: "none",
          scrollTrigger: { trigger: root.current, start: "top top", end: "bottom top", scrub: true },
        });
      });
      return () => mm.revert();
    },
    { scope: root }
  );

  return (
    <section ref={root} className="relative isolate min-h-[100svh] overflow-hidden pt-28 sm:pt-32" aria-labelledby="hero-title">
      <div aria-hidden className="hairline-grid pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_70%_40%,black,transparent_70%)]" />
      <div className="mx-auto grid max-w-[1400px] gap-14 px-4 pb-20 sm:px-8 lg:grid-cols-[1.15fr_1fr] lg:items-end lg:gap-10">
        <div data-hero-copy className="relative">
          <p data-fade className="eyebrow mb-6 flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" /> Plataforma para negócios de comida
          </p>
          <h1 id="hero-title" className="font-display text-display-2xl font-extrabold text-foreground" style={{ fontVariationSettings: '"opsz" 96, "wdth" 82' }}>
            <span className="block overflow-hidden pb-[0.06em]">
              <span data-line className="block">Sua operação.</span>
            </span>
            <span className="block overflow-hidden pb-[0.06em]">
              <span data-line className="block">
                Sob controle<span className="text-brand">.</span>
              </span>
            </span>
          </h1>
          <p data-fade className="mt-8 max-w-xl text-lg leading-relaxed text-foreground-muted sm:text-xl">
            Cardápio digital, balcão e mesa num só quadro em tempo real. Estoque que se baixa sozinho, Pix que cai na sua conta e
            cliente acompanhando o pedido pelo celular.
          </p>
          <div data-fade className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-4">
            <a
              href={ctaHref}
              target={ctaHref.startsWith("http") ? "_blank" : undefined}
              rel="noopener noreferrer"
              className="group inline-flex h-14 items-center gap-3 rounded-full bg-brand pl-7 pr-2 text-base font-semibold text-white shadow-glow transition-colors hover:bg-brand-hover"
            >
              Falar com a gente no WhatsApp
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 transition-transform duration-slow ease-out-expo group-hover:rotate-45">
                <ArrowUpRight className="h-5 w-5" />
              </span>
            </a>
            <Link href="/register" className="text-sm font-medium text-foreground-muted underline decoration-white/20 underline-offset-[6px] transition-colors hover:text-foreground hover:decoration-brand">
              ou crie sua conta
            </Link>
          </div>
        </div>

        {/* Board silhouette */}
        <div aria-hidden className="relative">
          <div className="grid grid-cols-4 gap-2 sm:gap-3">
            {BOARD_COLUMNS.map((col, i) => (
              <div key={col.key} data-col className="flex min-h-[300px] flex-col rounded-2xl border border-white/[0.07] bg-white/[0.02] p-2 sm:min-h-[380px] sm:p-3">
                <span className="mb-3 truncate px-1 font-mono text-[10px] uppercase tracking-[0.14em] text-foreground-subtle sm:text-[11px]">
                  {col.label}
                </span>
                {i === 0 ? (
                  <div data-ping className="relative rounded-xl border border-brand/50 bg-brand/[0.08] p-2.5 sm:p-3">
                    <span className="absolute -right-1 -top-1 flex h-3 w-3">
                      <span className="absolute inline-flex h-full w-full animate-ring rounded-full bg-brand" />
                      <span className="relative inline-flex h-3 w-3 rounded-full bg-brand" />
                    </span>
                    <span className="block font-mono text-[10px] text-brand sm:text-[11px]">#{String(DEMO_ORDER.number).padStart(4, "0")}</span>
                    <span className="mt-1 block text-[11px] font-medium text-foreground sm:text-xs">Novo pedido</span>
                  </div>
                ) : null}
                {Array.from({ length: [1, 2, 2, 1][i] }).map((_, k) => (
                  <div key={k} data-ghost className="mt-2 h-14 rounded-xl border border-white/[0.05] bg-white/[0.025] sm:h-16" />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
