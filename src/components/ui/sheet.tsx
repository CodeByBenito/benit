"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;
export const SheetTitle = DialogPrimitive.Title;
export const SheetDescription = DialogPrimitive.Description;

/**
 * Side panel on desktop, bottom sheet on mobile (side="responsive").
 */
export const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    side?: "right" | "bottom" | "responsive";
  }
>(({ className, children, side = "responsive", ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm data-[state=open]:animate-overlay-in" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed z-50 flex flex-col border-border bg-surface shadow-float focus:outline-none",
        side === "right" && "inset-y-0 right-0 h-full w-full max-w-md border-l data-[state=open]:animate-slide-in-right",
        side === "bottom" && "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-3xl border-t data-[state=open]:animate-slide-in-bottom",
        side === "responsive" &&
          "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-3xl border-t data-[state=open]:animate-slide-in-bottom sm:inset-x-auto sm:inset-y-0 sm:right-0 sm:h-full sm:max-h-none sm:w-full sm:max-w-md sm:rounded-none sm:border-l sm:border-t-0 sm:data-[state=open]:animate-slide-in-right",
        className
      )}
      {...props}
    >
      <div aria-hidden className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-border-strong sm:hidden" />
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-md p-1.5 text-foreground-muted transition-colors hover:bg-surface-card hover:text-foreground">
        <X className="h-4 w-4" />
        <span className="sr-only">Fechar</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
SheetContent.displayName = "SheetContent";
