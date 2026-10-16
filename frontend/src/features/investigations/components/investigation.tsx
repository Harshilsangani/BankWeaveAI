"use client";
import { useEffect, useState } from "react";
import { ChevronLeft, Download, FolderOpen, RotateCcw, ScanLine } from "lucide-react";
import type { Investigation as InvestigationData } from "@/features/investigations/types";
import type { QueryContext } from "@/shared/types/scope";
import type { InvestigationCase } from "@/features/investigations/types/cases";
import {
  ChartCard,
  DataTable,
  EvidenceCard,
  InsightCard,
  KpiCard,
} from "@/shared/analytics/blocks";
import { InvestigationTimeline } from "@/features/investigations/components/timeline";
import { Badge, Button, LoadingSteps } from "@/shared/ui/primitives";
import { scopeLabel } from "@/shared/lib/utils";
import { caseTime } from "@/features/investigations/format";
import { EvidenceBrowser } from "@/features/investigations/components/evidence-browser";
import { CaseControls } from "@/features/investigations/components/case-controls";
import { CaseLibrary } from "@/features/investigations/components/case-library";
import { CaseActivity } from "@/features/investigations/components/case-activity";
import { SourceStatus } from "@/features/investigations/components/source-status";
import { AnalysisDetails } from "@/shared/analytics/analysis-details";
import { RelationshipGraph } from "@/features/investigations/components/relationship-graph";

const tabs = ["Overview", "Evidence & links", "Review", "Activity"];
export function Investigation({
  progress,
  onCancel,
  investigation,
  loading,
  reportBusy,
  onInvestigate,
  canAnalyze,
  onReport,
  onBack,
}: {
  progress: import("@/shared/api/operations").ProgressEvent[];
  onCancel: () => void;
  investigation?: InvestigationData;
  loading: boolean;
  reportBusy: boolean;
  onInvestigate: (id: string, scope?: QueryContext) => void;
  canAnalyze: boolean;
  onReport: () => void;
  onBack: () => void;
}) {
  const [showLibrary, setShowLibrary] = useState(false);
  const [tab, setTab] = useState("Overview");
  const [record, setRecord] = useState<InvestigationCase>();
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    setRecord(undefined);
    setDirty(false);
    if (investigation) {
      setShowLibrary(false);
      try {
        const saved = sessionStorage.getItem("bankweave-case-tab-" + investigation.id);
        setTab(saved && tabs.includes(saved) ? saved : "Overview");
      } catch {
        setTab("Overview");
      }
    }
  }, [investigation?.id]);
  function open(id: string) {
    setShowLibrary(false);
    setDirty(false);
    onInvestigate(id);
  }
  function chooseTab(name: string) {
    setTab(name);
    if (investigation)
      try {
        sessionStorage.setItem("bankweave-case-tab-" + investigation.id, name);
      } catch {
        /* Keep tabs usable with blocked storage. */
      }
  }
  if (loading)
    return (
      <div className="investigation-page animate-in">
        <div className="page-heading">
          <div>
            <span className="case-eyebrow">
              <ScanLine size={14} /> FOLLOWING THE EVIDENCE
            </span>
            <h1>Investigation workspace</h1>
            <p>Retrieving saved evidence or building a new source snapshot.</p>
          </div>
        </div>
        <LoadingSteps events={progress} />
        <Button variant="ghost" onClick={onCancel}>
          Cancel request
        </Button>
      </div>
    );
  if (!investigation || showLibrary) return <CaseLibrary onOpen={open} onStart={onBack} />;
  const inv = investigation;
  return (
    <div className="investigation-page animate-in">
      <button className="back-button" disabled={reportBusy} onClick={() => setShowLibrary(true)}>
        <ChevronLeft size={14} /> Back to saved cases
      </button>
      <div className="page-heading">
        <div>
          <span className="case-eyebrow">
            <FolderOpen size={14} /> INVESTIGATION WORKSPACE
          </span>
          <h1>Investigation workspace</h1>
          <p>Check the evidence behind this signal, then save your review and share a report.</p>
        </div>
        <div className="page-actions">
          <Button
            variant="primary"
            onClick={onReport}
            disabled={reportBusy || !canAnalyze || dirty || !record}
          >
            <Download size={14} />
            {reportBusy ? "Preparing report…" : "Create report"}
          </Button>
        </div>
      </div>
      <section className="panel investigation-header">
        <div className="investigation-emblem">
          <ScanLine size={24} />
        </div>
        <div className="case-header-content">
          <span className="risk-id">{inv.id}</span>
          <h2>{inv.title}</h2>
          <p>{inv.risk.summary}</p>
          <small>
            Saved {caseTime(inv.createdAt)} · Analysis scope: {scopeLabel(inv.scope)}
          </small>
        </div>
        <div className="case-header-badges">
          <Badge tone={inv.risk.severity}>{inv.risk.severity} severity</Badge>
          <Badge>{record?.status ?? inv.status}</Badge>
        </div>
      </section>
      {dirty && (
        <p className="case-message" role="status">
          You have an unsaved review draft.
          <Button variant="ghost" onClick={() => chooseTab("Review")}>
            Continue review
          </Button>
          Save or discard it before creating a report.
        </p>
      )}
      <div className="case-tabs" role="tablist" aria-label="Investigation sections">
        {tabs.map((name, index) => (
          <button
            key={name}
            id={"case-tab-" + index}
            type="button"
            role="tab"
            aria-selected={tab === name}
            aria-controls="case-content"
            tabIndex={tab === name ? 0 : -1}
            className={tab === name ? "active" : ""}
            onClick={() => chooseTab(name)}
            onKeyDown={(event) => {
              const next =
                event.key === "ArrowRight"
                  ? (index + 1) % tabs.length
                  : event.key === "ArrowLeft"
                    ? (index + tabs.length - 1) % tabs.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? tabs.length - 1
                        : null;
              if (next !== null) {
                event.preventDefault();
                chooseTab(tabs[next]);
                document.getElementById("case-tab-" + next)?.focus();
              }
            }}
          >
            {name}
          </button>
        ))}
      </div>
      <div
        className="case-content"
        id="case-content"
        role="tabpanel"
        aria-labelledby={"case-tab-" + tabs.indexOf(tab)}
      >
        {tab === "Overview" && (
          <div className="investigation-main">
            <div className="case-section-intro">
              <div>
                <h3>What needs attention?</h3>
                <p>
                  These findings were saved when the case was opened. Start here, then check the
                  underlying records.
                </p>
              </div>
              <Button onClick={() => chooseTab("Evidence & links")}>Check evidence</Button>
            </div>
            <div className="response-kpis">
              {inv.metrics.map((metric) => (
                <KpiCard key={metric.label} metric={metric} />
              ))}
            </div>
            <div className="case-findings">
              {inv.findings.map((text, index) => (
                <InsightCard
                  key={text}
                  title={index === 0 ? "What the records show" : "Contribution to the change"}
                  text={text}
                />
              ))}
            </div>
            <div className="case-summary-grid">
              <ChartCard
                title="How the signal developed"
                subtitle={
                  (inv.analysis?.datasetName ?? inv.scope.datasetId) +
                  " · saved monthly affected records"
                }
                points={inv.trend}
              />
              <DataTable title="Affected regions & segments" data={inv.segments} />
            </div>
            <details className="case-source-receipt">
              <summary>Saved evidence trail · {inv.evidence.length} references</summary>
              <div className="evidence-list">
                {inv.evidence.map((evidence) => (
                  <EvidenceCard key={evidence.id} item={evidence} />
                ))}
              </div>
            </details>
            <div className="case-section-intro case-review-prompt">
              <div>
                <h3>Ready to record a conclusion?</h3>
                <p>
                  Choose a status and save a note in Review. Your saved decision can be included in
                  a report.
                </p>
              </div>
              <Button variant="primary" onClick={() => chooseTab("Review")}>
                Review this case
              </Button>
            </div>
          </div>
        )}
        {tab === "Evidence & links" && (
          <div className="investigation-main">
            <div className="case-section-intro">
              <div>
                <h3>Check the underlying records</h3>
                <p>
                  Browse the source records and explore their connections before making a decision.
                </p>
              </div>
              <Button onClick={() => chooseTab("Review")}>Record your review</Button>
            </div>
            <SourceStatus key={inv.id} id={inv.id} />
            <EvidenceBrowser key={"evidence-" + inv.id} scope={inv.scope} savedAt={inv.createdAt} />
            {inv.relationshipGraph && (
              <RelationshipGraph key={"graph-" + inv.id} data={inv.relationshipGraph} />
            )}
            <details className="case-source-receipt">
              <summary>Saved references & calculation details</summary>
              <div className="evidence-list">
                {inv.evidence.map((evidence) => (
                  <EvidenceCard key={evidence.id} item={evidence} />
                ))}
              </div>
              {inv.analysis && <AnalysisDetails analysis={inv.analysis} />}
              <p>
                {inv.execution
                  ? inv.execution.method + " · " + inv.execution.modelCalls + " model calls"
                  : "Saved evidence snapshot"}
              </p>
              {inv.sourceSnapshot && (
                <>
                  <p>Captured {caseTime(inv.sourceSnapshot.capturedAt)}</p>
                  <p>
                    Input SHA-256: <span className="mono">{inv.sourceSnapshot.inputHash}</span>
                  </p>
                  <p>
                    {Object.entries(inv.sourceSnapshot.sourceCounts)
                      .map(([key, value]) => key + ": " + value.toLocaleString())
                      .join(" · ")}
                  </p>
                </>
              )}
            </details>
          </div>
        )}
        {/* Keep the review mounted so changing tabs preserves the draft and case revision. */}
        <div hidden={tab !== "Review"} className="case-review-panel">
          <div className="case-section-intro">
            <div>
              <h3>Record your decision</h3>
              <p>
                Save what you checked, what you concluded, and any follow-up. Resolving a case
                requires a note.
              </p>
            </div>
          </div>
          <div className="case-review-grid">
            <CaseControls
              key={inv.id}
              id={inv.id}
              onRecordChange={setRecord}
              onDirtyChange={setDirty}
            />
            <aside className="case-review-guidance">
              <section>
                <h3>Choose the right status</h3>
                <dl>
                  <div>
                    <dt>In review</dt>
                    <dd>You are still checking the evidence.</dd>
                  </div>
                  <div>
                    <dt>Monitoring</dt>
                    <dd>Keep the case open for follow-up.</dd>
                  </div>
                  <div>
                    <dt>Resolved</dt>
                    <dd>Your review is complete. Explain your conclusion in a note.</dd>
                  </div>
                </dl>
              </section>
              <section>
                <h3>Suggested checks</h3>
                <ol className="action-list">
                  {inv.actions.map((action) => (
                    <li key={action}>{action}</li>
                  ))}
                </ol>
              </section>
              <section>
                <h3>Share the reviewed case</h3>
                <p>
                  Use Create report after saving your review. The report captures the findings,
                  charts, and saved notes at that time.
                </p>
                <p>A saved review records your decision; it does not execute a banking action.</p>
              </section>
              <details className="case-source-receipt">
                <summary>Need to check newer data?</summary>
                <p>
                  Start a separate investigation using the same signal and scope. This case and its
                  reports stay saved.
                </p>
                <Button
                  variant="ghost"
                  disabled={dirty || reportBusy || !canAnalyze}
                  onClick={() => onInvestigate(inv.risk.id, inv.scope)}
                >
                  <RotateCcw size={14} /> Start a fresh investigation
                </Button>
              </details>
            </aside>
          </div>
        </div>
        {tab === "Activity" && (
          <div className="investigation-main">
            <CaseActivity key={inv.id} record={record} />
            <details className="case-source-receipt">
              <summary>Recorded analysis stages</summary>
              <InvestigationTimeline items={inv.timeline} />
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
