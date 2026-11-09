"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn, formatCurrencyCents, parsePriceToCents } from "@/lib/utils";

export function SettingsSection({
  title,
  description,
  children,
  aside,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("grid gap-6 border-b border-border py-8 first:pt-0 last:border-0 lg:grid-cols-[280px_1fr] lg:gap-12", className)}>
      <div>
        <h2 className="font-display text-base font-bold tracking-tight">{title}</h2>
        {description ? <p className="mt-1.5 text-sm leading-relaxed text-foreground-muted">{description}</p> : null}
        {aside}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const id = React.useId();
  return (
    <div className="flex items-start justify-between gap-6 py-3">
      <label htmlFor={id} className="cursor-pointer">
        <span className="block text-sm font-medium">{label}</span>
        {description ? <span className="mt-0.5 block text-xs text-foreground-muted">{description}</span> : null}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  );
}

/** Currency input that edits a value in cents. */
export function MoneyInput({
  id,
  label,
  cents,
  onChange,
  placeholder = "0,00",
  allowEmpty,
}: {
  id: string;
  label: string;
  cents: number | null;
  onChange: (cents: number | null) => void;
  placeholder?: string;
  allowEmpty?: boolean;
}) {
  const [text, setText] = React.useState(cents == null ? "" : formatCurrencyCents(cents).replace("R$", "").trim());
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-foreground-subtle">R$</span>
        <Input
          id={id}
          inputMode="decimal"
          className="pl-9 font-mono"
          placeholder={placeholder}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (allowEmpty && !e.target.value.trim()) onChange(null);
            else onChange(parsePriceToCents(e.target.value));
          }}
          onBlur={() => {
            if (allowEmpty && !text.trim()) return;
            setText(formatCurrencyCents(parsePriceToCents(text)).replace("R$", "").trim());
          }}
        />
      </div>
    </div>
  );
}

export function FormMessage({ error, success }: { error?: string | null; success?: string | null }) {
  if (!error && !success) return null;
  return (
    <p
      role={error ? "alert" : "status"}
      className={cn("rounded-lg px-3 py-2 text-sm", error ? "bg-danger/10 text-danger" : "bg-success/10 text-success")}
    >
      {error ?? success}
    </p>
  );
}
