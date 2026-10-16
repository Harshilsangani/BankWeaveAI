"use client";
import { randomId } from "@/shared/lib/random-id";
import { useCallback, useEffect, useRef, useState } from "react";
import { getDashboard } from "@/features/dashboard/api";
import {
  getStaffIdentity,
  type StaffIdentity,
  setWorkspaceConversationId,
} from "@/shared/api/client";
import { getDatasets } from "@/shared/api/datasets";
import { startInvestigation, getSavedInvestigation } from "@/features/investigations/api";
import { generateReport } from "@/features/reports/api";
import {
  getWorkspaceSession,
  resetWorkspaceSession,
  getConversationHistory,
  openConversation,
  createConversation,
  type WorkspaceSession,
} from "@/features/workspace/api";
import { getRiskDispositions, updateRiskDisposition } from "@/features/risk/api";
import type { ConversationSummary } from "@/features/workspace/types/conversations";
import {
  streamOperation,
  cancelOperation,
  OperationError,
  type ProgressEvent,
} from "@/shared/api/operations";
import { pages } from "@/features/workspace/components/shell";
import type { AnalystResponse } from "@/features/analyst/types";
import type { Dashboard } from "@/features/dashboard/types";
import type { DatasetId, DatasetInfo, QueryContext } from "@/shared/types/scope";
import type { Investigation } from "@/features/investigations/types";
import type { Page } from "@/features/workspace/types";
import type { Report } from "@/features/reports/types";
import type { ScenarioResult } from "@/features/reports/legacy-types";
const slug = (page: Page) => page.toLowerCase().replaceAll(" ", "-");
export function useWorkspace() {
  const [page, setPage] = useState<Page>("Command Center");
  const [identity, setIdentity] = useState<StaffIdentity>();
  const canAnalyze = identity?.permissions.includes("analyze") ?? false;
  const canReadForms = identity?.permissions.includes("form_read") ?? false;
  useEffect(() => {
    let active = true;
    void getStaffIdentity()
      .then((value) => {
        if (active) setIdentity(value);
      })
      .catch(() => {
        if (active)
          setError("Staff permissions could not be loaded. Reload before starting a task.");
      });
    return () => {
      active = false;
    };
  }, []);
  const [dashboard, setDashboard] = useState<Dashboard>();
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<AnalystResponse[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string>();
  const [historyError, setHistoryError] = useState("");
  const [sessionReady, setSessionReady] = useState(false);
  const sessionRestored = useRef(false);
  const historyRevision = useRef(0);
  const [pendingQuery, setPendingQuery] = useState("");
  const [context, setContext] = useState<QueryContext>();
  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [datasetId, setDatasetId] = useState<DatasetId>("meridian");
  const [period, setPeriod] = useState<string>();
  const [investigation, setInvestigation] = useState<Investigation>();
  const [reports, setReports] = useState<Report[]>([]);
  const [scenario, setScenario] = useState<ScenarioResult>();
  const [scenarioRisk, setScenarioRisk] = useState("RSK-001");
  const [scenarioScope, setScenarioScope] = useState<QueryContext>();
  const [busy, setBusy] = useState<"query" | "investigation" | "report" | null>(null);
  const [researchMode, setResearchModeState] = useState(false);
  useEffect(() => {
    try {
      setResearchModeState(window.sessionStorage.getItem("bankweave-research-mode") === "on");
    } catch {
      /* Research still works for this page when browser storage is unavailable. */
    }
  }, []);
  function setResearchMode(enabled: boolean) {
    setResearchModeState(enabled);
    try {
      window.sessionStorage.setItem("bankweave-research-mode", enabled ? "on" : "off");
    } catch {
      /* Keep the in-memory setting usable. */
    }
  }
  const [contextStatus, setContextStatus] = useState<"restoring" | "saving" | null>("restoring");
  const lock = useRef(false);
  const [progress, setProgress] = useState<ProgressEvent[]>([]);
  const [canRetry, setCanRetry] = useState(false);
  const activeOperation = useRef<{ controller: AbortController; requestId: string } | undefined>(
    undefined
  );
  const retryJob = useRef<() => void>(() => {});
  function applySession(saved: WorkspaceSession) {
    historyRevision.current++;
    sessionRestored.current = true;
    setSessionReady(true);
    if (saved.activeConversationId) setWorkspaceConversationId(saved.activeConversationId);
    setActiveConversationId(saved.activeConversationId);
    setConversations(saved.conversations ?? []);
    setMessages(saved.messages);
    setContext(saved.context ?? undefined);
    setDatasetId(saved.datasetId);
    setPeriod(saved.period ?? "all");
    setInvestigation(saved.investigation ?? undefined);
    setReports(saved.reports);
    setScenario(undefined);
    setScenarioScope(undefined);
    setHistoryError("");
  }
  async function refreshHistory() {
    if (lock.current) return;
    const revision = ++historyRevision.current;
    const restore = !sessionRestored.current;
    if (restore) {
      lock.current = true;
      setContextStatus("restoring");
    }
    try {
      if (restore) {
        const saved = await getWorkspaceSession();
        if (revision !== historyRevision.current) return;
        applySession(saved);
        setError("");
      } else {
        const saved = await getConversationHistory();
        if (revision !== historyRevision.current) return;
        setConversations(saved);
        setHistoryError("");
      }
    } catch {
      if (revision === historyRevision.current)
        setHistoryError("Chat history could not be loaded.");
    } finally {
      if (restore) {
        lock.current = false;
        setContextStatus(null);
      }
    }
  }
  function cancel() {
    const active = activeOperation.current;
    if (active) {
      void cancelOperation(active.requestId).catch(() => {});
      active.controller.abort();
    }
  }
  function startJob<T>(
    kind: "query" | "investigation" | "form",
    payload: unknown,
    type: "query" | "investigation",
    label: string,
    accept: (result: T) => void,
    requestId = randomId()
  ) {
    if (lock.current || !sessionRestored.current) return;
    if (!(kind === "form" ? canReadForms : canAnalyze)) {
      setError("Your role can view results. An Analyst or Admin is required to start this task.");
      return;
    }
    lock.current = true;
    setBusy(type);
    setError("");
    setCanRetry(false);
    setProgress([]);
    setPendingQuery(label);
    navigate(type === "query" ? "AI Analyst" : "Investigations");
    const controller = new AbortController();
    activeOperation.current = { controller, requestId };
    void streamOperation<T>(kind, payload, {
      requestId,
      signal: controller.signal,
      onProgress: (event) =>
        setProgress((current) => [...current.filter((item) => item.stage !== event.stage), event]),
    })
      .then((result) => {
        accept(result);
        setCanRetry(false);
      })
      .catch((error) => {
        const aborted = controller.signal.aborted;
        setError(
          aborted
            ? "Request cancelled. No banking control was executed."
            : error instanceof Error
              ? error.message
              : "Operation failed."
        );
        const nextId =
          aborted || (error instanceof OperationError && error.terminal) ? randomId() : requestId;
        retryJob.current = () => startJob(kind, payload, type, label, accept, nextId);
        setCanRetry(true);
      })
      .finally(() => {
        activeOperation.current = undefined;
        lock.current = false;
        setBusy(null);
        setPendingQuery("");
        void refreshHistory();
      });
  }
  const [toast, setToast] = useState("");
  const [theme, setTheme] = useState("dark");
  const [hydrated, setHydrated] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const navigate = useCallback((next: Page) => {
    if (next === "Investigations") setInvestigation(undefined);
    setPage(next);
    window.location.hash = slug(next);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);
  useEffect(() => {
    let active = true;
    lock.current = true;
    getWorkspaceSession()
      .then((saved) => {
        if (!active) return;
        applySession(saved);
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setHistoryError("Chat history could not be loaded.");
        }
      })
      .finally(() => {
        if (active) {
          lock.current = false;
          setContextStatus(null);
        }
      });
    getDashboard()
      .then(setDashboard)
      .catch((e) => setError(e.message));
    getDatasets()
      .then(setDatasets)
      .catch((e) => setError(e.message));
    getRiskDispositions()
      .then((v) => {
        if (active) setDismissed(v.dismissed);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    const fromHash = () => {
      const hash = window.location.hash.slice(1).split("?")[0];
      if (hash === "scenario-simulator") {
        setPage("Card Campaigns");
        setToast(
          "Scenario Simulator has moved to Card Campaigns. Saved scenario reports remain available."
        );
        window.location.hash = "card-campaigns";
        return;
      }
      const target = pages.find((p) => slug(p) === hash);
      setPage(target ?? "Command Center");
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    try {
      const saved = JSON.parse(localStorage.getItem("risklens-workspace-v1") ?? "null");
      if (saved?.theme === "light") setTheme("light");
    } catch {
      /* Stale or unavailable storage must not prevent using the demo. */
    }
    setHydrated(true);
    return () => {
      active = false;
      historyRevision.current++;
      window.removeEventListener("hashchange", fromHash);
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem("risklens-workspace-v1", JSON.stringify({ theme }));
    } catch {
      /* Workspace remains functional if storage is full or blocked. */
    }
  }, [theme, reports, dismissed, hydrated]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  async function ask(query: string, datasetOverride?: DatasetId) {
    if (lock.current) return;
    if (datasetOverride) {
      lock.current = true;
      setContextStatus("saving");
      try {
        applySession(await resetWorkspaceSession(datasetOverride));
      } catch (error) {
        setError(error instanceof Error ? error.message : "Selection failed.");
        return;
      } finally {
        lock.current = false;
        setContextStatus(null);
      }
    }
    const prior = context ? { ...context } : undefined;
    if (prior) delete prior.research;
    const selected = datasetOverride
      ? {
          domain: "fraud" as const,
          datasetId: datasetOverride,
          ...(researchMode ? { research: true as const } : {}),
        }
      : {
          ...prior,
          domain: prior?.domain ?? "fraud",
          datasetId,
          ...(period ? { period } : {}),
          ...(researchMode ? { research: true as const } : {}),
        };
    startJob<AnalystResponse>("query", { query, context: selected }, "query", query, (response) => {
      setMessages((current) =>
        current.some((item) => item.id === response.id) ? current : [...current, response]
      );
      setContext(response.context);
      if (response.context.period) setPeriod(response.context.period);
      for (const block of response.blocks) {
        if (block.type === "REPORT")
          setReports((current) =>
            [block.report, ...current.filter((item) => item.id !== block.report.id)].slice(0, 20)
          );
        if (block.type === "COMPARISON") setScenario(block.result);
      }
    });
  }
  async function investigate(id: string, scope?: QueryContext) {
    if (lock.current) return;
    setInvestigation(undefined);
    if (id.startsWith("INV-")) {
      lock.current = true;
      setBusy("investigation");
      setProgress([]);
      setError("");
      navigate("Investigations");
      try {
        setInvestigation(await getSavedInvestigation(id));
      } catch (error) {
        setError(error instanceof Error ? error.message : "Restoration failed.");
      } finally {
        lock.current = false;
        setBusy(null);
      }
      return;
    }
    startJob<Investigation>(
      "investigation",
      {
        riskId: id,
        scope: scope ?? {
          domain: id === "RSK-002" ? "loans" : "fraud",
          datasetId: id === "BS-001" ? "bankshield" : "meridian",
        },
      },
      "investigation",
      "",
      (value) => {
        setInvestigation(value);
        void getDashboard()
          .then(setDashboard)
          .catch(() => {});
      }
    );
  }
  function readForm(file: File) {
    if (file.size > 8 * 1024 * 1024) {
      setError("Upload a customer form up to 8 MB.");
      return;
    }
    startJob<import("@/features/forms/types").FormDraft>(
      "form",
      file,
      "query",
      `Read filled form: ${file.name}`,
      (draft) => {
        const meta = datasets.find((item) => item.id === "meridian");
        const response: AnalystResponse = {
          id: draft.id,
          question: `Read filled form: ${file.name}`,
          title: "Form extracted · review before saving",
          timestamp: new Date().toISOString(),
          context: { domain: "fraud", datasetId: "meridian" },
          blocks: [{ type: "FORM", draft }],
          suggestions: [],
        };
        if (meta)
          response.analysis = {
            datasetId: "meridian",
            datasetName: "Customer onboarding",
            period: "Uploaded form",
            baseline: "Not applicable",
            currency: "INR",
            provider: draft.provider,
            datasetVersion: meta.version,
            runId: draft.threadId,
            stages: draft.stages,
            externalTransmission: draft.externalTransmission ?? false,
            outboundFields: draft.externalTransmission ? ["uploadedDocumentBytes"] : [],
            limitations: [
              "Extracted fields require human review. Saving creates a pending-verification profile.",
            ],
            coverage: meta.coverage,
          };
        setMessages((current) =>
          current.some((item) => item.id === draft.id) ? current : [...current, response]
        );
      }
    );
  }
  async function report(id?: string, scope?: QueryContext) {
    if (!canAnalyze) {
      setError("An Analyst or Admin is required to create a report.");
      return;
    }
    if (lock.current) return;
    lock.current = true;
    setBusy("report");
    setError("");
    try {
      const selected = id ? await startInvestigation(id, scope) : investigation;
      if (!selected) throw new Error("Open an investigation before creating a report.");
      const result = await generateReport(
        selected,
        scenario?.input.riskId === selected.risk.id &&
          scenario.baseline === selected.risk.estimatedExposure
          ? scenario
          : undefined
      );
      setReports((r) => [result, ...r.filter((item) => item.id !== result.id)].slice(0, 20));
      setToast("Investigation report saved to this workspace.");
      navigate("Reports");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to generate the report.");
    } finally {
      lock.current = false;
      setBusy(null);
    }
  }
  function action(
    type: "investigate" | "simulate" | "report",
    riskId: string,
    scope?: QueryContext
  ) {
    if (!canAnalyze) {
      setError("An Analyst or Admin is required to start this task.");
      return;
    }
    if (type === "investigate") void investigate(riskId, scope);
    else if (type === "report") void report(riskId, scope);
    else {
      setScenarioRisk(riskId === "RSK-002" ? "RSK-001" : riskId);
      setScenarioScope(scope);
      setToast("Scenario Simulator is retired. Your saved scenario results remain readable.");
    }
  }
  async function resetSelection(id: DatasetId, month = "all") {
    if (lock.current) return;
    lock.current = true;
    setContextStatus("saving");
    setError("");
    try {
      applySession(await resetWorkspaceSession(id, month));
      setCanRetry(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Workspace could not be reset.");
    } finally {
      lock.current = false;
      setContextStatus(null);
    }
  }
  async function changeConversation(id?: string) {
    if (lock.current) return false;
    lock.current = true;
    setContextStatus(id ? "restoring" : "saving");
    setError("");
    setCanRetry(false);
    setToast("");
    try {
      applySession(id ? await openConversation(id) : await createConversation(datasetId, period));
      setProgress([]);
      navigate("AI Analyst");
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : "Chat could not be opened.");
      return false;
    } finally {
      lock.current = false;
      setContextStatus(null);
    }
  }
  const dispositionQueue = useRef(Promise.resolve());
  function setRiskState(action: "dismiss" | "restore", id?: string) {
    if (!canAnalyze) {
      setError("An Analyst or Admin is required to change risk status.");
      return;
    }
    setDismissed((current) => (action === "dismiss" && id ? [...new Set([...current, id])] : []));
    dispositionQueue.current = dispositionQueue.current.then(async () => {
      try {
        await updateRiskDisposition(action, id);
        setToast(action === "dismiss" ? "Risk dismissal saved." : "Risk signals reopened.");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Risk state could not be saved.");
        try {
          setDismissed((await getRiskDispositions()).dismissed);
        } catch {
          setError("Risk state could not be recovered. Reload when the service is available.");
        }
      }
    });
  }
  return {
    identity,
    canAnalyze,
    canReadForms,
    conversations,
    activeConversationId,
    historyError,
    sessionReady,
    refreshHistory,
    openChat: (id: string) => changeConversation(id),
    newChat: () => changeConversation(),
    contextStatus,
    datasets,
    progress,
    cancel,
    canRetry,
    retry: () => retryJob.current(),
    readForm,
    datasetId,
    period,
    researchMode,
    setResearchMode,
    selectDataset: (id: DatasetId) => void resetSelection(id),
    selectPeriod: (value: string) => void resetSelection(datasetId, value),
    page,
    navigate,
    dashboard,
    refreshDashboard: () =>
      void Promise.all([getDashboard(), getRiskDispositions()])
        .then(([dashboard, state]) => {
          setDashboard(dashboard);
          setDismissed(state.dismissed);
        })
        .catch((error) => setError(error.message)),
    error,
    setError,
    messages,
    pendingQuery,
    context,
    ask,
    investigation,
    investigate,
    reports,
    report,
    scenario,
    setScenario,
    scenarioRisk,
    setScenarioRisk,
    scenarioScope,
    setScenarioScope,
    busy,
    action,
    toast,
    setToast,
    theme,
    setTheme,
    dismissed,
    dismissRisk: (id: string) => setRiskState("dismiss", id),
    restoreRisks: () => setRiskState("restore"),
    clearConversation: () => void changeConversation(),
  };
}
