"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { gsap, MOTION_OK, ScrollTrigger, useGSAP } from "./motion";

/** Thin orange reading-progress line at the very top of the page. */
export function ScrollProgress() {
  const bar = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    gsap.fromTo(
      bar.current,
      { scaleX: 0 },
      { scaleX: 1, ease: "none", scrollTrigger: { trigger: document.documentElement, start: "top top", end: "bottom bottom", scrub: 0.3 } }
    );
  });
  return <div ref={bar} aria-hidden className="fixed inset-x-0 top-0 z-[60] h-[2px] origin-left bg-brand" style={{ transform: "scaleX(0)" }} />;
}

/**
 * Magnetic wrapper: the child drifts toward the cursor and springs back.
 * Pointer-fine devices only; disabled for reduced motion.
 */
export function Magnetic({ children, strength = 0.35, className }: { children: React.ReactNode; strength?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!window.matchMedia("(pointer: fine)").matches || !window.matchMedia(MOTION_OK).matches) return;
    const xTo = gsap.quickTo(el, "x", { duration: 0.6, ease: "elastic.out(1, 0.4)" });
    const yTo = gsap.quickTo(el, "y", { duration: 0.6, ease: "elastic.out(1, 0.4)" });
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      xTo((e.clientX - (r.left + r.width / 2)) * strength);
      yTo((e.clientY - (r.top + r.height / 2)) * strength);
    };
    const leave = () => {
      xTo(0);
      yTo(0);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
    };
  }, [strength]);
  return (
    <span ref={ref} className={cn("inline-block will-change-transform", className)}>
      {children}
    </span>
  );
}

/**
 * Splits text into per-character spans (for kinetic type) while keeping the
 * accessible name intact: screen readers read the parent's aria-label.
 */
export function SplitChars({ text, className, charClassName }: { text: string; className?: string; charClassName?: string }) {
  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {Array.from(text).map((ch, i) => (
          <span key={i} data-char className={cn("inline-block will-change-transform", charClassName)}>
            {ch === " " ? " " : ch}
          </span>
        ))}
      </span>
    </span>
  );
}

/**
 * Cream "curtain": the section opens from a rounded inset mask as it enters,
 * so dark→cream transitions feel like a page turning instead of a hard cut.
 */
export function useCurtain(ref: React.RefObject<HTMLElement | null>) {
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.fromTo(
          ref.current,
          { clipPath: "inset(6% 3% 0% 3% round 48px)" },
          {
            clipPath: "inset(0% 0% 0% 0% round 0px)",
            ease: "none",
            scrollTrigger: { trigger: ref.current, start: "top bottom", end: "top 25%", scrub: true },
          }
        );
      });
      return () => mm.revert();
    },
    { scope: ref }
  );
}

/**
 * Infinite marquee whose speed and skew react to scroll velocity.
 */
export function VelocityMarquee({ items, className }: { items: string[]; className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const track = root.current!.querySelector<HTMLElement>("[data-track]")!;
        const loop = gsap.to(track, { xPercent: -50, ease: "none", duration: 38, repeat: -1 });
        const skewTo = gsap.quickTo(track, "skewX", { duration: 0.5, ease: "power3" });
        const st = ScrollTrigger.create({
          trigger: root.current,
          start: "top bottom",
          end: "bottom top",
          onUpdate: (self) => {
            const v = self.getVelocity();
            loop.timeScale(1 + Math.min(Math.abs(v) / 400, 5) * (v < 0 ? -1 : 1));
            skewTo(gsap.utils.clamp(-8, 8, v / -300));
          },
        });
        const settle = setInterval(() => {
          loop.timeScale(gsap.utils.interpolate(loop.timeScale(), 1, 0.15));
          skewTo(0);
        }, 120);
        return () => {
          clearInterval(settle);
          st.kill();
          loop.kill();
        };
      });
      return () => mm.revert();
    },
    { scope: root }
  );

  const row = (
    <>
      {items.map((it) => (
        <span key={it} className="flex shrink-0 items-center gap-8 pr-8">
          <span>{it}</span>
          <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-brand" />
        </span>
      ))}
    </>
  );

  return (
    <div ref={root} className={cn("overflow-hidden", className)} aria-label={items.join(", ")} role="marquee">
      <div data-track aria-hidden className="flex w-max whitespace-nowrap will-change-transform">
        {row}
        {row}
      </div>
    </div>
  );
}

/** Subtle 3D tilt following the pointer (desktop, motion OK). */
export function useTilt(ref: React.RefObject<HTMLElement | null>, max = 6) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!window.matchMedia("(pointer: fine)").matches || !window.matchMedia(MOTION_OK).matches) return;
    gsap.set(el, { transformPerspective: 1100, transformStyle: "preserve-3d" });
    const rx = gsap.quickTo(el, "rotationX", { duration: 0.5, ease: "power3" });
    const ry = gsap.quickTo(el, "rotationY", { duration: 0.5, ease: "power3" });
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      ry(((e.clientX - r.left) / r.width - 0.5) * max * 2);
      rx(-((e.clientY - r.top) / r.height - 0.5) * max * 2);
    };
    const leave = () => {
      rx(0);
      ry(0);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
    };
  }, [ref, max]);
}
