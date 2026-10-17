"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  ChevronDown,
  CornerDownLeft,
  Database,
  Loader2,
  Paperclip,
  Plus,
  Send,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { SuggestedQuestions } from "@/features/analyst/components/suggested-questions";
import { DataControls } from "@/features/analyst/components/data-controls";
import type { AIProviderStatus } from "@/shared/types/analysis";
import type { DatasetId, DatasetInfo } from "@/shared/types/scope";
export const starterQuestions = [
  "Why did fraud increase this month?",
  "Which regions have the highest loan risk?",
  "Investigate suspicious transactions.",
  "Compare default rates by branch.",
];
export function PromptBox({
  onSubmit,
  busy = false,
  disabled = false,
  hero = false,
  chat = false,
  onUpload,
  provider,
  providerError,
  researchMode = false,
  onResearchMode,
  datasets = [],
  datasetId = "meridian",
  scopeBusy = false,
  onDataset,
}: {
  onSubmit: (query: string) => void;
  busy?: boolean;
  disabled?: boolean;
  hero?: boolean;
  chat?: boolean;
  onUpload?: (file: File) => void;
  provider?: AIProviderStatus;
  providerError?: string;
  researchMode?: boolean;
  onResearchMode?: (enabled: boolean) => void;
  datasets?: DatasetInfo[];
  datasetId?: DatasetId;
  scopeBusy?: boolean;
  onDataset?: (id: DatasetId) => void;
}) {
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [ocrMode, setOcrMode] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const tools = useRef<HTMLDetailsElement>(null);
  const addMenu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!chat) return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Node;
      if (tools.current?.open && !tools.current.contains(target)) tools.current.open = false;
      if (
        addOpen &&
        addMenu.current &&
        !addMenu.current.contains(target) &&
        !addMenu.current.querySelector("select:open")
      ) {
        setAddOpen(false);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.target instanceof HTMLSelectElement) return;
      if (tools.current?.open) {
        tools.current.open = false;
        tools.current.querySelector("summary")?.focus();
      }
      if (addOpen && !addMenu.current?.querySelector("select:open")) {
        setAddOpen(false);
        addMenu.current?.querySelector("button")?.focus();
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [addOpen, chat]);
  useEffect(() => {
    if (!chat || !textarea.current) return;
    textarea.current.style.height = "auto";
    textarea.current.style.height = `${Math.min(textarea.current.scrollHeight, 180)}px`;
  }, [query, chat]);
  function submit() {
    if (ocrMode) {
      textarea.current?.focus();
      return;
    }
    if (query.trim() && !busy && !disabled) {
      onSubmit(query.trim());
      setQuery("");
    }
  }
  function chooseResearch() {
    onResearchMode?.(!researchMode);
    if (tools.current) tools.current.open = false;
    textarea.current?.focus();
  }
  function chooseOcr() {
    setOcrMode((selected) => !selected);
    if (tools.current) tools.current.open = false;
    textarea.current?.focus();
  }
  const selectedTools = [
    researchMode
      ? { id: "research", label: "Research", clear: () => onResearchMode?.(false) }
      : undefined,
    ocrMode ? { id: "ocr", label: "OCR", clear: () => setOcrMode(false) } : undefined,
  ].filter((tool): tool is { id: string; label: string; clear: () => void } => Boolean(tool));
  return (
    <div className={chat ? "chat-composer" : hero ? "analyst-hero" : "prompt-dock"}>
      {hero && (
        <>
          <div className="analyst-eyebrow">
            <Sparkles size={14} />
            YOUR AI INTELLIGENCE LAYER<span className="mock-label">DEMO</span>
          </div>
          <h2>
            Good questions. <span>Sharper decisions.</span>
          </h2>
        </>
      )}
      {ocrMode && (
        <p className="composer-tool-hint" id="ocr-upload-hint" role="status">
          OCR tool selected. Upload a file to use this tool.
        </p>
      )}
      <form
        className="prompt-box"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="sr-only" htmlFor={hero ? "hero-query" : "analyst-query"}>
          Ask anything about your banking data
        </label>
        <textarea
          ref={textarea}
          id={hero ? "hero-query" : "analyst-query"}
          placeholder="Ask anything about your banking data…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={1000}
          rows={chat ? 1 : 2}
          disabled={busy || disabled}
          aria-describedby={ocrMode ? "ocr-upload-hint" : undefined}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="prompt-toolbar">
          {chat && onUpload && (
            <div className="composer-plus" ref={addMenu}>
              <input
                ref={upload}
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                className="sr-only"
                aria-label="Upload customer form"
                disabled={busy || disabled}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setOcrMode(false);
                    onUpload(file);
                  }
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                className="form-attach"
                aria-label="Add"
                aria-expanded={addOpen}
                aria-controls="composer-add-menu"
                title="Attach a form or change the dataset"
                disabled={busy || scopeBusy}
                onClick={() => {
                  setAddOpen((open) => !open);
                  if (tools.current) tools.current.open = false;
                }}
              >
                <Plus size={18} />
              </button>
              <div
                id="composer-add-menu"
                className="composer-plus-popover"
                hidden={!addOpen}
                role="group"
                aria-label="Attachment and dataset"
              >
                <button
                  type="button"
                  className="composer-tool-option"
                  disabled={busy || disabled}
                  onClick={() => {
                    setAddOpen(false);
                    upload.current?.click();
                  }}
                >
                  <Paperclip size={14} />
                  Attachment
                </button>
                {onDataset && (
                  <DataControls
                    datasets={datasets}
                    datasetId={datasetId}
                    busy={scopeBusy || busy}
                    onDataset={onDataset}
                  />
                )}
              </div>
            </div>
          )}
          {chat ? (
            <div className="composer-tool-row">
              <details
                className="composer-tools"
                ref={tools}
                onToggle={(event) => {
                  if (event.currentTarget.open) setAddOpen(false);
                }}
              >
                <summary>
                  <SlidersHorizontal size={17} />
                  Tools
                  <ChevronDown size={12} />
                </summary>
                <div className="composer-tools-popover">
                  <strong>Tools</strong>
                  {onResearchMode && (
                    <button
                      type="button"
                      className="composer-tool-option"
                      aria-pressed={researchMode}
                      disabled={busy || disabled}
                      title="Scope a brief, calculate the series, and choose research charts"
                      onClick={chooseResearch}
                    >
                      <Sparkles size={14} />
                      Research
                    </button>
                  )}
                  {onUpload && (
                    <button
                      type="button"
                      className="composer-tool-option"
                      aria-pressed={ocrMode}
                      disabled={busy || disabled}
                      onClick={chooseOcr}
                    >
                      <Paperclip size={14} />
                      Read a document (OCR)
                    </button>
                  )}
                  <a href="/demo/customer-form.pdf" download>
                    Download fictional sample form ↗
                  </a>
                </div>
              </details>
              {selectedTools.map((tool) => (
                <span className="selected-tool" key={tool.id}>
                  <span>{tool.label}</span>
                  <button
                    type="button"
                    aria-label={`Unselect ${tool.label}`}
                    title={`Turn off ${tool.label}`}
                    disabled={busy || disabled}
                    onClick={tool.clear}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <span>
              <Database size={13} />
              Banking dataset<span className="prompt-separator">/</span>
              <span className="prompt-scope">6 months · 4 regions</span>
            </span>
          )}
          <div>
            {chat && (
              <span className="composer-mode">
                BankWeave{" "}
                <span>
                  {providerError
                    ? "AI status unavailable"
                    : provider?.provider === "vertex"
                      ? "Gemini"
                      : provider?.provider === "local"
                        ? "Local"
                        : "AI"}
                </span>
              </span>
            )}
            {!chat && (
              <span className="keyboard-hint">
                <CornerDownLeft size={12} /> to ask
              </span>
            )}
            <button
              type="submit"
              className="send-button"
              aria-label="Send question"
              disabled={!query.trim() || busy || disabled}
            >
              {busy ? (
                <Loader2 size={18} className="spin" />
              ) : chat ? (
                <ArrowUp size={21} />
              ) : (
                <Send size={16} />
              )}
            </button>
          </div>
        </div>
      </form>
      {hero && (
        <SuggestedQuestions
          questions={starterQuestions}
          onSelect={onSubmit}
          disabled={busy || disabled}
        />
      )}
      {!hero && !chat && (
        <p className="prompt-disclaimer">
          {provider?.provider === "vertex"
            ? "Gemini analysis & form reading"
            : "Analytics & form reading"}{" "}
          · Review findings before acting
        </p>
      )}
    </div>
  );
}
