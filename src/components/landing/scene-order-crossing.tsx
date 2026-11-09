"use client";

import { useRef, useState } from "react";
import { Check, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { BOARD_COLUMNS, DEMO_COUNTERS, DEMO_ORDER, DEMO_STORE, PEAK_STEPS } from "./content";
import { OrderCard } from "./order-card";
import { brl, gsap, MOTION_OK, useGSAP, useReducedMotion } from "./motion";

const STATUS_LABELS = ["Novo", "Confirmado", "Em preparo", "Pronto"] as const;

/**
 * Scene 3 — PEAK: "O pedido que atravessa" (dark, maximum energy, longest scroll).
 * Signature move: the scroll wheel *is* the kitchen. One real order crosses
 * NOVOS → CONFIRMADOS → EM PREPARO → PRONTOS; stock counters tick down on
 * confirmation; today's revenue ticks up when it's ready; the customer gets
 * the WhatsApp nudge. Built only from BENIT's real lifecycle.
 */
export function SceneOrderCrossing() {
  const root = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const board = root.current!.querySelector<HTMLElement>("[data-board]")!;
        const card = root.current!.querySelector<HTMLElement>("[data-travel-card]")!;
        const slots = gsap.utils.toArray<HTMLElement>("[data-slot]", root.current);

        const pos = (i: number) => {
          const b = board.getBoundingClientRect();
          const s = slots[i].getBoundingClientRect();
          return { x: s.left - b.left, y: s.top - b.top, w: s.width };
        };

        const stockEls = gsap.utils.toArray<HTMLElement>("[data-stock]", root.current);
        const revenueEl = root.current!.querySelector<HTMLElement>("[data-revenue]")!;
        const stockState = DEMO_COUNTERS.stock.map((s) => ({ v: s.before }));
        const revenue = { v: DEMO_COUNTERS.revenueBefore };

        let lastStep = -1;
        const tl = gsap.timeline({
          defaults: { ease: "power3.inOut" },
          scrollTrigger: {
            trigger: root.current,
            start: "top top",
            end: "+=340%",
            pin: "[data-pin]",
            scrub: 0.8,
            invalidateOnRefresh: true,
            onUpdate: (self) => {
              const p = self.progress;
              const next = p < 0.27 ? 0 : p < 0.52 ? 1 : p < 0.77 ? 2 : 3;
              if (next !== lastStep) {
                lastStep = next;
                setStep(next);
              }
            },
          },
        });

        tl.set(card, { x: () => pos(0).x, y: () => pos(0).y, width: () => pos(0).w })
          // Arrival
          .fromTo(card, { opacity: 0, y: () => pos(0).y - 48, scale: 0.96 }, { opacity: 1, y: () => pos(0).y, scale: 1, duration: 0.6, ease: "expo.out" })
          .to({}, { duration: 0.5 })
          // → Confirmados + stock deduction
          .to(card, { x: () => pos(1).x, y: () => pos(1).y, duration: 1 })
          .to(
            stockState,
            {
              v: (i: number) => DEMO_COUNTERS.stock[i].after,
              duration: 0.8,
              ease: "steps(4)",
              onUpdate: () => { stockState.forEach((s, i) => { stockEls[i].textContent = String(Math.round(s.v)); }); },
            },
            "<0.4"
          )
          .to({}, { duration: 0.5 })
          // → Em preparo
          .to(card, { x: () => pos(2).x, y: () => pos(2).y, duration: 1 })
          .to({}, { duration: 0.5 })
          // → Prontos + revenue + WhatsApp nudge
          .to(card, { x: () => pos(3).x, y: () => pos(3).y, duration: 1 })
          .to(
            revenue,
            {
              v: DEMO_COUNTERS.revenueBefore + DEMO_ORDER.totalCents,
              duration: 0.7,
              ease: "power2.out",
              onUpdate: () => { revenueEl.textContent = brl(revenue.v); },
            },
            "<0.5"
          )
          .fromTo("[data-wa]", { opacity: 0, y: 16, scale: 0.92 }, { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: "back.out(1.8)" }, "<0.2")
          .to({}, { duration: 0.6 });
      });
      mm.add("(prefers-reduced-motion: reduce)", () => setStep(3));
      return () => mm.revert();
    },
    { scope: root }
  );

  const current = reduced ? 3 : step;

  return (
    <section ref={root} className="relative bg-background" aria-labelledby="peak-title">
      <div data-pin className="relative flex min-h-[100svh] flex-col overflow-hidden py-20 sm:py-24">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col px-4 sm:px-8">
          {/* Top row: title + live counters */}
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="eyebrow">O pedido que atravessa · {DEMO_STORE}</p>
              <h2 id="peak-title" className="mt-3 font-display text-display-md font-extrabold sm:text-display-lg">
                Role. A cozinha anda junto<span className="text-brand">.</span>
              </h2>
            </div>
            <dl className="flex gap-2 overflow-x-auto pb-1 sm:gap-3" aria-label="Contadores do painel (demonstração)">
              <div className="min-w-[132px] rounded-xl border border-white/[0.08] bg-surface px-3.5 py-2.5">
                <dt className="text-[11px] text-foreground-muted">Faturamento hoje</dt>
                <dd data-revenue className="mt-0.5 font-mono text-sm font-medium tabular-nums text-foreground sm:text-base">
                  {brl(current === 3 && reduced ? DEMO_COUNTERS.revenueBefore + DEMO_ORDER.totalCents : DEMO_COUNTERS.revenueBefore)}
                </dd>
              </div>
              {DEMO_COUNTERS.stock.map((s) => (
                <div key={s.name} className="min-w-[104px] rounded-xl border border-white/[0.08] bg-surface px-3.5 py-2.5">
                  <dt className="truncate text-[11px] text-foreground-muted">{s.name}</dt>
                  <dd className="mt-0.5 font-mono text-sm font-medium tabular-nums text-foreground sm:text-base">
                    <span data-stock>{reduced ? s.after : s.before}</span>
                    <span className="ml-1 text-[11px] text-foreground-subtle">un</span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Board */}
          <div data-board className="relative mt-6 grid flex-1 grid-cols-2 gap-2 sm:mt-8 sm:gap-3 lg:grid-cols-4">
            {BOARD_COLUMNS.map((col, i) => (
              <div
                key={col.key}
                className={cn(
                  "flex min-h-[176px] flex-col rounded-2xl border p-2 transition-[border-color,background-color] duration-slow sm:p-3 lg:min-h-[340px]",
                  i === current ? "border-brand/40 bg-brand/[0.04]" : "border-white/[0.07] bg-white/[0.015]"
                )}
              >
                <div className="mb-2 flex items-center justify-between px-1 sm:mb-3">
                  <span className={cn("font-mono text-[10px] uppercase tracking-[0.14em] sm:text-[11px]", i === current ? "text-brand" : "text-foreground-subtle")}>
                    {col.label}
                  </span>
                  <span className="font-mono text-[10px] text-foreground-subtle">{i <= current ? (i === current ? 1 : 0) : 0}</span>
                </div>
                <div data-slot className="relative min-h-[132px] lg:min-h-[168px]">
                  {reduced && i === 3 ? <OrderCard statusLabel={STATUS_LABELS[3]} compact={false} /> : null}
                </div>
                <div aria-hidden className="mt-2 hidden h-12 rounded-xl border border-white/[0.04] bg-white/[0.02] lg:block" />
              </div>
            ))}

            {!reduced && (
              <div data-travel-card className="pointer-events-none absolute left-0 top-0 z-10 opacity-0" aria-hidden>
                <OrderCard statusLabel={STATUS_LABELS[step]} className="max-lg:[&_ul]:hidden" />
              </div>
            )}

            <div
              data-wa
              className="absolute -bottom-3 right-2 z-20 max-w-[260px] rounded-2xl rounded-br-md bg-[#1F3B2C] px-3.5 py-2.5 text-[13px] leading-snug text-[#E6F4EA] shadow-float sm:right-4"
              style={{ opacity: reduced ? 1 : 0 }}
            >
              <span className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-[#7FD7A0]">
                <MessageCircle className="h-3.5 w-3.5" /> WhatsApp · para {DEMO_ORDER.customer}
              </span>
              {DEMO_ORDER.customer}, seu pedido #{DEMO_ORDER.number} está pronto e já vai sair para entrega.
            </div>
          </div>

          {/* Narration */}
          <div className="mt-8 grid gap-6 sm:mt-10 lg:grid-cols-[1fr_auto] lg:items-end">
            {reduced ? (
              <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {PEAK_STEPS.map((s) => (
                  <li key={s.title}>
                    <p className="font-display text-lg font-semibold">{s.title}</p>
                    <p className="mt-1 text-sm text-foreground-muted">{s.body}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="relative min-h-[96px] max-w-xl" aria-live="polite">
                {PEAK_STEPS.map((s, i) => (
                  <div
                    key={s.title}
                    className={cn(
                      "absolute inset-0 transition-all duration-slow ease-out-expo",
                      i === step ? "translate-y-0 opacity-100" : i < step ? "-translate-y-3 opacity-0" : "translate-y-3 opacity-0"
                    )}
                    aria-hidden={i !== step}
                  >
                    <p className="font-display text-display-sm font-bold">{s.title}</p>
                    <p className="mt-2 text-base text-foreground-muted">{s.body}</p>
                  </div>
                ))}
              </div>
            )}
            {!reduced && (
              <ol className="flex items-center gap-2" aria-label="Etapas">
                {STATUS_LABELS.map((label, i) => (
                  <li key={label} className="flex items-center gap-2">
                    <span
                      className={cn(
                        "flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-colors duration-slow",
                        i < step && "border-white/10 text-foreground-muted",
                        i === step && "border-brand bg-brand text-white",
                        i > step && "border-white/[0.06] text-foreground-subtle"
                      )}
                    >
                      {i < step ? <Check className="h-3 w-3" /> : null}
                      {label}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
