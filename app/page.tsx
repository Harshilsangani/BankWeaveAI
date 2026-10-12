"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, ChevronRight, Search, X } from "lucide-react";
import { pages, Shell } from "@/components/shell";
import { Badge, Button, Skeleton } from "@/components/ui";
import { Dialog } from "@/components/dialog";
import { EvidenceCard } from "@/components/blocks";
import { Dashboard } from "@/features/dashboard/dashboard";
import { Analyst } from "@/features/analyst/analyst";
import { ChatHistory } from "@/features/analyst/chat-history";
import { DataWorkspace } from "@/features/data-workspace/data-workspace";
import { Radar } from "@/features/risk/radar";
import { Investigation } from "@/features/investigations/investigation";
import { Simulator } from "@/features/scenarios/simulator";
import { Knowledge, Reports, Settings } from "@/features/resources/resources";
import { useWorkspace } from "@/hooks/use-workspace";
import { useWebMCP } from "@/hooks/use-webmcp";
import type { Page, RiskEvent } from "@/types";
export default function Home() {
  const workspace = useWorkspace();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false),
    [search, setSearch] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false),
    [profileOpen, setProfileOpen] = useState(false);
  const [selectedEvidence, setSelectedEvidence] = useState<RiskEvent>();
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((open) => !open);
      }
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  function navigate(page: Page) {
    workspace.navigate(page);
    setMobileOpen(false);
    setCommandOpen(false);
  }
  useWebMCP(navigate);
  if (workspace.page === "Data Workspace") {
    return (
      <main id="main-content" className="standalone-data">
        <DataWorkspace
          onBack={() => {
            workspace.refreshDashboard();
            navigate("Command Center");
          }}
          onInvestigate={workspace.investigate}
          onAnalyst={() => navigate("AI Analyst")}
        />
      </main>
    );
  }
  const data = workspace.dashboard;
  const activeRisks = data?.risks.filter((risk) => !workspace.dismissed.includes(risk.id)) ?? [];
  const searchMatches = pages.filter((p) => p.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="app-shell">
      <Shell
        role={workspace.identity?.role}
        page={workspace.page}
        riskCount={data ? activeRisks.length : undefined}
        onPage={navigate}
        onSearch={() => {
          setSearch("");
          setCommandOpen(true);
        }}
        onNotifications={() => setNotificationsOpen(true)}
        onProfile={() => setProfileOpen(true)}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
        chatHistory={
          <ChatHistory
            conversations={workspace.conversations}
            activeId={workspace.activeConversationId}
            locked={Boolean(workspace.busy || workspace.contextStatus)}
            loading={!workspace.activeConversationId && workspace.contextStatus === "restoring"}
            error={workspace.historyError}
            onRetry={() => void workspace.refreshHistory()}
            onNew={() =>
              void workspace.newChat().then((opened) => {
                if (opened) setMobileOpen(false);
              })
            }
            onOpen={(id) =>
              void workspace.openChat(id).then((opened) => {
                if (opened) setMobileOpen(false);
              })
            }
          />
        }
      >
        {workspace.error && (
          <div className="error-banner" role="alert">
            {workspace.error}
            {workspace.canRetry && (
              <Button variant="ghost" onClick={workspace.retry}>
                Retry request
              </Button>
            )}
            <button aria-label="Dismiss error" onClick={() => workspace.setError("")}>
              <X size={15} />
            </button>
          </div>
        )}
        {!data && workspace.page !== "AI Analyst" ? (
          <Skeleton />
        ) : (
          <>
            {workspace.page === "Command Center" && data && (
              <Dashboard
                data={{
                  ...data,
                  risks: activeRisks,
                  metrics: data.metrics.map((metric) =>
                    metric.label === "Active risk signals"
                      ? {
                          ...metric,
                          value: String(activeRisks.length).padStart(2, "0"),
                          change: `${activeRisks.filter((risk) => risk.severity === "high").length} high severity`,
                        }
                      : metric
                  ),
                }}
                onAnalyst={() => navigate("AI Analyst")}
                onData={() => navigate("Data Workspace")}
                onInvestigate={workspace.investigate}
                onRadar={() => navigate("Risk Radar")}
                canAnalyze={workspace.canAnalyze}
              />
            )}
            {workspace.page === "AI Analyst" && (
              <Analyst
                key={workspace.activeConversationId}
                notice={workspace.toast}
                onDismissNotice={() => workspace.setToast("")}
                contextStatus={workspace.contextStatus}
                ready={workspace.sessionReady}
                role={workspace.identity?.role}
                canAnalyze={workspace.canAnalyze}
                progress={workspace.progress}
                onCancel={workspace.cancel}
                datasets={workspace.datasets}
                datasetId={workspace.datasetId}
                period={workspace.period}
                onDataset={workspace.selectDataset}
                onPeriod={workspace.selectPeriod}
                onUpload={workspace.readForm}
                messages={workspace.messages}
                context={workspace.context}
                busy={workspace.busy === "query"}
                pendingQuery={workspace.pendingQuery}
                onQuery={workspace.ask}
                onAction={workspace.action}
                onClear={workspace.clearConversation}
              />
            )}
            {workspace.page === "Risk Radar" && data && (
              <Radar
                onRefresh={workspace.refreshDashboard}
                risks={data.risks}
                dismissed={workspace.dismissed}
                onDismiss={workspace.dismissRisk}
                onRestore={workspace.restoreRisks}
                onInvestigate={workspace.investigate}
                onEvidence={setSelectedEvidence}
              />
            )}
            {workspace.page === "Investigations" && data && (
              <Investigation
                canAnalyze={workspace.canAnalyze}
                progress={workspace.progress}
                onCancel={workspace.cancel}
                investigation={workspace.investigation}
                risks={data.risks}
                loading={workspace.busy === "investigation"}
                reportBusy={workspace.busy === "report"}
                onInvestigate={workspace.investigate}
                onReport={() => workspace.report()}
                onScenario={() =>
                  workspace.action(
                    "simulate",
                    workspace.investigation!.risk.id,
                    workspace.investigation!.scope
                  )
                }
                onBack={() => navigate("Risk Radar")}
              />
            )}
            {workspace.page === "Scenario Simulator" && data && (
              <Simulator
                reportBusy={workspace.busy === "report"}
                risks={data.risks}
                riskId={workspace.scenarioRisk}
                scope={workspace.scenarioScope}
                onRisk={(id) => {
                  workspace.setScenarioRisk(id);
                  workspace.setScenarioScope(undefined);
                }}
                result={workspace.scenario}
                onResult={workspace.setScenario}
                onReport={(id) => workspace.report(id, workspace.scenario?.input.scope)}
              />
            )}
            {workspace.page === "Reports" && (
              <Reports reports={workspace.reports} onStart={() => navigate("Investigations")} />
            )}
            {workspace.page === "Knowledge" && <Knowledge onAsk={workspace.ask} />}
            {workspace.page === "Settings" && (
              <Settings theme={workspace.theme} onTheme={workspace.setTheme} />
            )}
          </>
        )}
      </Shell>
      <Dialog
        open={commandOpen}
        onOpenChange={setCommandOpen}
        title="Search your workspace"
        description="Jump to a workspace, investigate a signal, or ask a banking question."
      >
        <label className="command-input">
          <Search size={18} />
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search or ask BankWeave…"
            aria-label="Command search"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (searchMatches.length) navigate(searchMatches[0]);
                else if (search.trim()) {
                  setCommandOpen(false);
                  void workspace.ask(search);
                }
              }
              if (e.key === "ArrowDown") {
                e.preventDefault();
                document.querySelector<HTMLButtonElement>(".command-results button")?.focus();
              }
            }}
          />
        </label>
        <div
          className="command-results"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              const buttons = Array.from(e.currentTarget.querySelectorAll("button"));
              const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
              buttons[
                (index + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length
              ]?.focus();
            }
          }}
        >
          {searchMatches.map((p) => (
            <button key={p} onClick={() => navigate(p)}>
              <span>{p}</span>
              <ChevronRight size={14} />
            </button>
          ))}
          {data?.risks
            .filter((r) => search && r.title.toLowerCase().includes(search.toLowerCase()))
            .map((r) => (
              <button
                key={r.id}
                onClick={() => {
                  setCommandOpen(false);
                  void workspace.investigate(r.id);
                }}
              >
                <span>{r.title}</span>
                <small>Investigate {r.id}</small>
              </button>
            ))}
          {search.trim() && (
            <button
              onClick={() => {
                setCommandOpen(false);
                void workspace.ask(search);
              }}
            >
              <span>Ask analyst: “{search}”</span>
              <Badge tone="accent">Analyze</Badge>
            </button>
          )}
        </div>
        <div className="command-footer">↑ ↓ to navigate · Enter to select · Esc to close</div>
      </Dialog>
      <Dialog
        open={notificationsOpen}
        onOpenChange={setNotificationsOpen}
        title="Workspace notifications"
        description="Risk events from the September 2026 demo snapshot. This is not a live bank feed."
      >
        {data?.risks.map((r) => (
          <div className="notification-item" key={r.id}>
            <div>
              <Badge tone={r.severity}>{r.severity}</Badge>
              <h3 className="mt-2">{r.title}</h3>
              <p>{r.affectedRecords} records need review · 30 Sep</p>
            </div>
            <Button
              onClick={() => {
                setNotificationsOpen(false);
                void workspace.investigate(r.id);
              }}
            >
              Investigate
            </Button>
          </div>
        ))}
      </Dialog>
      <Dialog
        open={profileOpen}
        onOpenChange={setProfileOpen}
        title="Alex Kumar"
        description={`${workspace.identity?.role ?? "Loading permissions"} · Meridian Bank demo workspace`}
      >
        <div className="insight-card">
          <span className="avatar">AK</span>
          <p>
            This fictional profile demonstrates the employee experience. Local roles enforce backend
            permissions. Verified staff sign-in remains a GCP deployment task.
          </p>
        </div>
        <Button
          className="mt-5"
          onClick={() => {
            setProfileOpen(false);
            navigate("Settings");
          }}
        >
          Workspace settings
        </Button>
      </Dialog>
      <Dialog
        open={!!selectedEvidence}
        onOpenChange={(open) => {
          if (!open) setSelectedEvidence(undefined);
        }}
        title={selectedEvidence?.title ?? "Evidence"}
        description="Source references from synthetic banking records."
      >
        <div className="evidence-list">
          {selectedEvidence?.evidence.map((e) => (
            <EvidenceCard key={e.id} item={e} />
          ))}
        </div>
        <Button
          className="mt-5"
          variant="primary"
          onClick={() => {
            if (selectedEvidence) void workspace.investigate(selectedEvidence.id);
            setSelectedEvidence(undefined);
          }}
        >
          Open investigation
        </Button>
      </Dialog>
      {workspace.toast && workspace.page !== "AI Analyst" && !mobileOpen && (
        <div className="toast" role="status">
          <CheckCircle2 size={17} />
          {workspace.toast}
          <button onClick={() => workspace.setToast("")} aria-label="Dismiss notification">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
