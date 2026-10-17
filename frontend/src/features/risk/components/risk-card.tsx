"use client";
import { ChevronDown, ScanLine, ShieldCheck } from "lucide-react";
import { formatMoney } from "@/shared/lib/utils";
import type { RiskEvent } from "@/features/risk/types";
import { Badge, Button } from "@/shared/ui/primitives";

export function RiskCard({
  risk,
  onInvestigate,
  onEvidence,
  onDismiss,
  disabled = false,
}: {
  risk: RiskEvent;
  onInvestigate: (id: string) => void;
  onEvidence?: (risk: RiskEvent) => void;
  onDismiss?: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <article className={`risk-card severity-${risk.severity}`}>
      <div className="risk-card-top">
        <Badge tone={risk.severity}>
          {risk.severity === "high" ? <span className="severity-dot" /> : null}
          {risk.severity} risk
        </Badge>
        <span className="risk-id">{risk.id}</span>
      </div>
      <h3>
        {risk.title}
        <span>{risk.metric}</span>
      </h3>
      <p>{risk.summary}</p>
      {onEvidence && (
        <p className="risk-confidence">
          {risk.affectedRecords} affected {risk.id === "RSK-004" ? "loans" : "records"} ·{" "}
          {risk.detection?.rulesVersion ?? "Requires human review"}
        </p>
      )}
      <div className="risk-exposure">
        <span>
          {risk.id === "RSK-004" ? "Overdue principal under review" : "Exposure under review"}
        </span>
        <strong>{formatMoney(risk.estimatedExposure, risk.currency)}</strong>
      </div>
      {risk.detection && (
        <details className="analysis-details risk-lineage">
          <summary>
            <ShieldCheck size={13} />
            Rule & recorded run <ChevronDown size={13} className="lineage-chevron" />
          </summary>
          <div>
            <p className="mono">{risk.detection.runId}</p>
            <p>
              {risk.detection.threshold.name}: at least {risk.detection.threshold.minCount}{" "}
              {risk.detection.threshold.recordUnit ?? "records"}
              {risk.detection.threshold.minDaysPastDue !== undefined
                ? ` with ≥${risk.detection.threshold.minDaysPastDue} days past due and ${formatMoney((risk.detection.threshold.minOverdueMinor ?? 0) / 100, risk.currency)} unpaid principal`
                : ""}
              {risk.detection.threshold.minIncreasePct !== null
                ? ` and ≥${risk.detection.threshold.minIncreasePct}% count increase`
                : ""}
              .
            </p>
            <p>
              Observed: {risk.detection.currentCount} vs{" "}
              {risk.detection.baselineCount ?? "unavailable"}
              {risk.id === "RSK-004"
                ? " · Month-end repayment snapshots; growth is not required."
                : ` · ${risk.detection.observedIncreasePct?.toFixed(1) ?? "N/A"}% change.`}
            </p>
            <p>
              Sources:{" "}
              {Object.entries(risk.detection.sourceCounts)
                .map(([key, value]) => `${key}: ${value}`)
                .join(" · ")}
            </p>
            <small className="mono">
              {risk.detection.executedAt} · {risk.detection.inputHash.slice(0, 16)}
            </small>
          </div>
        </details>
      )}
      <div className="risk-card-bottom">
        <Button
          className="investigate-button"
          disabled={disabled}
          onClick={() => onInvestigate(risk.id)}
        >
          <ScanLine size={14} />
          Investigate
        </Button>
        {onEvidence && (
          <button className="subtle-button" onClick={() => onEvidence(risk)}>
            Evidence
          </button>
        )}
        {onDismiss && (
          <button className="subtle-button" disabled={disabled} onClick={() => onDismiss(risk.id)}>
            Dismiss
          </button>
        )}
      </div>
    </article>
  );
}
