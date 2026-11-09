import type * as React from "react";
import { BenitLogo } from "./benit-logo";

const TICKER = [
  { n: 418, who: "Marina", what: "2× Smash duplo", col: "Novo" },
  { n: 417, who: "Rafael", what: "1× Pizza margherita", col: "Em preparo" },
  { n: 416, who: "Mesa 7", what: "3× Limonada", col: "Pronto" },
  { n: 415, who: "Júlia", what: "1× Açaí 500ml", col: "Confirmado" },
];

/**
 * Split auth layout: brand panel (desktop) with a quiet live-orders ticker,
 * form column on the right. Same visual language as the landing.
 */
export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[1.05fr_1fr]">
      <aside aria-hidden className="relative hidden overflow-hidden border-r border-border bg-surface lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="hairline-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_30%_30%,black,transparent_75%)]" />
        <div className="absolute -left-40 top-1/3 h-[480px] w-[480px] rounded-full bg-brand/10 blur-[120px]" />
        <div className="relative">
          <BenitLogo href="/" />
        </div>
        <div className="relative">
          <p className="font-display text-display-lg font-extrabold" style={{ fontVariationSettings: '"opsz" 96, "wdth" 85' }}>
            Sua operação.
            <br />
            Sob controle<span className="text-brand">.</span>
          </p>
          <ul className="mt-10 max-w-md space-y-2">
            {TICKER.map((t, i) => (
              <li
                key={t.n}
                className="flex animate-fade-up items-center justify-between rounded-xl border border-white/[0.06] bg-background/40 px-4 py-3 text-sm backdrop-blur"
                style={{ animationDelay: `${300 + i * 120}ms`, opacity: 1 - i * 0.18 }}
              >
                <span className="flex items-center gap-3">
                  <span className="font-mono text-xs text-foreground-subtle">#{t.n}</span>
                  <span className="font-medium">{t.who}</span>
                  <span className="hidden text-foreground-muted xl:inline">{t.what}</span>
                </span>
                <span className={i === 0 ? "rounded-full bg-brand px-2 py-0.5 text-[11px] font-medium text-white" : "rounded-full bg-surface-card px-2 py-0.5 text-[11px] text-foreground-muted"}>
                  {t.col}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-foreground-subtle">Pedidos, estoque e pagamentos num só lugar.</p>
      </aside>

      <main className="flex flex-col px-5 py-8 sm:px-10">
        <div className="lg:hidden">
          <BenitLogo href="/" />
        </div>
        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-12">
          <h1 className="font-display text-display-sm font-extrabold sm:text-[2.25rem] sm:leading-tight">{title}</h1>
          {subtitle ? <p className="mt-2 text-[15px] leading-relaxed text-foreground-muted">{subtitle}</p> : null}
          <div className="mt-8">{children}</div>
          {footer ? <div className="mt-8 border-t border-border pt-6 text-sm text-foreground-muted">{footer}</div> : null}
        </div>
      </main>
    </div>
  );
}

export function AuthError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="mb-5 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
      {message}
    </p>
  );
}
