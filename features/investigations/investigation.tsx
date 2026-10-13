"use client";
import { Check, ChevronLeft, Download, FlaskConical, ScanLine } from "lucide-react";
import type { Investigation as InvestigationData, RiskEvent } from "@/types";
import {
  ChartCard,
  DataTable,
  EvidenceCard,
  InsightCard,
  InvestigationTimeline,
  KpiCard,
  RiskCard,
} from "@/components/blocks";
import { Badge, Button, LoadingSteps } from "@/components/ui";
import { scopeLabel } from "@/lib/utils";
import { EvidenceBrowser } from "./evidence-browser";
import { CaseControls } from "./case-controls";
import { AnalysisDetails } from "@/features/analyst/data-controls";
import { RelationshipGraph } from "./relationship-graph";
export function Investigation({
  progress,
  onCancel,
  investigation,
  risks,
  loading,
  reportBusy,
  onInvestigate,
  canAnalyze,
  onReport,
  onScenario,
  onBack,
}: {
  progress: import("@/services/operations").ProgressEvent[];
  onCancel: () => void;
  investigation?: InvestigationData;
  risks: RiskEvent[];
  loading: boolean;
  reportBusy: boolean;
  onInvestigate: (id: string) => void;
  canAnalyze: boolean;
  onReport: () => void;
  onScenario: () => void;
  onBack: () => void;
}) {
  if (loading)
    return (
      <div className="animate-in">
        <div className="page-heading">
          <div>
            <div className="eyebrow">FOLLOWING THE EVIDENCE</div>
            <h1>Investigation workspace</h1>
            <p>Connecting signals, source records, and affected segments.</p>
          </div>
        </div>
        <LoadingSteps events={progress} />
        <Button variant="ghost" onClick={onCancel}>
          Cancel request
        </Button>
      </div>
    );
  if (!investigation)
    return (
      <div className="animate-in">
        <div className="page-heading">
          <div>
            <div className="eyebrow">FROM SIGNAL TO UNDERSTANDING</div>
            <h1>Investigations</h1>
            <p>Select a risk to open a dedicated evidence workspace.</p>
          </div>
        </div>
        <div className="risk-grid">
          {risks.map((r) => (
            <RiskCard key={r.id} risk={r} onInvestigate={onInvestigate} disabled={!canAnalyze} />
          ))}
        </div>
      </div>
    );
  return (
    <div className="animate-in">
      <button className="back-button" onClick={onBack}>
        <ChevronLeft size={14} />
        Back to Risk Radar
      </button>
      <div className="page-heading">
        <div>
          <div className="eyebrow">INVESTIGATION WORKSPACE</div>
          <h1>Follow the evidence.</h1>
          <p>One signal. The complete picture.</p>
        </div>
        <div className="page-actions">
          {investigation.risk.category === "fraud" &&
            investigation.scope.datasetId !== "bankshield" && (
              <Button onClick={onScenario} disabled={!canAnalyze}>
                <FlaskConical size={14} />
                Run a scenario
              </Button>
            )}
          <Button variant="primary" onClick={onReport} disabled={reportBusy || !canAnalyze}>
            <Download size={14} />
            {reportBusy ? "Preparing report…" : "Create report"}
          </Button>
        </div>
      </div>
      <div className="panel investigation-header">
        <div className="investigation-emblem">
          <ScanLine size={26} />
        </div>
        <div>
          <span className="risk-id">
            {investigation.id} / {investigation.analysis?.period ?? "SEPTEMBER 2026"}
          </span>
          <h2>{investigation.title}</h2>
          <p>{investigation.risk.summary}</p>
        </div>
        <Badge tone={investigation.risk.severity}>{investigation.risk.severity} severity</Badge>
      </div>
      <div className="completed-trace">
        {[
          "Request understood",
          "Data retrieved",
          "Patterns analyzed",
          "Metrics reconciled",
          "Findings generated",
        ].map((t) => (
          <span key={t}>
            <Check size={12} />
            {t}
          </span>
        ))}
      </div>
      <div className="response-kpis">
        {investigation.metrics.map((m) => (
          <KpiCard key={m.label} metric={m} />
        ))}
      </div>
      <p className="muted mt-4 text-xs">Analysis scope: {scopeLabel(investigation.scope)}</p>
      {investigation.analysis && <AnalysisDetails analysis={investigation.analysis} />}
      <div className="investigation-grid">
        <div className="investigation-main">
          <ChartCard
            title="How the signal developed"
            subtitle={
              investigation.analysis
                ? `${investigation.analysis.datasetName} · historical monthly count`
                : "April–September 2026 · monthly affected records"
            }
            points={investigation.trend}
          />
          <DataTable title="Affected regions & segments" data={investigation.segments} />
          <CaseControls key={investigation.id} id={investigation.id} />
          {investigation.relationshipGraph && (
            <RelationshipGraph
              key={`graph-${investigation.id}`}
              data={investigation.relationshipGraph}
            />
          )}
          {investigation.analysis && (
            <EvidenceBrowser key={`evidence-${investigation.id}`} scope={investigation.scope} />
          )}
          {investigation.findings.map((text, i) => (
            <InsightCard
              key={text}
              title={i === 0 ? "The pattern in the data" : "The largest contributor"}
              text={text}
            />
          ))}
          <div className="evidence-list">
            <h3 className="mb-2">Evidence trail</h3>
            {investigation.evidence.map((e) => (
              <EvidenceCard key={e.id} item={e} />
            ))}
          </div>
        </div>
        <aside className="investigation-side">
          <section className="panel">
            <h3>Investigation timeline</h3>
            <p className="muted text-xs mt-2">
              {investigation.analysis
                ? "Recorded local analysis stages · UTC"
                : "Demo event history · 30 Sep 2026"}
            </p>
            <InvestigationTimeline items={investigation.timeline} />
          </section>
          <section className="panel">
            <h3>Recommended next steps</h3>
            <ol className="action-list">
              {investigation.actions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ol>
            <Badge>Human approval required</Badge>
          </section>
        </aside>
      </div>
    </div>
  );
}
