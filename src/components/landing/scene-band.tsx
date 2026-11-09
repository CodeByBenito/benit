"use client";

import { VelocityMarquee } from "./fx";

const ITEMS = ["Cardápio digital", "Pix na sua conta", "Entrega por bairro", "Estoque automático", "Pedido em tempo real", "Cupons", "Acompanhamento ao vivo"];

/**
 * Transition band between the opening and "O dia de hoje": a tilted strip of
 * product facts that speeds up and skews with scroll velocity.
 */
export function SceneBand() {
  return (
    <div className="relative z-10 -my-6 overflow-hidden py-6" aria-label="O que o BENIT faz">
      <div className="-rotate-2 border-y border-brand/30 bg-brand py-4 shadow-glow sm:py-5">
        <VelocityMarquee
          items={ITEMS}
          className="font-display text-2xl font-extrabold tracking-tight text-white sm:text-4xl [&_.bg-brand]:bg-white/70"
        />
      </div>
    </div>
  );
}
