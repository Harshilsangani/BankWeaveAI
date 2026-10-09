"use client";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ArrowUpRight, Check, FolderOpen, Hexagon, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
export function Button({
  className,
  variant = "secondary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" }) {
  return <button className={cn("button", `button-${variant}`, className)} {...props} />;
}
export function Logo({ small = false }: { small?: boolean }) {
  return (
    <span className={cn("logo", small && "small")} aria-label="BankWeave AI">
      <span className="logo-symbol">
        <Hexagon strokeWidth={1.6} />
        <span />
      </span>
      {!small && (
        <span>
          BankWeave<span className="logo-ai">AI</span>
        </span>
      )}
    </span>
  );
}
export function Badge({ children, tone = "muted" }: { children: ReactNode; tone?: string }) {
  return <span className={cn("badge", `badge-${tone}`)}>{children}</span>;
}
export function SectionTitle({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children?: ReactNode;
}) {
  return (
    <div className="section-title">
      <div>
        <h2>{title}</h2>
        {sub && <p>{sub}</p>}
      </div>
      {children}
    </div>
  );
}
export function EmptyState({
  title,
  text,
  children,
  icon,
}: {
  title: string;
  text: string;
  children?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon" aria-hidden="true">
        {icon ?? <FolderOpen size={28} />}
      </span>
      <h2>{title}</h2>
      <p>{text}</p>
      {children}
    </div>
  );
}
export function Skeleton() {
  return (
    <div className="skeleton-grid" aria-label="Loading banking intelligence" role="status">
      {[0, 1, 2, 3].map((i) => (
        <div className="skeleton skeleton-kpi" key={i} />
      ))}
      <div className="skeleton skeleton-large" />
      <div className="skeleton skeleton-large" />
    </div>
  );
}
export function LoadingSteps({
  events = [],
}: {
  events?: import("@/services/operations").ProgressEvent[];
}) {
  return (
    <div className="loading-steps" role="status" aria-live="polite">
      <div className="loading-title">
        <Sparkles size={17} /> Operational progress <span className="streaming-dots">•••</span>
      </div>
      {!events.length && (
        <div className="loading-step">
          <Loader2 size={14} className="spin" /> Waiting for service response
        </div>
      )}
      {events.map((event) => (
        <div className="loading-step" key={event.stage}>
          {event.status === "complete" ? (
            <Check size={14} />
          ) : (
            <Loader2 size={14} className="spin" />
          )}
          {event.stage}
        </div>
      ))}
    </div>
  );
}
export function TextLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button className="text-link" onClick={onClick}>
      {children}
      <ArrowUpRight size={14} />
    </button>
  );
}
