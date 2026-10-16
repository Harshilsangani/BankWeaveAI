"use client";
import { ScanLine } from "lucide-react";
import { Button } from "@/shared/ui/primitives";

export function ActionCard({
  label,
  onClick,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button className="action-card" variant="primary" onClick={onClick} disabled={disabled}>
      <ScanLine size={16} />
      {label}
    </Button>
  );
}
