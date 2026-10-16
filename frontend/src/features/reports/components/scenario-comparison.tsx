"use client";
import { ChevronDown } from "lucide-react";
import { money } from "@/shared/lib/utils";
import type { ScenarioResult } from "@/features/reports/legacy-types";
import { Badge } from "@/shared/ui/primitives";

export function ScenarioComparison({ result }: { result: ScenarioResult }) {
  return (
    <div className="scenario-result">
      <div className="simulation-label">
        <Badge tone="amber">Simulation · estimated</Badge>
        <span>No controls applied</span>
      </div>
      <div className="scenario-comparison">
        <div>
          <span>Current exposure</span>
          <strong>{money(result.baseline)}</strong>
          <small>Flagged transaction value</small>
        </div>
        <div className="scenario-after">
          <span>Scenario exposure</span>
          <strong>{money(result.projected)}</strong>
          <small>
            {(result.baseline ? (result.reduction / result.baseline) * 100 : 0).toFixed(0)}% modeled
            reduction
          </small>
        </div>
      </div>
      <div className="scenario-bars">
        <div>
          <span>Current</span>
          <i style={{ width: "100%" }} />
        </div>
        <div>
          <span>Scenario</span>
          <i
            style={{
              width: `${result.baseline ? (result.projected / result.baseline) * 100 : 0}%`,
            }}
          />
        </div>
      </div>
      <div className="scenario-details">
        <span>
          <b>{result.challenged}</b> transactions challenged
        </span>
        <span>
          <b>{result.abandoned}</b> estimated abandonments
        </span>
      </div>
      <details className="assumptions">
        <summary>
          Model assumptions & limitations <ChevronDown size={14} />
        </summary>
        <ul>
          {result.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
