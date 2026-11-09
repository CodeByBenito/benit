import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-base ease-out-expo active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-brand text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_6px_20px_-8px_rgba(255,106,0,0.6)] hover:bg-brand-hover",
        secondary:
          "bg-surface-card text-foreground border border-border shadow-hairline hover:bg-surface-elevated hover:border-border-strong",
        outline:
          "border border-border bg-transparent text-foreground hover:bg-surface-card",
        ghost: "text-foreground-muted hover:bg-surface-card hover:text-foreground",
        destructive:
          "bg-danger/10 text-danger border border-danger/30 hover:bg-danger/20",
        light: "bg-cream text-cream-ink hover:bg-white shadow-raised",
        link: "h-auto px-0 text-foreground underline-offset-4 hover:text-brand hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-11 rounded-xl px-6 text-[15px]",
        xl: "h-14 rounded-2xl px-8 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };

