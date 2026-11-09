"use client";

import { useRef } from "react";
import * as Accordion from "@radix-ui/react-accordion";
import { Plus } from "lucide-react";
import { FAQ, INCLUDED, SECURITY, SHOW_TESTIMONIALS, TESTIMONIALS } from "./content";
import { useCurtain } from "./fx";
import { gsap, MOTION_OK, useGSAP } from "./motion";

/**
 * Scene 6 — Included, security & FAQ (cream, calm).
 * Effect family: quiet staggered entrance. Answers objections honestly.
 */
export function SceneIncluded() {
  const root = useRef<HTMLElement>(null);
  useCurtain(root);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.utils.toArray<HTMLElement>("[data-stagger]").forEach((group) => {
          gsap.from(group.children, {
            opacity: 0,
            y: 18,
            duration: 0.9,
            ease: "expo.out",
            stagger: 0.06,
            scrollTrigger: { trigger: group, start: "top 82%" },
          });
        });
      });
      return () => mm.revert();
    },
    { scope: root }
  );

  return (
    <section ref={root} id="duvidas" className="bg-cream text-cream-ink" aria-labelledby="included-title">
      <div className="mx-auto max-w-[1400px] px-4 py-28 sm:px-8 sm:py-40">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="font-mono text-eyebrow uppercase text-cream-muted">O que vem incluso</p>
            <h2 id="included-title" className="mt-4 font-display text-display-lg font-extrabold">
              Uma plataforma. Nenhum puxadinho.
            </h2>
          </div>
          <ul data-stagger className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
            {INCLUDED.map((item, i) => (
              <li key={item.title} className="group relative border-t border-cream-line pt-5">
                <span aria-hidden className="absolute -top-px left-0 h-0.5 w-0 bg-brand transition-all duration-slower ease-out-expo group-hover:w-full" />
                <span className="font-mono text-xs text-cream-muted">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="mt-2 font-display text-xl font-bold tracking-tight transition-transform duration-slow ease-out-expo group-hover:translate-x-1">{item.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-cream-muted">{item.body}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-28 rounded-3xl bg-cream-ink p-6 text-foreground sm:p-12">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="eyebrow">Segurança</p>
              <h2 className="mt-4 font-display text-display-md font-extrabold">Seus dados, trancados por loja.</h2>
            </div>
            <ul data-stagger className="grid gap-6 sm:grid-cols-3">
              {SECURITY.map((s) => (
                <li key={s.title}>
                  <span aria-hidden className="mb-4 block h-1 w-8 rounded-full bg-brand" />
                  <h3 className="font-display text-lg font-bold">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-foreground-muted">{s.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {SHOW_TESTIMONIALS && TESTIMONIALS.length > 0 ? (
          <div className="mt-28 grid gap-6 md:grid-cols-2">
            {TESTIMONIALS.map((t) => (
              <figure key={t.name} className="rounded-3xl bg-white p-8 shadow-cream">
                <blockquote className="font-display text-display-sm font-semibold">“{t.quote}”</blockquote>
                <figcaption className="mt-6 text-sm text-cream-muted">
                  {t.name} · {t.role}, {t.store}
                </figcaption>
              </figure>
            ))}
          </div>
        ) : null}

        <div className="mt-28 grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="font-mono text-eyebrow uppercase text-cream-muted">Dúvidas</p>
            <h2 className="mt-4 font-display text-display-md font-extrabold">Perguntas que todo dono faz.</h2>
          </div>
          <Accordion.Root type="single" collapsible className="divide-y divide-cream-line border-y border-cream-line">
            {FAQ.map((f, i) => (
              <Accordion.Item key={f.q} value={`q${i}`}>
                <Accordion.Header>
                  <Accordion.Trigger className="group flex w-full items-center justify-between gap-6 py-6 text-left font-display text-lg font-semibold tracking-tight transition-colors hover:text-brand-ink sm:text-xl">
                    {f.q}
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-cream-line transition-transform duration-slow ease-out-expo group-data-[state=open]:rotate-45 group-data-[state=open]:border-cream-ink group-data-[state=open]:bg-cream-ink group-data-[state=open]:text-cream">
                      <Plus className="h-4 w-4" />
                    </span>
                  </Accordion.Trigger>
                </Accordion.Header>
                <Accordion.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                  <p className="max-w-2xl pb-6 text-base leading-relaxed text-cream-muted">{f.a}</p>
                </Accordion.Content>
              </Accordion.Item>
            ))}
          </Accordion.Root>
        </div>
      </div>
    </section>
  );
}
