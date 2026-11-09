"use client";

import { Toaster as Sonner, toast } from "sonner";

export function Toaster() {
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            "!rounded-xl !border !border-border !bg-surface-elevated !text-foreground !shadow-float !font-sans",
          description: "!text-foreground-muted",
          actionButton: "!bg-brand !text-white",
        },
      }}
    />
  );
}

export { toast };
