import * as React from "react";
import { Loader2 } from "lucide-react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
const buttonVariants = cva("button", {
  variants: {
    variant: {
      default: "button-primary",
      secondary: "button-secondary",
      ghost: "button-ghost",
      destructive: "button-danger",
    },
    size: { default: "", icon: "button-icon", sm: "button-small" },
  },
  defaultVariants: { variant: "default", size: "default" },
});
export function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  loadingText,
  disabled,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean; loading?: boolean; loadingText?: React.ReactNode }) {
  const classes = cn(buttonVariants({ variant, size, className }));
  // Loading is a data-action contract, never applied to slotted links.
  if (asChild) return <Slot className={classes} {...props}>{children}</Slot>;
  return (
    <button
      className={classes}
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading ? <><Loader2 size={16} className="spin" aria-hidden="true" />{size !== "icon" && (loadingText ?? children)}</> : children}
    </button>
  );
}
