"use client";
import { processLabel } from "@/shared/lib/process-label";
import { useState } from "react";
import { ChevronDown, Download, ShieldCheck, Sparkles } from "lucide-react";
import { AnalysisDetails } from "@/shared/analytics/analysis-details";
import { FormReview } from "@/features/forms/components/form-review";
import type { AnalystResponse } from "@/features/analyst/types";
import type { QueryContext } from "@/shared/types/scope";
import { Button, Logo } from "@/shared/ui/primitives";
import { downloadResearchPdf } from "@/features/reports/download";
import { ArrowUpRight } from "lucide-react";
import {
  KpiCard,
  InsightCard,
  ChartCard,
  DataTable,
  EvidenceCard,
} from "@/shared/analytics/blocks";
import { ActionCard } from "@/features/analyst/components/action-card";
import { SuggestedQuestions } from "@/features/analyst/components/suggested-questions";
import { ScenarioComparison } from "@/features/reports/components/scenario-comparison";
import { ReportPreview } from "@/features/reports/components/report-preview";
import { MarkdownContent } from "@/shared/ui/markdown";

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
              {response.analysis ? `Query results · ${response.analysis.period}` : "Query results"}
            </small>
          </span>
          <ShieldCheck size={17} className="text-accent" />
        </div>
        {response.research && response.analysis?.researchExecution && (
          <details className="research-execution">
            <summary>
              {response.analysis.researchExecution.mode === "model"
                ? `${response.analysis.researchExecution.model} · Model-written research`
                : response.analysis.researchExecution.mode === "fallback"
                  ? "Model analysis unavailable · Verified-data fallback"
                  : "Local research · No model API calls"}
              <span>
                {response.analysis.researchExecution.successfulModelCalls} successful model calls ·{" "}
                {response.analysis.researchExecution.tools.length} database tools ·{" "}
                {(response.analysis.researchExecution.durationMs / 1000).toFixed(1)}s
              </span>
            </summary>
            {response.analysis.researchExecution.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
            <ul>
              {response.analysis.researchExecution.calls.map((call, index) => (
                <li key={index}>
                  {call.agent}: {call.status} · {(call.durationMs / 1000).toFixed(1)}s ·{" "}
                  {call.totalTokens.toLocaleString()} tokens
                </li>
              ))}
              {response.analysis.researchExecution.tools.map((tool, index) => (
                <li key={`tool-${index}`}>
                  {tool.tool}: {tool.status} · {tool.rowCount} aggregate rows · {tool.durationMs}ms
                </li>
              ))}
            </ul>
          </details>
        )}
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
                : "Processes"}
              <ChevronDown size={13} />
            </summary>
            <ol>
              {(stages?.length
                ? stages
                : ["Records retrieved", "Filters applied", "Results assembled"]
              ).map((stage, index) => (
                <li key={`${stage}-${index}`}>{processLabel(stage)}</li>
              ))}
            </ol>
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
                  <MarkdownContent className="answer-text" key={i}>
                    {block.text}
                  </MarkdownContent>
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
                    tone={block.tone}
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
                    disabled={disabled || block.action === "simulate"}
                    key={i}
                    label={
                      block.action === "simulate"
                        ? "Scenario Simulator retired · Saved result retained"
                        : block.label
                    }
                    onClick={() => onAction(block.action, block.riskId, response.context)}
                  />
                );
              case "REPORT":
                return <ReportPreview key={i} report={block.report} />;
              case "COMPARISON":
                return <ScenarioComparison key={i} result={block.result} />;
              case "CAMPAIGN":
                return (
                  <div className="panel campaign-chat-card" key={i}>
                    <h3>{block.title}</h3>
                    <p>
                      Campaign preparation accepted. Open Card Campaigns for saved progress and the
                      employee report.
                    </p>
                    <Button
                      onClick={() => {
                        window.location.hash = `card-campaigns?campaign=${encodeURIComponent(block.campaignId)}&run=${encodeURIComponent(block.runId)}`;
                      }}
                    >
                      Open campaign workspace <ArrowUpRight size={14} />
                    </Button>
                  </div>
                );
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
              : "Results from selected records"}
          </span>
          <span>{formSaved ? "KYC verification pending" : "Human review required"}</span>
        </div>
        <SuggestedQuestions
          questions={response.suggestions}
          onSelect={onQuery}
          disabled={disabled}
        />
        {response.research && (
          <div className="research-actions" role="group" aria-label="Research export">
            <button
              type="button"
              className="export-pdf"
              onClick={() =>
                void downloadResearchPdf(
                  response.id,
                  response.context,
                  response.analysis?.datasetName
                ).catch((error: unknown) =>
                  window.alert(
                    error instanceof Error ? error.message : "The PDF could not be downloaded."
                  )
                )
              }
            >
              <Download size={14} />
              Export PDF
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
