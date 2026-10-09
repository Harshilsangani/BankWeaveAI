"use client";
import { useEffect, useRef } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Database,
  Loader2,
  MessageSquarePlus,
  Sparkles,
  X,
} from "lucide-react";
import type { AnalystResponse, QueryContext, DatasetId, DatasetInfo } from "@/types";
import { AIMessage, SuggestedQuestions } from "@/components/blocks";
import { Button, LoadingSteps } from "@/components/ui";
import { scopeLabel } from "@/lib/utils";
import { PromptBox, starterQuestions } from "./prompt-box";
import { DataControls } from "./data-controls";

export function Analyst({
  notice,
  onDismissNotice,
  contextStatus,
  ready,
  progress,
  onCancel,
  messages,
  context,
  busy,
  pendingQuery,
  onQuery,
  onAction,
  onClear,
  datasets,
  datasetId,
  period,
  onDataset,
  onPeriod,
  onUpload,
}: {
  notice: string;
  onDismissNotice: () => void;
  contextStatus: "restoring" | "saving" | null;
  ready: boolean;
  progress: import("@/services/operations").ProgressEvent[];
  onCancel: () => void;
  messages: AnalystResponse[];
  context?: QueryContext;
  busy: boolean;
  pendingQuery?: string;
  onQuery: (q: string) => void;
  onAction: (
    action: "investigate" | "simulate" | "report",
    id: string,
    scope?: QueryContext
  ) => void;
  onClear: () => void;
  datasets: DatasetInfo[];
  datasetId: DatasetId;
  period?: string;
  onDataset: (id: DatasetId) => void;
  onPeriod: (period: string) => void;
  onUpload: (file: File) => void;
}) {
  const locked = busy || Boolean(contextStatus) || !ready || !datasets.length;
  const scroller = useRef<HTMLDivElement>(null);
  const latest = useRef<HTMLDivElement>(null);
  const pending = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = scroller.current;
    const target = busy ? pending.current : latest.current;
    if (!container || !target) return;
    const top =
      target.getBoundingClientRect().top -
      container.getBoundingClientRect().top +
      container.scrollTop;
    container.scrollTo({ top: Math.max(0, top - 24), behavior: "instant" });
  }, [messages.length, busy]);

  return (
    <section className="analyst-chat">
      <header className="chat-header">
        <div className="chat-heading">
          <h1>AI Analyst</h1>
          <span>BankWeave intelligence</span>
        </div>
        <div className="chat-header-actions">
          <details className="chat-context">
            <summary>
              <Database size={14} />
              <span>{context?.region ?? "All regions"}</span>
              <ChevronDown size={13} />
            </summary>
            <div className="chat-context-popover">
              <strong>Conversation context</strong>
              <div className="scope-item">
                <span>Dataset</span>
                <strong>{datasets.find((d) => d.id === datasetId)?.name ?? "Meridian demo"}</strong>
              </div>
              <div className="scope-item">
                <span>Period</span>
                <strong>
                  {period ?? datasets.find((d) => d.id === datasetId)?.periods.at(-1) ?? "2026-09"}
                </strong>
              </div>
              <div className="scope-item">
                <span>Baseline</span>
                <strong>Previous calendar month</strong>
              </div>
              <div className="scope-item">
                <span>Focus</span>
                <strong>
                  {context?.domain === "loans" ? "Loan defaults" : "Transaction risk"}
                </strong>
              </div>
              <div className="scope-item">
                <span>Scope</span>
                <strong>{scopeLabel(context)}</strong>
              </div>
              <p>Follow-ups remember your filters. Ask “show all regions” to reset them.</p>
            </div>
          </details>
          <Button
            variant="ghost"
            onClick={onClear}
            disabled={locked || !messages.length}
            aria-label="New analysis"
          >
            <MessageSquarePlus size={18} />
            <span>New chat</span>
          </Button>
        </div>
      </header>
      <DataControls
        datasets={datasets}
        datasetId={datasetId}
        period={period}
        busy={locked}
        onDataset={onDataset}
        onPeriod={onPeriod}
      />
      {notice && (
        <div role="status" className="analyst-notice">
          <CheckCircle2 size={15} />
          <span>{notice}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={onDismissNotice}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {contextStatus && (
        <p role="status" className="context-status">
          <Loader2 size={13} className="spin" />
          {contextStatus === "restoring"
            ? "Restoring your workspace…"
            : "Saving the selected analysis context…"}
        </p>
      )}
      {!ready && !contextStatus && (
        <p role="status" className="context-status">
          Use Retry in Recent chats to restore your conversation.
        </p>
      )}
      <div className="chat-scroll" ref={scroller} aria-label="Analyst conversation" tabIndex={0}>
        <div className={`chat-thread ${!messages.length && !busy ? "chat-thread-empty" : ""}`}>
          {!messages.length && !busy && (
            <div className="chat-welcome">
              <span className="chat-welcome-icon">
                <Sparkles size={30} strokeWidth={1.5} />
              </span>
              <h2>Hello, Alex.</h2>
              <h3>Where should we look closer?</h3>
              <SuggestedQuestions
                disabled={locked}
                questions={
                  datasetId === "bankshield"
                    ? [
                        "Show suspicious transactions",
                        "Compare fraud by country",
                        "Show merchant categories",
                        "Investigate fraud-labelled transactions",
                      ]
                    : starterQuestions
                }
                onSelect={onQuery}
              />
            </div>
          )}
          {messages.map((response, i) => (
            <div key={response.id} ref={i === messages.length - 1 ? latest : undefined}>
              <AIMessage
                response={response}
                onAction={onAction}
                onQuery={onQuery}
                disabled={locked}
                showTrace
              />
            </div>
          ))}
          {busy && (
            <div className="chat-pending" ref={pending}>
              {pendingQuery && (
                <div className="user-message">
                  <span>{pendingQuery}</span>
                </div>
              )}
              <LoadingSteps events={progress} />
              <Button variant="ghost" onClick={onCancel}>
                Cancel request
              </Button>
            </div>
          )}
        </div>
      </div>
      <div className="chat-composer-region">
        <PromptBox onSubmit={onQuery} onUpload={onUpload} busy={locked} chat />
      </div>
    </section>
  );
}
