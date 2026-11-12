import type * as React from "react";
import { BenitLogo } from "@/components/layout/benit-logo";
import { cn } from "@/lib/utils";

/**
 * One layout for every "something is not here / something broke" moment:
 * 404s and error boundaries of the site, the public menu, order tracking
 * and the panel. `embedded` drops the full-page frame for use inside a shell.
 */
export function StatusScreen({
  code,
  title,
  description,
  actions,
  reference,
  embedded = false,
  logoHref = "/",
}: {
  /** Short mono label above the title: "404", "Erro", "Fechado". */
  code: string;
  title: string;
  description: React.ReactNode;
  actions?: React.ReactNode;
  /** Error digest, shown small so support can find the log entry. */
  reference?: string | null;
  embedded?: boolean;
  logoHref?: string | null;
}) {
  const body = (
    <div className="relative mx-auto w-full max-w-xl">
      <p className="flex items-center gap-2.5 font-mono text-sm text-foreground-muted">
        <span aria-hidden className="h-2 w-2 rounded-full bg-brand" />
        {code}
      </p>
      <h1 className={cn("mt-4 font-display font-extrabold", embedded ? "text-display-sm sm:text-3xl" : "text-display-lg")} style={embedded ? undefined : { fontVariationSettings: '"opsz" 96, "wdth" 88' }}>
        {title}
      </h1>
      <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-foreground-muted">{description}</p>
      {actions ? <div className="mt-8 flex flex-wrap gap-3">{actions}</div> : null}
      {reference ? <p className="mt-8 font-mono text-xs text-foreground-subtle">Código para o suporte: {reference}</p> : null}
    </div>
  );

  if (embedded) {
    return <div className="flex min-h-[420px] items-center rounded-2xl border border-border bg-surface/50 p-6 sm:p-10">{body}</div>;
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-background">
      <div aria-hidden className="hairline-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_20%_20%,black,transparent_70%)]" />
      <div aria-hidden className="pointer-events-none absolute -left-40 top-1/3 h-[420px] w-[420px] rounded-full bg-brand/10 blur-[120px]" />
      <header className="relative px-5 py-6 sm:px-10">
        <BenitLogo href={logoHref} />
      </header>
      <main className="relative flex flex-1 items-center px-5 pb-24 sm:px-10">{body}</main>
    </div>
  );
}
