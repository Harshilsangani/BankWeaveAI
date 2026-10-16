"use client";
import {
  Activity,
  ChevronRight,
  Clock3,
  ScanLine,
  Database,
  Sparkles,
  ArrowUpRight,
} from "lucide-react";
import type { Dashboard as DashboardData } from "@/features/dashboard/types";
import type { RiskEvent } from "@/features/risk/types";
import { ChartCard, KpiCard } from "@/shared/analytics/blocks";
import { RiskCard } from "@/features/risk/components/risk-card";
import { Badge, Button, SectionTitle, TextLink } from "@/shared/ui/primitives";
export function Dashboard({
  data,
  onAnalyst,
  onData,
  onInvestigate,
  onRadar,
  canAnalyze,
}: {
  data: DashboardData;
  onAnalyst: () => void;
  onData: () => void;
  onInvestigate: (id: string) => void;
  onRadar: () => void;
  canAnalyze: boolean;
}) {
  return (
    <div className="dashboard animate-in">
      <div className="page-heading">
        <div>
          <h1>
            Command Center
            <span className="heading-dot" />
          </h1>
          <p>From banking questions to risk intelligence.</p>
        </div>
        <div className="snapshot-control">
          <Clock3 size={14} />
          <span>{data.snapshot}</span>
          <Badge>Snapshot</Badge>
        </div>
      </div>
      <div className="kpi-grid">
        {data.metrics.map((m) => (
          <KpiCard key={m.label} metric={m} />
        ))}
      </div>
      <div className="dashboard-columns">
        <div className="dashboard-main">
          <div className="dashboard-shortcuts">
            <section className="workspace-shortcut analyst-shortcut">
              <Sparkles size={22} />
              <div>
                <h2>AI Analyst</h2>
                <p>Explore banking data, investigate signals, and read customer forms.</p>
              </div>
              <Button variant="primary" onClick={onAnalyst}>
                Open AI Analyst <ArrowUpRight size={16} />
              </Button>
            </section>
            <section className="workspace-shortcut">
              <Database size={22} />
              <div>
                <h2>Customer data</h2>
                <p>
                  {data.customerCount?.toLocaleString()} current customer identities · browse linked
                  banking records.
                </p>
              </div>
              <Button onClick={onData}>
                Manage customer data <ArrowUpRight size={16} />
              </Button>
            </section>
          </div>
          <div className="analytics-grid">
            <ChartCard
              title="Fraud signal overview"
              subtitle="Flagged transactions · last 6 months"
              points={data.trend}
            />
            <ChartCard
              title="Regional concentration"
              subtitle="Flagged transactions by branch region"
              points={data.regions}
              kind="bar"
            />
          </div>
          <section className="panel recent-panel">
            <SectionTitle title="Recent investigations" sub="Pick up where the evidence leads." />
            <div className="recent-head">
              <span>INVESTIGATION</span>
              <span>STATUS</span>
              <span>UPDATED</span>
            </div>
            {!data.recent.length && (
              <p className="muted">Open a risk signal to start your first saved investigation.</p>
            )}
            {data.recent.map((item) => (
              <button
                className="recent-row"
                key={item.investigationId ?? item.id}
                onClick={() => onInvestigate(item.investigationId ?? item.id)}
              >
                <span className="recent-name">
                  <span className="recent-icon">
                    <ScanLine size={17} />
                  </span>
                  <span>
                    <strong>{item.title}</strong>
                    <small>
                      {item.id.replace("RSK", "INV")}
                      <i />
                      {item.category}
                    </small>
                  </span>
                </span>
                <Badge tone="amber">{item.status}</Badge>
                <span className="recent-time">
                  {item.time}
                  <ChevronRight size={15} />
                </span>
              </button>
            ))}
          </section>
        </div>
        <aside className="dashboard-aside">
          <section className="panel radar-panel">
            <SectionTitle title="Risk Radar">
              <Badge>{String(data.risks.length).padStart(2, "0")}</Badge>
              <Badge tone="accent">
                <Activity size={12} />
                Snapshot
              </Badge>
            </SectionTitle>
            <p className="radar-intro">Signals that deserve your attention.</p>
            <div className="risk-list">
              {data.risks.length ? (
                data.risks.map((risk: RiskEvent) => (
                  <RiskCard
                    key={risk.id}
                    risk={risk}
                    onInvestigate={onInvestigate}
                    disabled={!canAnalyze}
                  />
                ))
              ) : (
                <p className="radar-empty muted">
                  All caught up — every signal is dismissed locally. Use “Explore all risk signals”
                  below to restore them.
                </p>
              )}
            </div>
            <TextLink onClick={onRadar}>Explore all risk signals</TextLink>
          </section>
        </aside>
      </div>
      <footer className="dashboard-footer">
        <span>
          <span className="status-dot" />
          Demo workspace · All data is synthetic
        </span>
        <span>Snapshot: {data.snapshot} · IST</span>
      </footer>
    </div>
  );
}
