"use client";

import { useRef } from "react";
import { PAINS } from "./content";
import { useCurtain } from "./fx";
import { gsap, MOTION_OK, useGSAP } from "./motion";

/**
 * Scene 2 — "O dia de hoje" (cream, low energy).
 * Right-anchored list of real kitchen pains. Each one gets crossed out by a
 * hand-drawn orange stroke as it passes the reading line. Calm, editorial.
 */
export function SceneChaos() {
  const root = useRef<HTMLElement>(null);
  useCurtain(root);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.utils.toArray<HTMLElement>("[data-pain]").forEach((el) => {
          const text = el.querySelector("[data-pain-text]");
          // background-size on an inline element draws the strike line by line, even when the text wraps.
          gsap
            .timeline({ scrollTrigger: { trigger: el, start: "top 72%", end: "top 40%", scrub: 0.6 } })
            .fromTo(text, { backgroundSize: "0% 0.11em" }, { backgroundSize: "100% 0.11em", ease: "none" })
            .to(text, { color: "#8F8F88", ease: "none" }, 0);
        });
        gsap.from("[data-closer]", {
          opacity: 0,
          y: 30,
          ease: "expo.out",
          duration: 1.2,
          scrollTrigger: { trigger: "[data-closer]", start: "top 85%" },
        });
      });
      // Reduced motion: final state, already crossed out.
      mm.add("(prefers-reduced-motion: reduce)", () => {
        gsap.set("[data-pain-text]", { backgroundSize: "100% 0.11em", color: "#8F8F88" });
      });
      return () => mm.revert();
    },
    { scope: root }
  );

  return (
    <section ref={root} id="como-funciona" className="relative bg-cream text-cream-ink" aria-labelledby="chaos-title">
      <div className="mx-auto grid max-w-[1400px] gap-16 px-4 py-28 sm:px-8 sm:py-40 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="lg:sticky lg:top-32 lg:self-start">
          <p className="font-mono text-eyebrow uppercase text-cream-muted">Antes</p>
          <h2 id="chaos-title" className="mt-5 font-display text-display-lg font-extrabold">
            O dia de quem vive de cozinha.
          </h2>
          <p className="mt-6 max-w-sm text-base leading-relaxed text-cream-muted">
            Se você reconheceu pelo menos uma destas, o problema não é a sua equipe. É a falta de um lugar só para tudo.
          </p>
        </div>
        <ol className="space-y-8 sm:space-y-12 lg:text-right">
          {PAINS.map((pain, i) => (
            <li key={pain} data-pain className="relative">
              <span className="mb-2 block font-mono text-xs text-cream-muted">{String(i + 1).padStart(2, "0")}</span>
              <span
                data-pain-text
                className="font-display text-display-sm font-semibold sm:text-display-md"
                style={{
                  backgroundImage: "linear-gradient(#FF6A00, #FF6A00)",
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "0 58%",
                  backgroundSize: "0% 0.11em",
                }}
              >
                {pain}
              </span>
            </li>
          ))}
          <li data-closer className="pt-10">
            <p className="font-display text-display-md font-extrabold">
              Tudo isso cabe numa tela<span className="text-brand-ink">.</span>
            </p>
          </li>
        </ol>
      </div>
    </section>
  );
}
