"use client";

import { useRef } from "react";
import { AlertTriangle, Minus, Plus, ShoppingBag } from "lucide-react";
import { brl, gsap, MOTION_OK, useGSAP } from "./motion";

const PANELS = [
  {
    eyebrow: "Para o seu cliente",
    title: "Um cardápio que vende sozinho.",
    body: "Link próprio, fotos, adicionais e checkout em etapas: entrega, retirada ou mesa. Abre no celular, sem instalar nada.",
  },
  {
    eyebrow: "Para você",
    title: "O dia inteiro numa olhada.",
    body: "Pedidos, faturamento e alertas na mesma tela, atualizados em tempo real em todos os aparelhos da equipe.",
  },
  {
    eyebrow: "Para o estoque",
    title: "Ninguém mais conta no olho.",
    body: "Cada pedido confirmado dá baixa. Cada cancelamento devolve. Você só é avisado quando algo está acabando.",
  },
] as const;

/**
 * Scene 4 — Three screens, one operation (cream, medium energy).
 * Effect family: horizontal track pinned to vertical scroll.
 */
export function SceneThreeScreens() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const track = root.current!.querySelector<HTMLElement>("[data-track]")!;
        const distance = () => Math.max(0, track.scrollWidth - window.innerWidth);
        gsap.to(track, {
          x: () => -distance(),
          ease: "none",
          scrollTrigger: {
            trigger: root.current,
            start: "top top",
            end: () => `+=${distance()}`,
            pin: true,
            scrub: 0.6,
            invalidateOnRefresh: true,
          },
        });
      });
      return () => mm.revert();
    },
    { scope: root }
  );

  return (
    <section ref={root} className="relative overflow-hidden bg-cream text-cream-ink" aria-labelledby="screens-title">
      <div className="flex min-h-[100svh] flex-col justify-center py-14 sm:py-20">
        <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-8">
          <p className="font-mono text-eyebrow uppercase text-cream-muted">Três telas, uma operação</p>
          <h2 id="screens-title" className="mt-4 max-w-3xl font-display text-display-md font-extrabold sm:text-display-lg">
            Do primeiro toque do cliente ao último item do estoque.
          </h2>
        </div>
        <div className="mt-8 motion-reduce:overflow-x-auto sm:mt-12">
          <div data-track className="flex w-max gap-5 px-4 sm:gap-8 sm:px-8 lg:pl-[max(2rem,calc((100vw-1400px)/2+2rem))]">
            {PANELS.map((p, i) => (
              <article
                key={p.title}
                className="grid w-[86vw] max-w-[1040px] gap-4 rounded-3xl bg-white p-5 shadow-cream sm:p-8 md:w-[78vw] lg:w-[72vw] lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-10"
              >
                <div className="order-2 lg:order-1">
                  <p className="font-mono text-xs text-cream-muted">
                    {String(i + 1).padStart(2, "0")} — {p.eyebrow}
                  </p>
                  <h3 className="mt-3 font-display text-display-sm font-extrabold">{p.title}</h3>
                  <p className="mt-3 max-w-md text-[15px] leading-relaxed text-cream-muted sm:text-base">{p.body}</p>
                </div>
                <div className="order-1 max-sm:[zoom:0.7] lg:order-2" aria-hidden>
                  {i === 0 ? <MenuMock /> : i === 1 ? <DashboardMock /> : <StockMock />}
                </div>
              </article>
            ))}
            <div className="w-4 shrink-0 sm:w-8" />
          </div>
        </div>
      </div>
    </section>
  );
}

function MenuMock() {
  const items = [
    { name: "Smash duplo", desc: "2 blends, cheddar, picles", price: 3490 },
    { name: "Batata rústica", desc: "Alecrim e flor de sal", price: 1490 },
    { name: "Limonada da casa", desc: "Hortelã fresca", price: 990 },
  ];
  return (
    <div className="mx-auto w-full max-w-[300px] rounded-[2.2rem] border-[6px] border-cream-ink bg-background p-3 text-foreground">
      <div className="rounded-2xl bg-gradient-to-br from-brand/30 via-surface to-surface p-4">
        <p className="font-display text-lg font-extrabold leading-tight">Smash da Vila</p>
        <p className="mt-1 flex items-center gap-1.5 text-[11px] text-foreground-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-success" /> Aberto · entrega em ~35 min
        </p>
      </div>
      <div className="mt-3 flex gap-1.5 text-[11px]">
        {["Burgers", "Porções", "Bebidas"].map((c, k) => (
          <span key={c} className={k === 0 ? "rounded-full bg-foreground px-2.5 py-1 text-background" : "rounded-full border border-border px-2.5 py-1 text-foreground-muted"}>
            {c}
          </span>
        ))}
      </div>
      <ul className="mt-3 space-y-2">
        {items.map((it, k) => (
          <li key={it.name} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-surface p-2.5">
            <div className="h-11 w-11 shrink-0 rounded-lg bg-gradient-to-br from-[#5a3a22] to-[#2a1d14]" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium">{it.name}</p>
              <p className="truncate text-[11px] text-foreground-muted">{it.desc}</p>
              <p className="mt-0.5 font-mono text-[12px]">{brl(it.price)}</p>
            </div>
            {k === 0 ? (
              <span className="flex items-center gap-1.5 rounded-full border border-border px-1.5 py-1 text-[11px]">
                <Minus className="h-3 w-3" /> 2 <Plus className="h-3 w-3" />
              </span>
            ) : (
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-white">
                <Plus className="h-3.5 w-3.5" />
              </span>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between rounded-xl bg-brand px-3.5 py-2.5 text-[13px] font-semibold text-white">
        <span className="flex items-center gap-2">
          <ShoppingBag className="h-4 w-4" /> Ver sacola · 2
        </span>
        <span className="font-mono">{brl(6980)}</span>
      </div>
    </div>
  );
}

function DashboardMock() {
  const bars = [38, 52, 44, 61, 58, 74, 66];
  return (
    <div className="rounded-2xl bg-background p-4 text-foreground sm:p-5">
      <div className="grid grid-cols-3 gap-2">
        {[
          ["Pedidos hoje", "37"],
          ["Faturamento", brl(129_250)],
          ["Ticket médio", brl(3_493)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-white/[0.07] bg-surface p-2.5 sm:p-3">
            <p className="truncate text-[10px] text-foreground-muted sm:text-[11px]">{k}</p>
            <p className="mt-1 truncate font-mono text-[13px] font-medium sm:text-base">{v}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-xl border border-white/[0.07] bg-surface p-3">
        <p className="text-[11px] text-foreground-muted">Últimos 7 dias</p>
        <div className="mt-3 flex h-28 items-end gap-2">
          {bars.map((h, k) => (
            <div key={k} className="flex-1 rounded-t-md bg-white/10" style={{ height: `${h}%` }}>
              {k === bars.length - 1 ? <div className="h-full rounded-t-md bg-brand" /> : null}
            </div>
          ))}
        </div>
      </div>
      <p className="mt-3 text-center text-[10px] text-foreground-subtle">Dados ilustrativos</p>
    </div>
  );
}

function StockMock() {
  const rows = [
    { name: "Pão brioche", qty: 46, max: 80 },
    { name: "Blend 90g", qty: 92, max: 120 },
    { name: "Cheddar fatiado", qty: 4, max: 60, low: true },
    { name: "Batata", qty: 20, max: 40 },
  ];
  return (
    <div className="rounded-2xl bg-background p-4 text-foreground sm:p-5">
      <div className="mb-3 flex items-center gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-[12px] text-warning">
        <AlertTriangle className="h-4 w-4 shrink-0" /> Cheddar fatiado abaixo do mínimo
      </div>
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.name} className="rounded-xl border border-white/[0.07] bg-surface p-3">
            <div className="flex items-center justify-between text-[13px]">
              <span>{r.name}</span>
              <span className={r.low ? "font-mono text-warning" : "font-mono text-foreground-muted"}>{r.qty} un</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div className={r.low ? "h-full rounded-full bg-warning" : "h-full rounded-full bg-foreground/70"} style={{ width: `${(r.qty / r.max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
