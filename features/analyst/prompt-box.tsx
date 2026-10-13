"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  ChevronDown,
  CornerDownLeft,
  Database,
  Loader2,
  Paperclip,
  Send,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { SuggestedQuestions } from "@/components/blocks";
import type { AIProviderStatus } from "@/types";
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
}: {
  onSubmit: (query: string) => void;
  busy?: boolean;
  disabled?: boolean;
  hero?: boolean;
  chat?: boolean;
  onUpload?: (file: File) => void;
  provider?: AIProviderStatus;
}) {
  const [query, setQuery] = useState("");
  const textarea = useRef<HTMLTextAreaElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const tools = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (!chat) return;
    const dismiss = (event: PointerEvent) => {
      if (tools.current?.open && !tools.current.contains(event.target as Node)) {
        tools.current.open = false;
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && tools.current?.open) {
        tools.current.open = false;
        tools.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [chat]);
  useEffect(() => {
    if (!chat || !textarea.current) return;
    textarea.current.style.height = "auto";
    textarea.current.style.height = `${Math.min(textarea.current.scrollHeight, 180)}px`;
  }, [query, chat]);
  function submit() {
    if (query.trim() && !busy && !disabled) {
      onSubmit(query.trim());
      setQuery("");
    }
  }
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
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="prompt-toolbar">
          {chat && onUpload && (
            <>
              <input
                ref={upload}
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                className="sr-only"
                aria-label="Upload customer form"
                disabled={busy || disabled}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onUpload(file);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                className="form-attach"
                aria-label="Attach filled customer form"
                title="Read a filled PDF or image form"
                disabled={busy || disabled}
                onClick={() => upload.current?.click()}
              >
                <Paperclip size={18} />
              </button>
            </>
          )}
          {chat ? (
            <details className="composer-tools" ref={tools}>
              <summary>
                <SlidersHorizontal size={17} />
                Tools
                <ChevronDown size={12} />
              </summary>
              <div className="composer-tools-popover">
                <strong>Tools</strong>
                <button
                  type="button"
                  className="composer-tool-option"
                  disabled={busy || disabled}
                  onClick={() => {
                    if (tools.current) tools.current.open = false;
                    textarea.current?.focus();
                  }}
                >
                  <Database size={14} />
                  Analyze banking data
                </button>
                {onUpload && (
                  <button
                    type="button"
                    className="composer-tool-option"
                    disabled={busy || disabled}
                    onClick={() => {
                      if (tools.current) tools.current.open = false;
                      upload.current?.click();
                    }}
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
                  {provider?.provider === "vertex"
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
