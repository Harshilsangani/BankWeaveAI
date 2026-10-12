"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ReactNode } from "react";
import { ArrowLeftRight } from "lucide-react";
import { useHorizontalOverflow } from "@/hooks/use-horizontal-overflow";
import { cn } from "@/lib/utils";

function MarkdownTable({ children }: { children?: ReactNode }) {
  const { ref, overflow } = useHorizontalOverflow();
  return (
    <div>
      {overflow && (
        <p className="table-scroll-hint">
          <ArrowLeftRight size={13} /> Scroll to see all columns
        </p>
      )}
      <div
        ref={ref}
        className="markdown-table-scroll"
        role="region"
        aria-label="Document table"
        tabIndex={0}
      >
        <table>{children}</table>
      </div>
    </div>
  );
}

export function MarkdownContent({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("markdown-content", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          h1: ({ children }) => <h3>{children}</h3>,
          h2: ({ children }) => <h4>{children}</h4>,
          h3: ({ children }) => <h5>{children}</h5>,
          h4: ({ children }) => <h6>{children}</h6>,
          img: () => null,
          a: ({ children }) => <span className="markdown-link-text">{children}</span>,
          table: MarkdownTable,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
