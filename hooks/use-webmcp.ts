"use client";
import { useEffect, useRef } from "react";
import { pages } from "@/components/shell";
import type { Page } from "@/types";
type ModelContext = {
  registerTool: (
    tool: {
      name: string;
      title: string;
      description: string;
      inputSchema: object;
      annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
      execute: (input: unknown) => Promise<unknown>;
    },
    options: { signal: AbortSignal }
  ) => void | Promise<void>;
};
// Optional browser capability. The ordinary UI works without this proposed API.
export function useWebMCP(navigate: (page: Page) => void) {
  const action = useRef(navigate);
  useEffect(() => {
    action.current = navigate;
  }, [navigate]);
  useEffect(() => {
    const modelContext = (document as Document & { modelContext?: ModelContext }).modelContext;
    if (!modelContext?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      Promise.resolve(
        modelContext.registerTool(
          {
            name: "navigate_bankweave_workspace",
            title: "Open a BankWeave workspace",
            description:
              "Navigate to an existing BankWeave workspace page. This only opens a view; it does not run an investigation, create a report, or execute financial actions.",
            inputSchema: {
              type: "object",
              properties: { page: { type: "string", enum: pages } },
              required: ["page"],
              additionalProperties: false,
            },
            annotations: { readOnlyHint: false, untrustedContentHint: false },
            async execute(input) {
              if (
                !input ||
                typeof input !== "object" ||
                !("page" in input) ||
                Object.keys(input).length !== 1 ||
                !pages.includes(input.page as Page)
              )
                throw new Error("Choose one valid BankWeave workspace page.");
              action.current(input.page as Page);
              await new Promise<void>((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
              );
              return { opened: input.page, environment: "synthetic-demo" };
            },
          },
          { signal: lifecycle.signal }
        )
      ).catch(() => {
        /* Optional experimental capability. */
      });
    } catch {
      /* Unsupported implementations do not affect the visible UI. */
    }
    return () => lifecycle.abort();
  }, []);
}
