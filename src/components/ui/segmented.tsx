"use client";

import type * as React from "react";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  disabled?: boolean;
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  name,
}: {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  className?: string;
  name: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={name}
      className={cn("grid auto-cols-fr grid-flow-col gap-1 rounded-xl border border-border bg-surface p-1", className)}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition-all duration-base ease-out-expo disabled:cursor-not-allowed disabled:opacity-40",
              active
                ? "bg-foreground text-background shadow-raised"
                : "text-foreground-muted hover:bg-surface-card hover:text-foreground"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
