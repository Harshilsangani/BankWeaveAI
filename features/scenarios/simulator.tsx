"use client";
import { useEffect, useState } from "react";
import { FlaskConical, Loader2, RotateCcw } from "lucide-react";
import type { QueryContext, RiskEvent, ScenarioResult } from "@/types";
import { runScenario, getStaffIdentity } from "@/services";
import { Button, EmptyState } from "@/components/ui";
import { InsightCard, ScenarioComparison } from "@/components/blocks";
import { scopeLabel } from "@/lib/utils";
export function Simulator({
  risks,
  riskId,
  scope,
  onRisk,
  result,
  onResult,
  onReport,
  reportBusy,
}: {
  risks: RiskEvent[];
  riskId: string;
  scope?: QueryContext;
  onRisk: (id: string) => void;
  result?: ScenarioResult;
  onResult: (result: ScenarioResult) => void;
  onReport: (id: string) => void;
  reportBusy: boolean;
}) {
  const [coverage, setCoverage] = useState(80),
    [effectiveness, setEffectiveness] = useState(65),
    [friction, setFriction] = useState(5);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [canRun, setCanRun] = useState(false);
  useEffect(() => {
    let active = true;
    void getStaffIdentity()
      .then((identity) => {
        if (active) setCanRun(identity.permissions.includes("analyze"));
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (result && result.input.riskId === riskId) {
      setCoverage(result.input.coverage);
      setEffectiveness(result.input.effectiveness);
      setFriction(result.input.friction);
    }
  }, [riskId, result]);
  const visible =
    result?.input.riskId === riskId &&
    (result.input.scope?.region ?? "") ===
      (scope?.region ?? (riskId === "RSK-003" ? "Ahmedabad" : "")) &&
    (result.input.scope?.comparison ?? "") === (scope?.comparison ?? "") &&
    (result.input.scope?.minAmount ?? 0) === (scope?.minAmount ?? 0) &&
    !!result.input.scope?.newDeviceOnly === (scope?.newDeviceOnly ?? riskId === "RSK-003")
      ? result
      : undefined;
  const stale =
    visible &&
    (visible.input.coverage !== coverage ||
      visible.input.effectiveness !== effectiveness ||
      visible.input.friction !== friction);
  async function run() {
    if (!canRun) return;
    setBusy(true);
    setError("");
    try {
      onResult(await runScenario({ riskId, coverage, effectiveness, friction, scope }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scenario could not be calculated.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="animate-in">
      <div className="page-heading">
        <div>
          <h1>Scenario Simulator</h1>
          <p>Test a control change before making a decision.</p>
        </div>
        <Button
          variant="ghost"
          onClick={() => {
            setCoverage(80);
            setEffectiveness(65);
            setFriction(5);
          }}
        >
          <RotateCcw size={14} />
          Reset assumptions
        </Button>
      </div>
      <div className="scenario-layout">
        <section className="panel scenario-controls">
          <h3>Stronger authentication</h3>
          <label className="field">
            Transaction segment
            <select value={riskId} onChange={(e) => onRisk(e.target.value)} disabled={busy}>
              {risks
                .filter((r) => r.category === "fraud")
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
            </select>
          </label>
          {[
            {
              label: "Authentication coverage",
              value: coverage,
              setter: setCoverage,
              max: 100,
              help: "Share of flagged transactions receiving an additional challenge.",
            },
            {
              label: "Assumed effectiveness",
              value: effectiveness,
              setter: setEffectiveness,
              max: 100,
              help: "Assumed share of exposure prevented among challenged transactions.",
            },
            {
              label: "Challenge abandonment",
              value: friction,
              setter: setFriction,
              max: 30,
              help: "Estimated share of challenged transactions abandoned by customers.",
            },
          ].map((field) => (
            <label className="field" key={field.label}>
              <span className="slider-label">
                {field.label}
                <strong>{field.value}%</strong>
              </span>
              <input
                aria-label={field.label}
                type="range"
                min={0}
                max={field.max}
                step={1}
                value={field.value}
                onChange={(e) => field.setter(Number(e.target.value))}
                disabled={busy}
              />
              <small>{field.help}</small>
            </label>
          ))}
          <Button variant="primary" onClick={run} disabled={busy || !canRun}>
            {busy ? <Loader2 size={15} className="spin" /> : <FlaskConical size={15} />}
            {busy ? "Modeling scenario…" : "Run simulation"}
          </Button>
          {error && (
            <p role="alert" className="text-amber">
              {error}
            </p>
          )}
        </section>
        <div className="scenario-output">
          <p className="muted text-xs">
            Analysis scope:{" "}
            {scopeLabel(
              scope ??
                (riskId === "RSK-003"
                  ? { domain: "fraud", region: "Ahmedabad", newDeviceOnly: true }
                  : undefined)
            )}
          </p>
          {visible ? (
            <section className="panel">
              {stale && (
                <p className="text-amber text-xs mb-5" role="status">
                  Assumptions changed. Run the simulation to update these results.
                </p>
              )}
              <ScenarioComparison result={visible} />
              <Button
                className="mt-6"
                onClick={() => onReport(riskId)}
                disabled={!!stale || busy || reportBusy}
              >
                {reportBusy ? "Preparing report…" : "Create report with this scenario"}
              </Button>
            </section>
          ) : (
            <EmptyState
              icon={<FlaskConical size={28} />}
              title="What could change?"
              text="Set your assumptions and run a simulation to compare current exposure with an estimated scenario."
            />
          )}
          <InsightCard
            title="Decision support, with clear limits"
            text="This is an illustrative arithmetic model using synthetic flagged transaction values. Effectiveness is an assumption you control, not a measured bank outcome. Customer friction and exposure trade-offs should be reviewed by a human before any intervention."
          />
        </div>
      </div>
    </div>
  );
}
