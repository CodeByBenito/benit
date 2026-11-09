import Link from "next/link";
import { cn } from "@/lib/utils";

interface BenitLogoProps {
  className?: string;
  href?: string | null;
  showTagline?: boolean;
  tone?: "light" | "dark";
}

/**
 * Wordmark: lowercase display "benit" with the orange live-order dot as the
 * tittle of the "i" — the same dot that pulses when an order arrives.
 */
export function BenitLogo({ className, href = "/dashboard", showTagline = false, tone = "light" }: BenitLogoProps) {
  const content = (
    <span className={cn("inline-flex select-none flex-col", className)}>
      <span className="sr-only">BENIT</span>
      <span
        aria-hidden
        className={cn(
          "relative font-display text-[1.45rem] font-extrabold leading-none tracking-[-0.06em]",
          tone === "light" ? "text-foreground" : "text-cream-ink"
        )}
        style={{ fontVariationSettings: '"opsz" 96, "wdth" 85' }}
      >
        ben
        <span className="relative inline-block">
          ı
          <span className="absolute left-1/2 top-[0.02em] h-[0.2em] w-[0.2em] -translate-x-1/2 rounded-full bg-brand" />
        </span>
        t
      </span>
      {showTagline && (
        <span className={cn("mt-1 text-[11px] font-medium tracking-wide", tone === "light" ? "text-foreground-muted" : "text-cream-muted")}>
          Sua operação. Sob controle.
        </span>
      )}
    </span>
  );

  if (!href) return content;
  return (
    <Link href={href} aria-label="BENIT — início" className="rounded-md focus-visible:outline-offset-4">
      {content}
    </Link>
  );
}
