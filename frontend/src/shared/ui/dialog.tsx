"use client";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide = false,
  headerAction,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
  wide?: boolean;
  headerAction?: ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dialog-overlay" />
        <DialogPrimitive.Content
          className={`dialog-content ${wide ? "dialog-wide" : ""} ${headerAction ? "dialog-with-action" : ""}`}
        >
          <div className="dialog-header">
            <DialogPrimitive.Title className="dialog-title">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Description className="dialog-description">
              {description}
            </DialogPrimitive.Description>
            {headerAction && <div className="dialog-header-action">{headerAction}</div>}
            <DialogPrimitive.Close className="icon-button dialog-close" aria-label="Close dialog">
              <X size={17} />
            </DialogPrimitive.Close>
          </div>
          <div className="dialog-body">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
