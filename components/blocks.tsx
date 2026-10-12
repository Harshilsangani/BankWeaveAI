"use client";
import { useState } from "react";
import { useHorizontalOverflow } from "@/hooks/use-horizontal-overflow";
import {
  Activity,
  ArrowLeftRight,
  ChevronDown,
  Download,
  FileText,
  Fingerprint,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { formatMoney, money } from "@/lib/utils";
import { AnalysisDetails } from "@/features/analyst/data-controls";
import { FormReview } from "@/features/analyst/form-review";
import type {
  AnalystResponse,
  Evidence,
  Investigation,
  Metric,
  QueryContext,
  Report,
  RiskEvent,
  ScenarioResult,
  TableData,
} from "@/types";
import { Badge, Button, Logo } from "./ui";
import { AnalyticsChart, Sparkline } from "./charts";
import { downloadReport } from "@/lib/report";

export function KpiCard({ metric }: { metric: Metric }) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">
        {metric.label}
        <span className="tiny-icon">
          <Activity size={13} />
        </span>
      </div>
      <div className="kpi-value-row">
        <strong>{metric.value}</strong>
        {metric.sparkline && (
          <Sparkline values={metric.sparkline} warning={metric.direction === "up"} />
        )}
      </div>
      <div className="kpi-meta">
        <span className={`metric-change ${metric.direction}`}>
          {metric.direction === "up" && <TrendingUp size={12} />}
          {metric.change}
        </span>
        <span>{metric.detail}</span>
      </div>
    </div>
  );
}
export function InsightCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="insight-card">
      <Sparkles size={18} />
      <div>
        <h3>
          {title}
          <Badge tone="accent">Analytical interpretation</Badge>
        </h3>
        <p>{text}</p>
      </div>
    </div>
  );
}
export function ChartCard({
  title,
  subtitle,
  points,
  kind = "area",
  children,
}: {
  title: string;
  subtitle?: string;
  points: { name: string; value: number; baseline?: number }[];
  kind?: "area" | "bar";
  children?: React.ReactNode;
}) {
  return (
    <section className="panel chart-card">
      <div className="chart-heading">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
        {children ?? (
          <span className="chart-legend">
            <i />
            {kind === "area" ? "Monthly count" : "Selected period"}
          </span>
        )}
      </div>
      <AnalyticsChart points={points} kind={kind} />
    </section>
  );
}
export function DataTable({ data, title }: { data: TableData; title?: string }) {
  const { ref, overflow } = useHorizontalOverflow();
  const [sort, setSort] = useState<{ col: number; asc: boolean } | null>(null);
  const rows = sort
    ? [...data.rows].sort((a, b) => {
        const aa = a[sort.col],
          bb = b[sort.col];
        const numericA = Number(String(aa).replace(/[^\d.-]/g, "")),
          numericB = Number(String(bb).replace(/[^\d.-]/g, ""));
        const numeric = /\d/.test(String(aa)) && /\d/.test(String(bb));
        return (
          (numeric ? numericA - numericB : String(aa).localeCompare(String(bb))) *
          (sort.asc ? 1 : -1)
        );
      })
    : data.rows;
  return (
    <section className="data-section">
      {title && <h3>{title}</h3>}
      {overflow && (
        <p className="table-scroll-hint">
          <ArrowLeftRight size={13} /> Scroll to see all columns
        </p>
      )}
      <div
        ref={ref}
        className="table-scroll"
        tabIndex={0}
        role="region"
        aria-label={title ? `${title} table` : "Banking records table"}
      >
        <table>
          <thead>
            <tr>
              {data.columns.map((col, i) => (
                <th
                  key={col}
                  aria-sort={sort?.col === i ? (sort.asc ? "ascending" : "descending") : "none"}
                >
                  <button
                    onClick={() => setSort({ col: i, asc: sort?.col === i ? !sort.asc : true })}
                  >
                    {col}
                    {sort?.col === i && <span>{sort.asc ? " ↑" : " ↓"}</span>}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j} className={j > 0 ? "tabular" : ""}>
                    {String(cell).startsWith("+") ? (
                      <span className="text-amber">{cell}</span>
                    ) : (
                      cell
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <p className="table-empty">No records match this scope. Try removing a filter.</p>
        )}
      </div>
    </section>
  );
}
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
          {risk.affectedRecords} affected records ·{" "}
          {risk.detection?.rulesVersion ?? "Requires human review"}
        </p>
      )}
      <div className="risk-exposure">
        <span>Exposure under review</span>
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
              {risk.detection.threshold.name}: at least {risk.detection.threshold.minCount} records
              {risk.detection.threshold.minIncreasePct !== null
                ? ` and ≥${risk.detection.threshold.minIncreasePct}% count increase`
                : ""}
              .
            </p>
            <p>
              Observed: {risk.detection.currentCount} vs {risk.detection.baselineCount} ·{" "}
              {risk.detection.observedIncreasePct?.toFixed(1) ?? "N/A"}% change.
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
          <button className="subtle-button" onClick={() => onDismiss(risk.id)}>
            Dismiss
          </button>
        )}
      </div>
    </article>
  );
}
export function EvidenceCard({ item }: { item: Evidence }) {
  return (
    <details className="evidence-card">
      <summary>
        <span className="evidence-icon">
          <Fingerprint size={17} />
        </span>
        <span>
          <strong>{item.title}</strong>
          <small>{item.source}</small>
        </span>
        <Badge>Source</Badge>
        <ChevronDown size={15} className="evidence-chevron" />
      </summary>
      <div className="evidence-content">
        <p>{item.detail}</p>
        <ul>
          {item.records.map((record) => (
            <li key={record}>{record}</li>
          ))}
        </ul>
        <span className="mono muted">Reference: {item.id}</span>
      </div>
    </details>
  );
}
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
export function SuggestedQuestions({
  questions,
  onSelect,
  disabled = false,
}: {
  questions: string[];
  onSelect: (question: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="suggested-questions">
      {questions.map((question, i) => (
        <button key={question} onClick={() => onSelect(question)} disabled={disabled}>
          <span>
            {
              [
                <TrendingUp key="t" size={14} />,
                <Target key="g" size={14} />,
                <ScanLine key="s" size={14} />,
                <Activity key="a" size={14} />,
              ][i % 4]
            }
          </span>
          {question}
        </button>
      ))}
    </div>
  );
}
export function InvestigationTimeline({ items }: { items: Investigation["timeline"] }) {
  return (
    <div className="timeline">
      {items.map((item) => (
        <div className="timeline-item" key={item.title}>
          <span className="timeline-node" />
          <div>
            <span className="mono muted">
              {item.time.includes("T")
                ? new Date(item.time).toLocaleString("en-GB", { timeZone: "UTC" }) + " UTC"
                : item.time + " IST"}
            </span>
            <h4>{item.title}</h4>
            <p>{item.detail}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
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
export function ReportPreview({ report }: { report: Report }) {
  const [downloadError, setDownloadError] = useState("");
  const [downloading, setDownloading] = useState(false);
  return (
    <article className="report-preview">
      <div className="report-preview-top">
        <span className="report-icon">
          <FileText size={22} />
        </span>
        <div>
          <Badge tone="accent">Prepared for review</Badge>
          <h3>{report.title}</h3>
          <p>
            {report.id} ·{" "}
            {new Date(report.createdAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })} ·
            Synthetic data
          </p>
        </div>
      </div>
      <div className="report-outline">
        <span>01 Executive summary</span>
        <span>02 Evidence & findings</span>
        <span>03 Risk assessment</span>
        <span>04 Recommended actions</span>
        {report.scenario && <span>05 Scenario analysis</span>}
      </div>
      <p>{report.investigation.findings[0]}</p>
      {downloadError && <p role="alert">{downloadError}</p>}
      <Button
        disabled={downloading}
        onClick={() => {
          setDownloadError("");
          setDownloading(true);
          void downloadReport(report)
            .catch((e) => setDownloadError(e.message))
            .finally(() => setDownloading(false));
        }}
      >
        <Download size={15} />
        Download report
      </Button>
    </article>
  );
}
export function AIMessage({
  response,
  onAction,
  onQuery,
  showTrace = false,
  disabled = false,
}: {
  response: AnalystResponse;
  onAction: (
    action: "investigate" | "simulate" | "report",
    riskId: string,
    scope?: QueryContext
  ) => void;
  onQuery: (query: string) => void;
  showTrace?: boolean;
  disabled?: boolean;
}) {
  const isForm = response.blocks.some((block) => block.type === "FORM");
  const [formSaved, setFormSaved] = useState(
    response.blocks.some((b) => b.type === "FORM" && b.draft.status === "saved")
  );
  const [adminApprovalRecorded, setAdminApprovalRecorded] = useState(
    response.blocks.some((b) => b.type === "FORM" && b.draft.approval?.status === "approved")
  );
  const [formStatus, setFormStatus] = useState(
    response.blocks.find((b) => b.type === "FORM")?.draft.status
  );
  const stages = formSaved
    ? [
        "LangGraph router",
        "Form reader",
        adminApprovalRecorded ? "Admin approval recorded" : "Human review complete",
        "Customer review recorded",
        "Database committed",
      ]
    : formStatus === "deleted"
      ? ["Customer profile deleted", "Original review history retained"]
      : response.analysis?.stages;
  return (
    <article className="ai-message">
      <div className="user-message">
        <span className="avatar small-avatar">AK</span>
        <span>{response.question}</span>
      </div>
      <div className="ai-answer">
        <div className="answer-heading">
          <Logo small />
          <span>
            BankWeave Analyst
            <small>
              {response.analysis
                ? `${response.analysis.provider === "vertex" ? "Vertex assisted analyst" : "Local analyst"} · ${response.analysis.period}`
                : "Demo analysis · September 2026"}
            </small>
          </span>
          <ShieldCheck size={17} className="text-accent" />
        </div>
        {showTrace && (
          <details className="chat-tool-trace">
            <summary>
              <Sparkles size={14} />
              {isForm
                ? formStatus === "deleted"
                  ? "Customer profile deleted · History retained"
                  : formSaved
                    ? "Customer workflow completed"
                    : formStatus === "submitted"
                      ? "Form submitted · Awaiting admin approval"
                      : formStatus === "rejected"
                        ? "Form request rejected · No customer created"
                        : "Form extracted · Awaiting review"
                : response.analysis
                  ? "Completed local agent workflow"
                  : "Completed demo analysis"}
              <ChevronDown size={13} />
            </summary>
            <p>
              {stages?.join(" · ") ??
                "Source records retrieved · Scope filters applied · Results assembled"}
            </p>
            <small>
              {response.analysis
                ? "Executed locally. Evidence and source versions are shown below."
                : "Simulated tool workflow. Evidence and results are shown below."}
            </small>
          </details>
        )}
        <h2>{response.title}</h2>
        {response.analysis && <AnalysisDetails analysis={response.analysis} />}
        <div className="response-blocks">
          {response.blocks.map((block, i) => {
            switch (block.type) {
              case "FORM":
                return (
                  <FormReview
                    key={block.draft.id}
                    draft={block.draft}
                    onSaved={() => {
                      setFormSaved(true);
                      setAdminApprovalRecorded(true);
                    }}
                    onStatusChange={(status) => {
                      setFormStatus(status);
                      if (status === "deleted") setFormSaved(false);
                    }}
                  />
                );
              case "TEXT":
                return (
                  <p className="answer-text" key={i}>
                    {block.text}
                  </p>
                );
              case "KPI":
                return (
                  <div className="response-kpis" key={i}>
                    {block.metrics.map((m) => (
                      <KpiCard metric={m} key={m.label} />
                    ))}
                  </div>
                );
              case "CHART":
                return (
                  <ChartCard
                    key={i}
                    title={block.title}
                    subtitle={block.subtitle}
                    points={block.points}
                    kind={block.kind}
                  />
                );
              case "TABLE":
                return <DataTable key={i} title={block.title} data={block.data} />;
              case "INSIGHT":
                return <InsightCard key={i} title={block.title} text={block.text} />;
              case "EVIDENCE":
                return (
                  <div className="evidence-list" key={i}>
                    {block.evidence.map((item) => (
                      <EvidenceCard key={item.id} item={item} />
                    ))}
                  </div>
                );
              case "ACTION":
                return (
                  <ActionCard
                    disabled={disabled}
                    key={i}
                    label={block.label}
                    onClick={() => onAction(block.action, block.riskId, response.context)}
                  />
                );
              case "REPORT":
                return <ReportPreview key={i} report={block.report} />;
              case "COMPARISON":
                return <ScenarioComparison key={i} result={block.result} />;
            }
          })}
        </div>
        <div className="answer-footer">
          <span>
            <ShieldCheck size={13} />
            {isForm
              ? formSaved
                ? "Reviewed profile saved locally"
                : "Uploaded form · Human review required"
              : `${response.analysis?.provider === "vertex" ? "Vertex assisted analysis" : "Local analysis"} · Source coverage disclosed`}
          </span>
          <span>{formSaved ? "KYC verification pending" : "Human review required"}</span>
        </div>
        <SuggestedQuestions
          questions={response.suggestions}
          onSelect={onQuery}
          disabled={disabled}
        />
      </div>
    </article>
  );
}
