"use client";
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;
export function DialogContent({
  children,
  className,
  onEscapeKeyDown,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="dialog-overlay" />
      <DialogPrimitive.Content
        className={cn("dialog-content", className)}
        {...props}
        onEscapeKeyDown={(event) => {
          onEscapeKeyDown?.(event);
          // Radix handles Escape in capture, before the Select's React handler.
          // Let an open list consume it before dismissing its parent dialog.
          const target = event.target;
          if (target instanceof HTMLElement && (
            target.closest("[data-tg-popup]") ||
            target.closest('[role="combobox"][aria-expanded="true"]')
          )) event.preventDefault();
        }}
      >
        {children}
        <DialogPrimitive.Close className="dialog-close" aria-label="Закрыть">
          <X size={18} />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
