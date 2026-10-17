"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Sparkles } from "lucide-react";
import { getCaseReviewBrief, prepareCaseReviewBrief } from "@/features/investigations/api";
import type { BriefSource, CaseBriefState } from "@/features/investigations/types/brief";
import { caseTime } from "@/features/investigations/format";
import { Badge, Button } from "@/shared/ui/primitives";

export function CaseReviewAssistant({
  id,
  canPrepare,
  canUseDraft,
  onUseDraft,
}: {
  id: string;
  canPrepare: boolean;
  canUseDraft: boolean;
  onUseDraft: (note: string) => void;
}) {
  const [state, setState] = useState<CaseBriefState>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sourceId, setSourceId] = useState<string>();
  const active = useRef(true);
  const sourcePanel = useRef<HTMLElement>(null);
  useEffect(() => {
    active.current = true;
    void getCaseReviewBrief(id)
      .then((value) => {
        if (active.current) setState(value);
      })
      .catch((value) => {
        if (active.current) setError(value.message);
      });
    return () => {
      active.current = false;
    };
  }, [id]);
  useEffect(() => {
    if (state?.status !== "running") return;
    const timer = window.setTimeout(() => {
      void getCaseReviewBrief(id)
        .then((value) => {
          if (active.current) setState(value);
        })
        .catch(() => {
          if (active.current)
            setError("The saved brief status could not be loaded. Reopen the case to check it.");
        });
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [id, state]);
  async function prepare() {
    setBusy(true);
    setError("");
    try {
      const value = await prepareCaseReviewBrief(id, state?.status === "unavailable");
      if (active.current) setState(value);
    } catch (value) {
      if (active.current)
        setError(value instanceof Error ? value.message : "The brief could not be prepared.");
    } finally {
      if (active.current) setBusy(false);
    }
  }
  const brief = state?.brief;
  const running = busy || state?.status === "running";
  const source = brief?.sources.find((value) => value.id === sourceId);
  useEffect(() => {
    if (!sourceId) return;
    sourcePanel.current?.scrollIntoView({ block: "center" });
    sourcePanel.current?.focus({ preventScroll: true });
  }, [sourceId]);
  function references(ids: string[]) {
    return (
      <span className="brief-references">
        {ids.map((ref) => (
          <button
            type="button"
            key={ref}
            aria-label={`Show brief source ${ref}`}
            aria-controls={`brief-source-${id}`}
            aria-expanded={sourceId === ref}
            onClick={() => setSourceId(ref)}
          >
            <FileText size={11} />{" "}
            {brief?.sources.find((item) => item.id === ref)?.label ?? "Saved review option"}
          </button>
        ))}
      </span>
    );
  }
  function items(title: string, values: BriefSource[], citeSelf = false) {
    return (
      <section className="brief-section">
        <h4>{title}</h4>
        <ul>
          {values.map((item) => (
            <li key={item.id}>
              <p>{item.text}</p>
              {references(citeSelf ? [item.id] : (item.references ?? [item.id]))}
            </li>
          ))}
        </ul>
      </section>
    );
  }
  return (
    <section className="case-review-assistant" aria-label="Case Review Assistant">
      <div className="brief-heading">
        <div>
          <h3>
            <Sparkles size={16} /> Case Review Assistant
          </h3>
          <p>
            Prepare a brief from this saved case. Review its suggestions before recording your
            decision.
          </p>
        </div>
        {brief && (
          <Badge>
            {brief.execution.mode === "model" ? "Gemini-assisted" : "Local · no model calls"}
          </Badge>
        )}
      </div>
      {error && (
        <p role="alert" className="case-message">
          {error}
        </p>
      )}
      {state?.status === "unavailable" && (
        <p role="status" className="case-message">
          {state.message}
        </p>
      )}
      {!brief && (
        <>
          <p className="case-helper">
            Only saved aggregate facts and review options are used. Your case status and notes stay
            under your control.
          </p>
          <Button
            disabled={
              !state ||
              !canPrepare ||
              running ||
              (state.status === "unavailable" && !state.retryAllowed)
            }
            onClick={() => void prepare()}
          >
            <Sparkles size={14} />
            {running
              ? "Preparing review brief…"
              : state?.status === "unavailable"
                ? "Retry review brief"
                : "Prepare review brief"}
          </Button>
          {!canPrepare && <p className="case-helper">An Analyst or Admin can prepare a brief.</p>}
          {state?.status === "unavailable" && !state.retryAllowed && (
            <p className="case-helper">
              The attempt limit was reached. Continue with the saved case evidence.
            </p>
          )}
        </>
      )}
      {brief && (
        <div className="brief-content">
          <p className="brief-snapshot">
            Saved snapshot: {caseTime(brief.snapshotAt)} · Brief prepared:{" "}
            {caseTime(brief.createdAt)}. Later source changes do not update this brief.
          </p>
          {items("Supported observations", brief.observations, true)}
          {items("Possible explanations · untested hypotheses", brief.hypotheses)}
          {items("Missing evidence & limits", brief.gaps, true)}
          {items("Suggested human checks · not completed actions", brief.checks)}
          {source && (
            <aside
              ref={sourcePanel}
              id={`brief-source-${id}`}
              tabIndex={-1}
              className="brief-source"
              aria-label="Brief source evidence"
              role="region"
            >
              <strong>
                {source.label ?? "Saved review option"} · {source.id}
              </strong>
              <p>{source.text}</p>
              <small>From this case's frozen review context.</small>
            </aside>
          )}
          <details className="brief-draft">
            <summary>Draft review note</summary>
            <p>{brief.draftNote}</p>
          </details>
          <Button disabled={!canUseDraft} onClick={() => onUseDraft(brief.draftNote)}>
            Use draft in my review
          </Button>
          <p className="case-helper">
            {canUseDraft
              ? "This fills your editable note. Save case update is a separate action."
              : "Save or discard your current note before using this draft. Review permissions are required."}
          </p>
          <details className="case-source-receipt">
            <summary>Preparation receipt</summary>
            <p>
              {brief.model ?? "Deterministic local selection"} · {brief.execution.modelCalls} model
              calls · {brief.execution.totalTokens} tokens ·{" "}
              {(brief.execution.durationMs / 1000).toFixed(1)} s
            </p>
            <p>
              Gemini selects offered references and review options; factual wording and figures are
              supplied by the backend.
            </p>
            <p>
              Prompt: {brief.promptVersion} · Validation: {brief.execution.validation}
            </p>
            <p>
              Saved source SHA-256: <span className="mono">{brief.sourceHash}</span>
            </p>
            {brief.execution.calls.map((call, index) => (
              <p key={index}>
                {call.agent}: {call.status} · {call.totalTokens} tokens
              </p>
            ))}
          </details>
        </div>
      )}
    </section>
  );
}
