"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { BOARD_COLUMNS, DEMO_ORDER } from "./content";
import { Magnetic, SplitChars } from "./fx";
import { gsap, MOTION_OK, useGSAP, useReducedMotion } from "./motion";

/** Fictional live feed for the hero board (product demo, not business data). */
const FEED = [
  { who: "Ana", what: "2× Smash duplo" },
  { who: "Rafael", what: "1× Pizza marguerita" },
  { who: "Mesa 7", what: "3× Limonada" },
  { who: "Júlia", what: "1× Açaí 500 ml" },
  { who: "Pedro", what: "2× Pastel de carne" },
  { who: "Marina", what: "1× Poke salmão" },
  { who: "Lucas", what: "4× Coxinha" },
];

type Ticket = { id: number; who: string; what: string; col: number };

/**
 * Scene 1 — Opening (dark, medium energy).
 * Kinetic headline (per-letter rise + width morph), a spotlight that follows
 * the cursor across the grid, and a board that is actually alive: orders keep
 * arriving in "Novos" and sliding to the right — the product, breathing.
 */
export function SceneHero({ ctaHref }: { ctaHref: string }) {
  const root = useRef<HTMLElement>(null);
  const spot = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [tickets, setTickets] = useState<Ticket[]>([
    { id: 3, who: "Júlia", what: "1× Açaí 500 ml", col: 3 },
    { id: 2, who: "Mesa 7", what: "3× Limonada", col: 2 },
    { id: 1, who: "Rafael", what: "1× Pizza marguerita", col: 1 },
    { id: 0, who: DEMO_ORDER.customer, what: "2× Smash duplo", col: 0 },
  ]);

  // Live board: every few seconds everything advances one column and a new order lands in "Novos".
  useEffect(() => {
    if (reduced) return;
    let n = 4;
    const t = setInterval(() => {
      setTickets((prev) => {
        const moved = prev.map((tk) => ({ ...tk, col: tk.col + 1 })).filter((tk) => tk.col < 4);
        const f = FEED[n % FEED.length];
        n++;
        return [{ id: n, who: f.who, what: f.what, col: 0 }, ...moved];
      });
    }, 2600);
    return () => clearInterval(t);
  }, [reduced]);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
        tl.from("[data-char]", {
          yPercent: 115,
          rotate: 6,
          duration: 1.2,
          stagger: { each: 0.028, from: "start" },
        })
          .fromTo(
            "[data-headline]",
            { fontVariationSettings: '"opsz" 96, "wdth" 60' },
            { fontVariationSettings: '"opsz" 96, "wdth" 82', duration: 1.6, ease: "power3.out" },
            0
          )
          .from("[data-fade]", { opacity: 0, y: 16, duration: 0.9, stagger: 0.08 }, "-=0.9")
          .from("[data-col]", { opacity: 0, y: 30, duration: 1.1, stagger: 0.08 }, "-=1")
          .from("[data-spot]", { opacity: 0, duration: 1.4 }, "-=1");

        // Leaving the hero: copy drifts up and dims, board lags behind (depth).
        gsap.to("[data-hero-copy]", {
          yPercent: -16,
          opacity: 0.2,
          ease: "none",
          scrollTrigger: { trigger: root.current, start: "top top", end: "bottom top", scrub: true },
        });
        gsap.to("[data-hero-board]", {
          yPercent: 8,
          ease: "none",
          scrollTrigger: { trigger: root.current, start: "top top", end: "bottom top", scrub: true },
        });

        // Cursor spotlight on the grid.
        const xTo = gsap.quickTo(spot.current, "x", { duration: 0.9, ease: "power3" });
        const yTo = gsap.quickTo(spot.current, "y", { duration: 0.9, ease: "power3" });
        const move = (e: PointerEvent) => {
          const r = root.current!.getBoundingClientRect();
          xTo(e.clientX - r.left);
          yTo(e.clientY - r.top);
        };
        root.current!.addEventListener("pointermove", move);
        return () => root.current?.removeEventListener("pointermove", move);
      });
      return () => mm.revert();
    },
    { scope: root }
  );

  return (
    <section ref={root} className="relative isolate min-h-[100svh] overflow-hidden pt-28 sm:pt-32" aria-labelledby="hero-title">
      <div aria-hidden className="hairline-grid pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_70%_40%,black,transparent_70%)]" />
      <div
        ref={spot}
        data-spot
        aria-hidden
        className="pointer-events-none absolute -left-[300px] -top-[300px] -z-10 h-[600px] w-[600px] rounded-full bg-[radial-gradient(circle,rgba(255,106,0,0.16),transparent_60%)]"
        style={{ transform: "translate(70vw, 260px)" }}
      />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-b from-transparent to-background" />

      <div className="mx-auto grid max-w-[1400px] gap-14 px-4 pb-16 sm:px-8 lg:grid-cols-[1.15fr_1fr] lg:items-end lg:gap-10 lg:pb-24">
        <div data-hero-copy className="relative">
          <p data-fade className="eyebrow mb-6 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ring rounded-full bg-brand" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
            </span>
            Plataforma para negócios de comida
          </p>
          <h1
            id="hero-title"
            data-headline
            aria-label="Sua operação. Sob controle."
            className="font-display text-display-2xl font-extrabold text-foreground"
            style={{ fontVariationSettings: '"opsz" 96, "wdth" 82' }}
          >
            <span className="block overflow-hidden pb-[0.08em]">
              <SplitChars text="Sua operação." />
            </span>
            <span className="block overflow-hidden pb-[0.08em]">
              <SplitChars text="Sob controle" />
              <span aria-hidden data-char className="inline-block text-brand">.</span>
            </span>
          </h1>
          <p data-fade className="mt-8 max-w-xl text-lg leading-relaxed text-foreground-muted sm:text-xl">
            Cardápio digital, balcão e mesa num só quadro em tempo real. Estoque que se baixa sozinho, Pix que cai na sua conta e
            cliente acompanhando o pedido pelo celular.
          </p>
          <div data-fade className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-4">
            <Magnetic>
              <a
                href={ctaHref}
                target={ctaHref.startsWith("http") ? "_blank" : undefined}
                rel="noopener noreferrer"
                className="group relative inline-flex h-14 items-center gap-3 overflow-hidden rounded-full bg-brand pl-7 pr-2 text-base font-semibold text-white shadow-glow transition-colors hover:bg-brand-hover"
              >
                <span aria-hidden className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-slower ease-out-expo group-hover:translate-x-full" />
                <span className="relative">Falar com a gente no WhatsApp</span>
                <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white/15 transition-transform duration-slow ease-out-expo group-hover:rotate-45">
                  <ArrowUpRight className="h-5 w-5" />
                </span>
              </a>
            </Magnetic>
            <Link
              href="/register"
              className="text-sm font-medium text-foreground-muted underline decoration-white/20 underline-offset-[6px] transition-colors hover:text-foreground hover:decoration-brand"
            >
              ou crie sua conta
            </Link>
          </div>
        </div>

        {/* Live board */}
        <div data-hero-board aria-hidden className="relative">
          <div className="grid grid-cols-4 gap-2 sm:gap-3">
            {BOARD_COLUMNS.map((col, ci) => {
              const inCol = tickets.filter((t) => t.col === ci);
              return (
                <div
                  key={col.key}
                  data-col
                  className={cn(
                    "flex min-h-[280px] flex-col rounded-2xl border bg-white/[0.02] p-2 transition-colors duration-slow sm:min-h-[360px] sm:p-3",
                    ci === 0 ? "border-brand/25" : "border-white/[0.07]"
                  )}
                >
                  <span className="mb-3 flex items-center justify-between px-1 font-mono text-[10px] uppercase tracking-[0.14em] text-foreground-subtle sm:text-[11px]">
                    <span className="truncate">{col.label}</span>
                    <span className="tabular-nums max-sm:hidden">{inCol.length}</span>
                  </span>
                  <div className="flex flex-col gap-2">
                    {inCol.map((t) => (
                      <div
                        key={t.id}
                        className={cn(
                          "animate-fade-up rounded-xl border p-2.5 sm:p-3",
                          ci === 0 ? "border-brand/50 bg-brand/[0.08]" : "border-white/[0.06] bg-white/[0.03]"
                        )}
                      >
                        <span className={cn("block font-mono text-[10px] sm:text-[11px]", ci === 0 ? "text-brand" : "text-foreground-subtle")}>
                          #{String(400 + t.id).padStart(4, "0")}
                        </span>
                        <span className="mt-1 block truncate text-[11px] font-medium text-foreground sm:text-xs">{t.who}</span>
                        <span className="hidden truncate text-[10px] text-foreground-muted sm:block">{t.what}</span>
                      </div>
                    ))}
                    {Array.from({ length: Math.max(0, 2 - inCol.length) }).map((_, k) => (
                      <div key={`g${k}`} className="h-14 rounded-xl border border-dashed border-white/[0.05] sm:h-16" />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between px-1 font-mono text-[10px] text-foreground-subtle sm:text-[11px]">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-success" /> ao vivo · demonstração
            </span>
            <span>atualiza sozinho</span>
          </div>
        </div>
      </div>
    </section>
  );
}
