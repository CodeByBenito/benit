"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Clock, MapPin, MessageCircle, Plus, Search, ShoppingBag } from "lucide-react";
import { WEEKDAY_SHORT } from "@/lib/labels";
import { cn, formatCurrencyCents } from "@/lib/utils";
import { CheckoutSheet } from "./public/checkout-sheet";
import { ProductSheet } from "./public/product-sheet";
import type { CartItem, PublicCategory, PublicDeliveryZone, PublicProduct, PublicStoreInfo } from "./public/types";
import { useBag } from "./public/use-bag";

export type { PublicCategory, PublicProduct, PublicStoreInfo, PublicDeliveryZone } from "./public/types";

function todayHours(store: PublicStoreInfo) {
  const dow = new Date().getDay();
  const slots = store.hours.filter((h) => h.weekday === dow);
  if (!store.hours.length) return null;
  if (!slots.length) return `Fechado hoje (${WEEKDAY_SHORT[dow]})`;
  return slots.map((s) => `${s.opens_at}–${s.closes_at}`).join(" · ");
}

export function PublicMenuClient({
  store,
  categories,
  products,
  zones,
}: {
  store: PublicStoreInfo;
  categories: PublicCategory[];
  products: PublicProduct[];
  zones: PublicDeliveryZone[];
}) {
  const bag = useBag(store.id);
  const [selected, setSelected] = useState<PublicProduct | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const bagBtnRef = useRef<HTMLButtonElement>(null);
  const coverRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const [bump, setBump] = useState(0);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);
  const accepting = store.accepting_now;

  /** A brand dot flies from the "Adicionar" button into the bag, then the bag bumps. */
  const flyToBag = useCallback((origin?: DOMRect) => {
    const target = bagBtnRef.current?.getBoundingClientRect();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!origin || reduce) {
      setBump((n) => n + 1);
      return;
    }
    const dot = document.createElement("span");
    dot.setAttribute("aria-hidden", "true");
    Object.assign(dot.style, {
      position: "fixed",
      left: `${origin.left + origin.width / 2 - 10}px`,
      top: `${origin.top + origin.height / 2 - 10}px`,
      width: "20px",
      height: "20px",
      borderRadius: "999px",
      background: "#FF6A00",
      boxShadow: "0 0 0 6px rgba(255,106,0,0.25)",
      zIndex: "70",
      pointerEvents: "none",
    });
    document.body.appendChild(dot);
    // The bag may still be off-screen on the first add: aim at its resting spot.
    const restingTop = window.innerHeight - 56;
    const tx = target ? target.left + 40 - (origin.left + origin.width / 2) : 0;
    const ty = (target ? Math.min(target.top + 20, restingTop) : restingTop) - (origin.top + origin.height / 2);
    const anim = dot.animate(
      [
        { transform: "translate(0,0) scale(1)", opacity: 1 },
        { transform: `translate(${tx * 0.5}px, ${ty * 0.5 - 120}px) scale(1.2)`, opacity: 1, offset: 0.5 },
        { transform: `translate(${tx}px, ${ty}px) scale(0.4)`, opacity: 0.2 },
      ],
      { duration: 650, easing: "cubic-bezier(0.5, 0, 0.2, 1)" }
    );
    anim.onfinish = () => {
      dot.remove();
      setBump((n) => n + 1);
    };
  }, []);

  const handleAdd = useCallback(
    (item: Omit<CartItem, "key">, origin?: DOMRect) => {
      bag.add(item);
      flyToBag(origin);
    },
    [bag, flyToBag]
  );

  // Sliding pill under the active category.
  useLayoutEffect(() => {
    const el = navRef.current?.querySelector<HTMLElement>(`[data-cat="${activeCat}"]`);
    if (!el) {
      setIndicator(null);
      return;
    }
    setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
  }, [activeCat, query]);

  // Gentle cover parallax.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = Math.min(window.scrollY, 400);
        if (coverRef.current) coverRef.current.style.transform = `translateY(${y * 0.35}px) scale(${1 + y / 2000})`;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);


  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const visible = products.filter((p) => !q || p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q));
    const byCat = categories
      .map((c) => ({ category: c, items: visible.filter((p) => p.category_id === c.id) }))
      .filter((s) => s.items.length);
    const orphans = visible.filter((p) => !p.category_id || !categories.some((c) => c.id === p.category_id));
    if (orphans.length) byCat.push({ category: { id: "outros", name: "Outros", description: null }, items: orphans });
    return byCat;
  }, [products, categories, query]);

  // Products rise in as they enter the viewport.
  useEffect(() => {
    const items = mainRef.current?.querySelectorAll<HTMLElement>("[data-reveal]:not(.is-in)");
    if (!items?.length) return;
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        }),
      { rootMargin: "0px 0px -8% 0px" }
    );
    items.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [sections]);

  // Scrollspy for the sticky category nav.
  useEffect(() => {
    setActiveCat((prev) => prev ?? sections[0]?.category.id ?? null);
    const els = sections.map((s) => document.getElementById(`cat-${s.category.id}`)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActiveCat(top.target.id.replace("cat-", ""));
      },
      { rootMargin: "-120px 0px -60% 0px" }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [sections]);

  useEffect(() => {
    if (!activeCat || !navRef.current) return;
    navRef.current.querySelector(`[data-cat="${activeCat}"]`)?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [activeCat]);

  const hours = todayHours(store);
  const minFee = zones.length ? Math.min(...zones.map((z) => z.fee_cents)) : null;

  return (
    <div className="min-h-screen bg-background pb-32">
      {/* Cover */}
      <header className="relative">
        <div className="relative h-44 overflow-hidden sm:h-64">
          <div ref={coverRef} className="h-full w-full will-change-transform">
          {store.banner_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={store.banner_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div aria-hidden className="grain h-full w-full bg-[radial-gradient(ellipse_at_20%_0%,rgba(255,106,0,0.35),transparent_60%),linear-gradient(180deg,#1C1C1C,#101010)]" />
          )}
          </div>
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
        </div>
        <div className="relative mx-auto -mt-14 max-w-3xl px-4 sm:-mt-16">
          <div className="flex items-end gap-4">
            {store.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={store.logo_url} alt={`Logo ${store.name}`} className="h-20 w-20 rounded-2xl border-4 border-background object-cover shadow-float sm:h-24 sm:w-24" />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-background bg-brand font-display text-3xl font-extrabold text-white shadow-float sm:h-24 sm:w-24">
                {store.name.charAt(0)}
              </div>
            )}
          </div>
          <h1 className="mt-4 font-display text-display-md font-extrabold">{store.name}</h1>
          {store.description ? <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-foreground-muted">{store.description}</p> : null}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span className={cn("inline-flex items-center gap-2 font-medium", accepting ? "text-success" : "text-danger")}>
              <span className={cn("h-2 w-2 rounded-full", accepting ? "bg-success" : "bg-danger")} />
              {accepting ? "Aberto agora" : "Fechado no momento"}
            </span>
            {hours ? (
              <span className="inline-flex items-center gap-1.5 text-foreground-muted">
                <Clock className="h-3.5 w-3.5" /> {hours}
              </span>
            ) : null}
            {store.fulfillment.delivery ? (
              <span className="text-foreground-muted">
                Entrega ~{store.default_eta_minutes} min{minFee !== null ? ` · a partir de ${formatCurrencyCents(minFee)}` : ""}
              </span>
            ) : null}
            {store.min_order_cents ? <span className="text-foreground-muted">Mínimo {formatCurrencyCents(store.min_order_cents)}</span> : null}
          </div>
          {store.address || store.whatsapp ? (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-foreground-muted">
              {store.address ? (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" /> {store.address}
                </span>
              ) : null}
              {store.whatsapp ? (
                <a
                  href={`https://wa.me/${store.whatsapp.replace(/\D/g, "").replace(/^(?!55)(\d{10,11})$/, "55$1")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 hover:text-foreground"
                >
                  <MessageCircle className="h-3.5 w-3.5" /> Falar com a loja
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      {/* Sticky nav */}
      <div className="sticky top-0 z-30 mt-6 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="mx-auto max-w-3xl px-4">
          <div className="relative pt-3">
            <Search className="pointer-events-none absolute left-3 top-[calc(50%+6px)] h-4 w-4 -translate-y-1/2 text-foreground-subtle" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar no cardápio"
              aria-label="Buscar no cardápio"
              className="h-10 w-full rounded-full border border-border bg-surface pl-9 pr-4 text-sm placeholder:text-foreground-subtle focus-visible:border-brand/60 focus-visible:outline-none"
            />
          </div>
          <nav ref={navRef} aria-label="Categorias" className="relative -mx-4 flex gap-1 overflow-x-auto px-4 py-3 [scrollbar-width:none]">
            {indicator ? (
              <span
                aria-hidden
                className="absolute top-3 h-[calc(100%-1.5rem)] rounded-full bg-foreground transition-[left,width] duration-slow ease-out-expo"
                style={{ left: indicator.left, width: indicator.width }}
              />
            ) : null}
            {sections.map((s) => (
              <a
                key={s.category.id}
                data-cat={s.category.id}
                href={`#cat-${s.category.id}`}
                className={cn(
                  "relative z-10 shrink-0 rounded-full px-3.5 py-1.5 text-sm transition-colors duration-slow",
                  activeCat === s.category.id ? "font-medium text-background" : "text-foreground-muted hover:text-foreground"
                )}
              >
                {s.category.name}
              </a>
            ))}
          </nav>
        </div>
      </div>

      {!accepting ? (
        <div className="mx-auto mt-6 max-w-3xl px-4">
          <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            A loja não está recebendo pedidos agora. Você pode ver o cardápio e voltar no horário de funcionamento.
          </p>
        </div>
      ) : null}

      <main ref={mainRef} className="mx-auto max-w-3xl px-4">
        {sections.length === 0 ? (
          <p className="py-20 text-center text-foreground-muted">{query ? "Nada encontrado com esse nome." : "Cardápio em preparação."}</p>
        ) : null}
        {sections.map((s) => (
          <section key={s.category.id} id={`cat-${s.category.id}`} className="scroll-mt-32 pt-10" aria-labelledby={`h-${s.category.id}`}>
            <h2 id={`h-${s.category.id}`} className="font-display text-xl font-extrabold tracking-tight">
              {s.category.name}
            </h2>
            {s.category.description ? <p className="mt-1 text-sm text-foreground-muted">{s.category.description}</p> : null}
            <ul className="mt-4 divide-y divide-border">
              {s.items.map((p, idx) => {
                const soldOut = !p.is_available || !p.in_stock;
                const inBag = bag.items.filter((i) => i.productId === p.id).reduce((n, i) => n + i.quantity, 0);
                return (
                  <li key={p.id} data-reveal style={{ transitionDelay: `${Math.min(idx, 6) * 60}ms` }}>
                    <button
                      type="button"
                      onClick={() => setSelected(p)}
                      disabled={soldOut}
                      className="group -mx-2 flex w-[calc(100%+1rem)] gap-4 rounded-2xl px-2 py-4 text-left transition-colors duration-base hover:bg-surface/70 active:scale-[0.995] disabled:cursor-not-allowed"
                    >
                      <div className="min-w-0 flex-1">
                        <p className={cn("font-medium", soldOut && "text-foreground-muted")}>
                          {inBag ? <span className="mr-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 font-mono text-[11px] text-white">{inBag}</span> : null}
                          {p.name}
                        </p>
                        {p.description ? <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-foreground-muted">{p.description}</p> : null}
                        <p className="mt-2 font-mono text-sm">{soldOut ? <span className="text-foreground-subtle">Esgotado</span> : formatCurrencyCents(p.price_cents)}</p>
                      </div>
                      <div className="relative shrink-0">
                        {p.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.image_url} alt="" loading="lazy" className={cn("h-24 w-24 rounded-xl object-cover transition-transform duration-slow ease-out-expo group-hover:scale-[1.04] sm:h-28 sm:w-28", soldOut && "grayscale")} />
                        ) : (
                          <div aria-hidden className="h-24 w-24 rounded-xl bg-gradient-to-br from-surface-elevated to-surface sm:h-28 sm:w-28" />
                        )}
                        {!soldOut ? (
                          <span className="absolute -bottom-2 -right-2 flex h-9 w-9 items-center justify-center rounded-full border-4 border-background bg-foreground text-background transition-transform duration-base ease-spring group-hover:scale-110">
                            <Plus className="h-4 w-4" />
                          </span>
                        ) : null}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        <p className="py-16 text-center text-xs text-foreground-subtle">
          Pedidos com <span className="font-display font-extrabold tracking-tight text-foreground-muted">benit</span>
        </p>
      </main>

      {/* Floating bag */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 p-4 transition-transform duration-slow ease-out-expo sm:p-6",
          bag.count > 0 ? "translate-y-0" : "translate-y-[140%]"
        )}
      >
        <button
          key={bump}
          ref={bagBtnRef}
          type="button"
          onClick={() => setCheckoutOpen(true)}
          className={cn(
            "mx-auto flex h-14 w-full max-w-3xl items-center justify-between rounded-full bg-brand px-6 text-white shadow-glow transition-colors hover:bg-brand-hover",
            bump > 0 && "animate-bag-bump"
          )}
        >
          <span className="flex items-center gap-3 font-semibold">
            <ShoppingBag className="h-5 w-5" /> Ver sacola
            <span aria-live="polite" className="rounded-full bg-white/20 px-2 py-0.5 font-mono text-xs tabular-nums">{bag.count}</span>
          </span>
          <span className="font-mono font-medium">{formatCurrencyCents(bag.subtotalCents)}</span>
        </button>
      </div>

      <ProductSheet product={selected} onClose={() => setSelected(null)} onAdd={handleAdd} disabled={!accepting} />
      <CheckoutSheet open={checkoutOpen} onOpenChange={setCheckoutOpen} store={store} zones={zones} bag={bag} />
    </div>
  );
}
