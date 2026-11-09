import * as React from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-14 text-center",
        className
      )}
    >
      {icon ? (
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface-card text-foreground-muted">
          {icon}
        </div>
      ) : null}
      <p className="font-display text-base font-semibold tracking-tight">{title}</p>
      {description ? <p className="mt-1.5 max-w-sm text-sm text-foreground-muted">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
