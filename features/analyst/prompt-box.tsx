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
export const starterQuestions = [
  "Why did fraud increase this month?",
  "Which regions have the highest loan risk?",
  "Investigate suspicious transactions.",
  "Compare default rates by branch.",
];
export function PromptBox({
  onSubmit,
  busy = false,
  hero = false,
  chat = false,
  onUpload,
}: {
  onSubmit: (query: string) => void;
  busy?: boolean;
  hero?: boolean;
  chat?: boolean;
  onUpload?: (file: File) => void;
}) {
  const [query, setQuery] = useState("");
  const textarea = useRef<HTMLTextAreaElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!chat || !textarea.current) return;
    textarea.current.style.height = "auto";
    textarea.current.style.height = `${Math.min(textarea.current.scrollHeight, 180)}px`;
  }, [query, chat]);
  function submit() {
    if (query.trim() && !busy) {
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
          rows={2}
          disabled={busy}
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
                disabled={busy}
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
                disabled={busy}
                onClick={() => upload.current?.click()}
              >
                <Paperclip size={18} />
              </button>
            </>
          )}
          {chat ? (
            <details className="composer-tools">
              <summary>
                <SlidersHorizontal size={17} />
                Tools
                <ChevronDown size={12} />
              </summary>
              <div className="composer-tools-popover">
                <strong>Banking analysis tools</strong>
                <p>Selected automatically for your question.</p>
                <span>
                  <Database size={14} />
                  Query synthetic banking records
                </span>
                <span>
                  <Sparkles size={14} />
                  Analyze trends & risk patterns
                </span>
                <span>
                  <SlidersHorizontal size={14} />
                  Compare regions & model scenarios
                </span>
                <small>Local LangGraph workflow · No live banking connection</small>
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
                BankWeave <span>Local</span>
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
              disabled={!query.trim() || busy}
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
        <SuggestedQuestions questions={starterQuestions} onSelect={onSubmit} disabled={busy} />
      )}
      {!hero && (
        <p className="prompt-disclaimer">
          Local analytics & form reading · Review findings before acting
        </p>
      )}
    </div>
  );
}
