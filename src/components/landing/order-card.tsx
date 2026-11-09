import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { brl } from "./motion";
import { DEMO_ORDER } from "./content";

/** The demo order card — same component in the hero hint and in the peak. */
export const OrderCard = forwardRef<HTMLDivElement, { className?: string; statusLabel?: string; compact?: boolean }>(
  function OrderCard({ className, statusLabel = "Novo", compact = false }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          "relative w-full rounded-xl border border-white/10 bg-surface-elevated p-3.5 text-left shadow-float sm:p-4",
          className
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-xs text-foreground-muted">#{String(DEMO_ORDER.number).padStart(4, "0")}</span>
          <span
            data-status
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-medium text-brand sm:text-[11px]"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-brand" />
            <span data-status-label>{statusLabel}</span>
          </span>
        </div>
        <p className="mt-2 font-display text-base font-semibold tracking-tight text-foreground">{DEMO_ORDER.customer}</p>
        {!compact && (
          <ul className="mt-2 space-y-0.5 text-[13px] text-foreground-muted">
            {DEMO_ORDER.items.map((i) => (
              <li key={i.name}>
                <span className="font-mono text-foreground">{i.qty}×</span> {i.name}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-2.5 text-xs">
          <span className="truncate text-foreground-muted max-lg:hidden">{DEMO_ORDER.fulfillment}</span>
          <span className="text-foreground-muted lg:hidden">Entrega</span>
          <span className="font-mono font-medium text-foreground">{brl(DEMO_ORDER.totalCents)}</span>
        </div>
      </div>
    );
  }
);
