import Link from "next/link";
import { cn } from "@/lib/utils";

interface BenitLogoProps {
  className?: string;
  href?: string;
  showTagline?: boolean;
}

export function BenitLogo({
  className,
  href = "/dashboard",
  showTagline = false,
}: BenitLogoProps) {
  const content = (
    <div className={cn("inline-flex flex-col select-none", className)}>
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand font-heading text-xs font-extrabold tracking-tight text-white">
          B
        </span>
        <span className="font-heading text-lg font-extrabold uppercase tracking-wider text-foreground">
          BENIT<span className="text-brand">.</span>
        </span>
      </div>
      {showTagline && (
        <span className="mt-0.5 text-[11px] font-medium tracking-wide text-foreground-muted">
          Sua operação. Sob controle.
        </span>
      )}
    </div>
  );

  if (!href) return content;
  return <Link href={href}>{content}</Link>;
}

