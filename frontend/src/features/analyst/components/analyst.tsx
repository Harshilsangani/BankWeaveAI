"use client";
import { useEffect, useRef } from "react";
import { CheckCircle2, Loader2, Sparkles, X } from "lucide-react";
import type { AnalystResponse } from "@/features/analyst/types";
import type { QueryContext, DatasetId, DatasetInfo } from "@/shared/types/scope";
import { AIMessage } from "@/features/analyst/components/response";
import { SuggestedQuestions } from "@/features/analyst/components/suggested-questions";
import { Button, LoadingSteps } from "@/shared/ui/primitives";
import { PromptBox, starterQuestions } from "@/features/analyst/components/prompt-box";
import { roleLabels, type StaffRole } from "@/shared/lib/staff-role";
import { useAIProvider } from "@/shared/hooks/use-ai-provider";

export function Analyst({
  notice,
  onDismissNotice,
  contextStatus,
  ready,
  progress,
  onCancel,
  messages,
  busy,
  pendingQuery,
  onQuery,
  onAction,
  datasetId,
  dataReady,
  onUpload,
  role,
  canAnalyze,
  researchMode = false,
  onResearchMode,
  datasets = [],
  onDataset,
}: {
  notice: string;
  onDismissNotice: () => void;
  contextStatus: "restoring" | "saving" | null;
  ready: boolean;
  progress: import("@/shared/api/operations").ProgressEvent[];
  onCancel: () => void;
  messages: AnalystResponse[];
  busy: boolean;
  pendingQuery?: string;
  onQuery: (q: string) => void;
  onAction: (
    action: "investigate" | "simulate" | "report",
    id: string,
    scope?: QueryContext
  ) => void;
  datasetId: DatasetId;
  dataReady: boolean;
  onUpload: (file: File) => void;
  role?: StaffRole;
  canAnalyze: boolean;
  researchMode?: boolean;
  onResearchMode?: (enabled: boolean) => void;
  datasets?: DatasetInfo[];
  onDataset?: (id: DatasetId) => void;
}) {
  const contextLocked = busy || Boolean(contextStatus) || !ready || !dataReady;
  const {
    provider,
    error: providerError,
    loading: providerLoading,
    reload: reloadProvider,
  } = useAIProvider();
  const locked = contextLocked || !canAnalyze;
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
    const toolbarInset = parseFloat(getComputedStyle(container).scrollPaddingTop) || 24;
    container.scrollTo({ top: Math.max(0, top - toolbarInset), behavior: "instant" });
  }, [messages.length, busy]);

  return (
    <section className="analyst-chat" aria-label="AI Analyst">
      {providerError && (
        <p role="alert" className="analyst-notice">
          {providerError}{" "}
          <Button variant="ghost" disabled={providerLoading} onClick={reloadProvider}>
            Retry AI connection
          </Button>
        </p>
      )}
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
              <h2>{role ? `Hello, ${roleLabels[role]}.` : "Welcome to BankWeave."}</h2>
              <h3>
                {role === "viewer"
                  ? "Your banking workspace, at a glance."
                  : "What would you like to explore?"}
              </h3>
              <p className="chat-greeting-description">
                {role === "viewer"
                  ? "Browse available data and saved results. Ask an Analyst or Admin to start new analyses or upload forms."
                  : "Explore your banking data, follow a risk signal, or read a customer form. Choose a question below or write your own."}
              </p>
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
        {role === "viewer" && (
          <p className="viewer-chat-notice" role="status">
            Viewer access · Analysis and uploads are available to Analysts and Admins.
          </p>
        )}
        <PromptBox
          onSubmit={onQuery}
          onUpload={onUpload}
          busy={busy}
          disabled={locked}
          provider={provider}
          providerError={providerError}
          chat
          researchMode={researchMode}
          onResearchMode={onResearchMode}
          datasets={datasets}
          datasetId={datasetId}
          scopeBusy={contextLocked}
          onDataset={onDataset}
        />
      </div>
    </section>
  );
}
