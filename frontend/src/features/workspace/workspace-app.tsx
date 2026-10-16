"use client";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import { Shell } from "@/features/workspace/components/shell";
import { Badge, Button, Skeleton } from "@/shared/ui/primitives";
import { Dialog } from "@/shared/ui/dialog";
import { EvidenceCard } from "@/shared/analytics/blocks";
import { Dashboard } from "@/features/dashboard/components/dashboard";
import { Analyst } from "@/features/analyst/components/analyst";
import { ChatHistory } from "@/features/analyst/components/chat-history";
import { DataWorkspace } from "@/features/customers/components/data-workspace";
import { Radar } from "@/features/risk/components/radar";
import { Investigation } from "@/features/investigations/components/investigation";
import { CardCampaigns } from "@/features/campaigns/components/card-campaigns";
import { CampaignReports } from "@/features/campaigns/components/campaign-reports";
import {
  clearStaffNotifications,
  readStaffNotification,
  removeStaffNotification,
} from "@/features/campaigns/api";
import { useCampaignLibrary } from "@/features/campaigns/hooks/use-campaign-library";
import { Knowledge } from "@/features/knowledge/components/knowledge";
import { Reports } from "@/features/reports/components/reports";
import { Settings } from "@/features/settings/components/settings";
import { useWorkspace } from "@/features/workspace/hooks/use-workspace";
import { useWebMCP } from "@/features/workspace/hooks/use-webmcp";
import type { Page } from "@/features/workspace/types";
import type { RiskEvent } from "@/features/risk/types";
export default function Home() {
  const workspace = useWorkspace();
  const campaignLibrary = useCampaignLibrary();
  const [campaignReportId, setCampaignReportId] = useState<string>();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [signedIn, setSignedIn] = useState(true);
  const [selectedEvidence, setSelectedEvidence] = useState<RiskEvent>();
  const [hiddenRiskNotices, setHiddenRiskNotices] = useState<string[]>([]);
  const [removingNoticeId, setRemovingNoticeId] = useState<string>();
  const [clearingNotices, setClearingNotices] = useState(false);
  const [noticeError, setNoticeError] = useState("");
  useEffect(() => {
    try {
      if (sessionStorage.getItem("bankweave-signed-in") === "no") setSignedIn(false);
    } catch {
      setSignedIn(true);
    }
  }, []);
  function setSigned(next: boolean) {
    setSignedIn(next);
    try {
      sessionStorage.setItem("bankweave-signed-in", next ? "yes" : "no");
    } catch {
      // The choice still applies until this tab closes.
    }
  }
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("bankweave-hidden-risk-notices");
      const parsed = saved ? (JSON.parse(saved) as unknown) : [];
      if (Array.isArray(parsed)) {
        setHiddenRiskNotices(parsed.filter((id): id is string => typeof id === "string"));
      }
    } catch {
      setHiddenRiskNotices([]);
    }
  }, []);
  const hideRiskNotices = useCallback((ids: string[]) => {
    setHiddenRiskNotices((current) => {
      const next = [...new Set([...current, ...ids])];
      try {
        sessionStorage.setItem("bankweave-hidden-risk-notices", JSON.stringify(next));
      } catch {
        // The open list still hides the items for this view.
      }
      return next;
    });
  }, []);
  useEffect(() => {
    const update = () =>
      setCampaignReportId(
        new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("report") ?? undefined
      );
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  const openCampaignReport = useCallback(
    (id: string) => {
      setCampaignReportId(id);
      workspace.navigate("Card Campaigns");
      window.location.hash = `card-campaigns?report=${encodeURIComponent(id)}`;
      setMobileOpen(false);
    },
    [workspace.navigate]
  );
  const closeCampaignReport = useCallback(() => {
    setCampaignReportId(undefined);
    workspace.navigate("Card Campaigns");
  }, [workspace.navigate]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  function navigate(page: Page) {
    workspace.navigate(page);
    setMobileOpen(false);
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
  const visibleRiskNotices =
    data?.risks.filter((risk) => !hiddenRiskNotices.includes(risk.id)) ?? [];
  const inboxBusy = clearingNotices || Boolean(removingNoticeId);
  async function removeCampaignNotice(id: string) {
    setNoticeError("");
    setRemovingNoticeId(id);
    try {
      await removeStaffNotification(id);
      campaignLibrary.removeNotification(id);
    } catch (cause) {
      setNoticeError(
        cause instanceof Error ? cause.message : "That notification could not be removed."
      );
      void campaignLibrary.refresh();
    } finally {
      setRemovingNoticeId(undefined);
    }
  }
  async function clearInbox() {
    setNoticeError("");
    setClearingNotices(true);
    try {
      if (campaignLibrary.notifications.length) await clearStaffNotifications();
      campaignLibrary.clearNotifications();
      if (data?.risks.length) hideRiskNotices(data.risks.map((risk) => risk.id));
    } catch (cause) {
      setNoticeError(
        cause instanceof Error ? cause.message : "Notifications could not be cleared."
      );
      void campaignLibrary.refresh();
    } finally {
      setClearingNotices(false);
    }
  }
  const chatLocked = Boolean(workspace.busy || workspace.contextStatus) || !workspace.sessionReady;
  return (
    <div className="app-shell">
      <Shell
        role={workspace.identity?.role}
        page={workspace.page}
        riskCount={data ? activeRisks.length : undefined}
        onPage={navigate}
        onNewChat={() =>
          void workspace.newChat().then((opened) => {
            if (opened) setMobileOpen(false);
          })
        }
        chatLocked={chatLocked}
        onNotifications={() => setNotificationsOpen(true)}
        notificationCount={campaignLibrary.unread}
        signedIn={signedIn}
        onLogin={() => setSigned(true)}
        onLogout={() => setSigned(false)}
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
            onOpen={(id) =>
              void workspace.openChat(id).then((opened) => {
                if (opened) setMobileOpen(false);
              })
            }
          />
        }
      >
        {!signedIn && (
          <section className="signed-out">
            <h1>Sign in</h1>
            <p>Log in with the demo staff profile to open this workspace.</p>
            <Button onClick={() => setSigned(true)}>Log in</Button>
          </section>
        )}
        {signedIn && workspace.error && (
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
        {signedIn &&
          (!data &&
          ![
            "AI Analyst",
            "Knowledge",
            "Reports",
            "Settings",
            "Card Campaigns",
            "Investigations",
          ].includes(workspace.page) ? (
            <Skeleton />
          ) : (
            <>
              {workspace.page === "Command Center" && data && (
                <>
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
                  <section className="panel dashboard-campaign-reports">
                    <div className="campaign-section-heading">
                      <div>
                        <h2>Campaign reports for you</h2>
                        <p>Prepared card offers and drafts assigned to your staff identity.</p>
                      </div>
                      <Button onClick={() => navigate("Card Campaigns")}>
                        Open Card Campaigns
                      </Button>
                    </div>
                    {campaignLibrary.error && (
                      <p role="alert">
                        {campaignLibrary.error}{" "}
                        <Button onClick={() => void campaignLibrary.refresh()}>
                          Retry campaign reports
                        </Button>
                      </p>
                    )}
                    <CampaignReports
                      reports={campaignLibrary.reports}
                      onOpen={openCampaignReport}
                      compact
                      onCampaigns={() => navigate("Card Campaigns")}
                    />
                  </section>
                </>
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
                  datasetId={workspace.datasetId}
                  dataReady={Boolean(workspace.datasets.length)}
                  onUpload={workspace.readForm}
                  messages={workspace.messages}
                  busy={workspace.busy === "query"}
                  pendingQuery={workspace.pendingQuery}
                  onQuery={workspace.ask}
                  onAction={workspace.action}
                  researchMode={workspace.researchMode}
                  onResearchMode={workspace.setResearchMode}
                  datasets={workspace.datasets}
                  onDataset={workspace.selectDataset}
                />
              )}
              {workspace.page === "Risk Radar" && data && (
                <Radar
                  onRefresh={workspace.refreshDashboard}
                  datasets={workspace.datasets}
                  initialDataset={data.datasetId}
                  initialPeriod={data.period}
                  onNotice={workspace.setToast}
                  onInvestigate={workspace.investigate}
                  onEvidence={setSelectedEvidence}
                />
              )}
              {workspace.page === "Investigations" && (
                <Investigation
                  canAnalyze={workspace.canAnalyze}
                  progress={workspace.progress}
                  onCancel={workspace.cancel}
                  investigation={workspace.investigation}
                  loading={workspace.busy === "investigation"}
                  reportBusy={workspace.busy === "report"}
                  onInvestigate={workspace.investigate}
                  onReport={() => workspace.report()}
                  onBack={() => navigate("Risk Radar")}
                />
              )}
              {workspace.page === "Card Campaigns" && (
                <CardCampaigns
                  identity={workspace.identity}
                  reportId={campaignReportId}
                  onReport={openCampaignReport}
                  onBack={closeCampaignReport}
                />
              )}
              {workspace.page === "Reports" && (
                <Reports
                  reports={workspace.reports}
                  onStart={() => navigate("Investigations")}
                  campaignReports={campaignLibrary.reports}
                  onCampaignReport={openCampaignReport}
                  onCampaigns={() => navigate("Card Campaigns")}
                />
              )}
              {workspace.page === "Knowledge" && (
                <Knowledge onAsk={workspace.ask} onNavigate={navigate} />
              )}
              {workspace.page === "Settings" && (
                <Settings theme={workspace.theme} onTheme={workspace.setTheme} />
              )}
            </>
          ))}
      </Shell>
      <Dialog
        open={notificationsOpen}
        onOpenChange={setNotificationsOpen}
        title="Workspace notifications"
        description="Your assigned campaign reports and historical demo risk events."
        headerAction={
          <button
            className="clear-notifications"
            type="button"
            onClick={() => void clearInbox()}
            disabled={
              inboxBusy || (!campaignLibrary.notifications.length && !visibleRiskNotices.length)
            }
          >
            Clear all
          </button>
        }
      >
        <h3>Employee campaign reports</h3>
        {(campaignLibrary.error || noticeError) && (
          <p role="alert">{noticeError || campaignLibrary.error}</p>
        )}
        {!campaignLibrary.notifications.length && (
          <p className="campaign-subtle">No assigned campaign notifications yet.</p>
        )}
        {campaignLibrary.notifications.map((item) => (
          <div className="notification-item" key={item.id}>
            <div>
              <Badge>{item.readAt ? "Read" : "Unread"}</Badge>
              <h3 className="mt-2">{item.title}</h3>
            </div>
            <div className="notification-actions">
              <Button
                onClick={() => {
                  setNotificationsOpen(false);
                  openCampaignReport(item.reportId);
                  void readStaffNotification(item.id).then(() => campaignLibrary.refresh());
                }}
              >
                Open employee report
              </Button>
              <button
                className="icon-button"
                type="button"
                aria-label={`Remove notification ${item.title}`}
                disabled={inboxBusy}
                onClick={() => void removeCampaignNotice(item.id)}
              >
                <X size={14} />
              </button>
            </div>
          </div>
        ))}
        <h3>Historical risk events</h3>
        {data && !visibleRiskNotices.length && (
          <p className="campaign-subtle">No historical risk events in this list.</p>
        )}
        {visibleRiskNotices.map((r) => (
          <div className="notification-item" key={r.id}>
            <div>
              <Badge tone={r.severity}>{r.severity}</Badge>
              <h3 className="mt-2">{r.title}</h3>
              <p>{r.affectedRecords} records need review · 30 Sep</p>
            </div>
            <div className="notification-actions">
              <Button
                onClick={() => {
                  setNotificationsOpen(false);
                  void workspace.investigate(r.id);
                }}
              >
                Investigate
              </Button>
              <button
                className="icon-button"
                type="button"
                aria-label={`Remove notification ${r.title}`}
                disabled={inboxBusy}
                onClick={() => hideRiskNotices([r.id])}
              >
                <X size={14} />
              </button>
            </div>
          </div>
        ))}
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
          disabled={!workspace.canAnalyze || selectedEvidence?.detection?.stale}
          onClick={() => {
            if (selectedEvidence)
              void workspace.investigate(selectedEvidence.id, selectedEvidence.detection?.scope);
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
