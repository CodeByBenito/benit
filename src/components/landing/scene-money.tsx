"use client";

import { useMemo, useRef } from "react";
import { Check, Ticket } from "lucide-react";
import { brl, gsap, MOTION_OK, useGSAP } from "./motion";

const ZONES = [
  { name: "Centro", fee: 500, eta: "25–35 min" },
  { name: "Vila Nova", fee: 700, eta: "30–40 min" },
  { name: "Jardim América", fee: 900, eta: "35–50 min" },
  { name: "São João", fee: 1200, eta: "45–60 min" },
];

/** Deterministic pseudo-QR so server and client render the same pattern. */
function useQrCells(size = 25) {
  return useMemo(() => {
    let seed = 412;
    const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    const cells: { x: number; y: number }[] = [];
    const finder = (x: number, y: number) =>
      [0, size - 7].some((ox) => [0, size - 7].some((oy) => !(ox === size - 7 && oy === size - 7) && x >= ox && x < ox + 7 && y >= oy && y < oy + 7));
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (finder(x, y)) continue;
        if (rand() > 0.52) cells.push({ x, y });
      }
    }
    return cells;
  }, [size]);
}

/**
 * Scene 5 — Money & delivery (dark, high energy).
 * Effect family: pixel resolve + counters. The QR resolves cell by cell as you
 * scroll, then stamps "Pago"; the neighborhood fees count up row by row.
 */
export function SceneMoney() {
  const root = useRef<HTMLElement>(null);
  const cells = useQrCells();

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const tl = gsap.timeline({
          scrollTrigger: { trigger: "[data-qr-wrap]", start: "top 75%", end: "center 40%", scrub: 0.7 },
        });
        tl.from("[data-qr-finder]", { opacity: 0, scale: 0.6, transformOrigin: "center", stagger: 0.1, duration: 0.3 })
          .from("[data-qr-cell]", { opacity: 0, duration: 0.6, stagger: { each: 0.002, from: "random" } }, "<")
          .fromTo("[data-paid]", { opacity: 0, scale: 1.4, rotate: -8 }, { opacity: 1, scale: 1, rotate: -4, duration: 0.25, ease: "back.out(2)" });

        gsap.utils.toArray<HTMLElement>("[data-zone]").forEach((row, i) => {
          const fee = row.querySelector<HTMLElement>("[data-fee]")!;
          const target = ZONES[i].fee;
          const obj = { v: 0 };
          gsap
            .timeline({ scrollTrigger: { trigger: row, start: "top 85%", toggleActions: "play none none reverse" } })
            .from(row, { opacity: 0, x: 24, duration: 0.7, ease: "expo.out" })
            .to(obj, { v: target, duration: 0.8, ease: "power2.out", onUpdate: () => { fee.textContent = brl(obj.v); } }, "<0.1");
        });

        gsap.from("[data-coupon]", {
          opacity: 0,
          y: 20,
          rotate: 4,
          duration: 0.9,
          ease: "back.out(1.6)",
          scrollTrigger: { trigger: "[data-coupon]", start: "top 90%" },
        });
      });
      return () => mm.revert();
    },
    { scope: root }
  );

  return (
    <section ref={root} id="pagamentos" className="relative overflow-hidden bg-background" aria-labelledby="money-title">
      <div className="mx-auto max-w-[1400px] px-4 py-28 sm:px-8 sm:py-40">
        <div className="max-w-3xl">
          <p className="eyebrow">Dinheiro e entrega</p>
          <h2 id="money-title" className="mt-4 font-display text-display-lg font-extrabold">
            O Pix cai na sua conta. A taxa se calcula sozinha<span className="text-brand">.</span>
          </h2>
        </div>

        <div className="mt-16 grid gap-6 lg:grid-cols-2 lg:gap-8">
          {/* Pix */}
          <article className="relative overflow-hidden rounded-3xl border border-white/[0.07] bg-surface p-6 sm:p-10">
            <div data-qr-wrap className="relative mx-auto w-full max-w-[280px]">
              <div className="rounded-2xl bg-cream p-4">
                <svg viewBox="0 0 25 25" className="block h-auto w-full" role="img" aria-label="QR Code Pix ilustrativo" shapeRendering="crispEdges">
                  {[
                    [0, 0],
                    [18, 0],
                    [0, 18],
                  ].map(([x, y]) => (
                    <g key={`${x}-${y}`} data-qr-finder>
                      <rect x={x} y={y} width="7" height="7" fill="#101010" />
                      <rect x={x + 1} y={y + 1} width="5" height="5" fill="#F3F3F0" />
                      <rect x={x + 2} y={y + 2} width="3" height="3" fill="#101010" />
                    </g>
                  ))}
                  {cells.map((c) => (
                    <rect key={`${c.x}-${c.y}`} data-qr-cell x={c.x} y={c.y} width="1" height="1" fill="#101010" />
                  ))}
                </svg>
              </div>
              <div
                data-paid
                className="absolute -right-4 -top-4 flex items-center gap-2 rounded-full bg-success px-4 py-2 font-display text-lg font-extrabold text-background shadow-float sm:-right-8"
                style={{ transform: "rotate(-4deg)" }}
              >
                <Check className="h-5 w-5" strokeWidth={3} /> Pago
              </div>
            </div>
            <h3 className="mt-10 font-display text-display-sm font-bold">Pix e cartão, confirmados sem você tocar.</h3>
            <p className="mt-3 max-w-md text-base leading-relaxed text-foreground-muted">
              Você conecta a sua conta Mercado Pago e o dinheiro vai direto pra ela. Quando o pagamento é aprovado, o pedido entra no
              quadro e o estoque é reservado. Se não for pago no prazo, ele se cancela sozinho.
            </p>
          </article>

          {/* Delivery */}
          <article className="flex flex-col rounded-3xl border border-white/[0.07] bg-surface p-6 sm:p-10">
            <p className="font-mono text-xs text-foreground-muted">Taxas por bairro · exemplo</p>
            <ul className="mt-5 divide-y divide-white/[0.06]">
              {ZONES.map((z) => (
                <li key={z.name} data-zone className="flex items-center justify-between gap-4 py-4">
                  <div>
                    <p className="font-display text-lg font-semibold">{z.name}</p>
                    <p className="text-sm text-foreground-muted">{z.eta}</p>
                  </div>
                  <span data-fee className="font-mono text-lg tabular-nums text-foreground">
                    {brl(z.fee)}
                  </span>
                </li>
              ))}
            </ul>
            <div
              data-coupon
              className="mt-6 inline-flex items-center gap-3 self-start rounded-xl border border-dashed border-brand/60 bg-brand/[0.08] px-4 py-3"
            >
              <Ticket className="h-5 w-5 text-brand" />
              <span className="font-mono text-sm font-medium tracking-wider text-foreground">BEMVINDO10</span>
              <span className="rounded-md bg-brand px-2 py-0.5 text-xs font-semibold text-white">−10%</span>
            </div>
            <h3 className="mt-auto pt-10 font-display text-display-sm font-bold">O checkout faz a conta por você.</h3>
            <p className="mt-3 max-w-md text-base leading-relaxed text-foreground-muted">
              O cliente escolhe o bairro e vê a taxa, o prazo e o pedido mínimo na hora. Cupons respeitam validade e limite por cliente —
              e o valor final é sempre recalculado no servidor.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
