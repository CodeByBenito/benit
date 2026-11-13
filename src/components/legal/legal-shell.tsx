import Link from "next/link";
import type * as React from "react";
import { ArrowLeft, FileWarning } from "lucide-react";
import { BenitLogo } from "@/components/layout/benit-logo";
import { LEGAL_IS_DRAFT, LEGAL_UPDATED_AT, formatLegalDate } from "@/lib/legal";

/** Shared frame of the legal pages: quiet, readable, same brand language. */
export function LegalShell({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5">
          <BenitLogo href="/" />
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-foreground-muted transition-colors hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Voltar ao site
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-24 pt-14 sm:pt-20">
        <p className="eyebrow mb-4">Atualizado em {formatLegalDate(LEGAL_UPDATED_AT)}</p>
        <h1 className="font-display text-display-lg font-extrabold" style={{ fontVariationSettings: '"opsz" 96, "wdth" 88' }}>
          {title}
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-foreground-muted">{intro}</p>

        {LEGAL_IS_DRAFT ? (
          <aside role="note" aria-label="Texto em revisão" className="mt-10 flex gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-5 text-sm leading-relaxed">
            <FileWarning className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <p>
              <strong className="font-semibold text-foreground">Texto-modelo, ainda sem revisão jurídica.</strong>{" "}
              <span className="text-foreground-muted">
                Os trechos marcados com <Pending>a preencher</Pending> ou <Pending>a confirmar</Pending> dependem dos dados da empresa e de validação por um advogado antes de valerem como documento definitivo.
              </span>
            </p>
          </aside>
        ) : null}

        <div className="mt-12 space-y-12">{children}</div>
      </main>

      <footer className="border-t border-border">
        <nav aria-label="Documentos legais" className="mx-auto flex max-w-3xl flex-wrap gap-x-8 gap-y-3 px-5 py-8 text-sm text-foreground-muted">
          <Link href="/termos" className="hover:text-foreground">
            Termos de uso
          </Link>
          <Link href="/privacidade" className="hover:text-foreground">
            Política de privacidade
          </Link>
          <span className="text-foreground-subtle sm:ml-auto">© {new Date().getFullYear()} BENIT</span>
        </nav>
      </footer>
    </div>
  );
}

export function LegalSection({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24">
      <h2 id={`${id}-title`} className="font-display text-display-sm font-extrabold">
        {title}
      </h2>
      <div className="mt-4 space-y-4 text-[15px] leading-[1.75] text-foreground-muted [&_a]:text-foreground [&_a]:underline [&_a]:decoration-brand [&_a]:underline-offset-4 [&_li]:pl-1 [&_strong]:font-semibold [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}

/** Marks something that still has to be filled in or confirmed. */
export function Pending({ children }: { children: React.ReactNode }) {
  return <mark className="rounded bg-warning/20 px-1.5 py-0.5 font-mono text-[0.85em] text-warning">{children}</mark>;
}

/** A company field, or the "a preencher" marker while it is empty. */
export function Field({ value, label }: { value: string | null; label: string }) {
  return value ? <>{value}</> : <Pending>{label}: a preencher</Pending>;
}

/** A value that works as a proposal until legal review confirms it. */
export function ToConfirm({ children }: { children: React.ReactNode }) {
  if (!LEGAL_IS_DRAFT) return <>{children}</>;
  return (
    <>
      {children} <Pending>a confirmar</Pending>
    </>
  );
}

export function LegalTable({ caption, head, rows }: { caption: string; head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border">
      <table className="w-full min-w-[560px] text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-surface text-xs text-foreground-muted">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="px-4 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row, i) => (
            <tr key={i} className="align-top">
              {row.map((cell, j) => (
                <td key={j} className={j === 0 ? "px-4 py-3.5 font-medium text-foreground" : "px-4 py-3.5"}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
