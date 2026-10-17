"use client";
import type { Dashboard as DashboardData } from "@/features/dashboard/types";
import { AnalyticsChart } from "@/shared/analytics/charts";

export function Dashboard({
  data,
  onAnalyst,
  onData,
  onImportData,
  canImport,
  onInvestigate,
  onRadar,
  canAnalyze,
}: {
  data: DashboardData;
  onAnalyst: () => void;
  onData: () => void;
  onImportData: () => void;
  canImport: boolean;
  onInvestigate: (id: string) => void;
  onRadar: () => void;
  canAnalyze: boolean;
}) {
  const regionMax = Math.max(1, ...data.regions.map((point) => point.value));
  return (
    <div className="dashboard command-desk animate-in">
      <header className="desk-mast">
        <div>
          <p className="desk-kicker">Snapshot · {data.snapshot}</p>
          <h1>Command Center</h1>
          <p className="desk-lede">
            From banking questions to risk intelligence.
            {typeof data.customerCount === "number"
              ? ` ${data.customerCount.toLocaleString()} customer identities are on file.`
              : ""}
          </p>
        </div>
        <nav className="desk-actions" aria-label="Workspace shortcuts">
          <button type="button" onClick={onAnalyst}>
            Open AI Analyst
          </button>
          <button type="button" onClick={onData}>
            Manage customer data
          </button>
          {canImport && (
            <button type="button" onClick={onImportData}>
              Upload new data
            </button>
          )}
        </nav>
      </header>
      <dl className="desk-rail">
        {data.metrics.map((metric) => (
          <div key={metric.label}>
            <dt>{metric.label}</dt>
            <dd>{metric.value}</dd>
            <small className={metric.direction}>{metric.change}</small>
          </div>
        ))}
      </dl>
      <div className="desk-split">
        <section className="desk-chart" aria-labelledby="desk-fraud-heading">
          <h2 id="desk-fraud-heading">Fraud signal overview</h2>
          <p>Flagged transactions · last 6 months</p>
          <AnalyticsChart
            points={data.trend}
            kind="area"
            valueLabel="Flagged transactions · last 6 months"
          />
        </section>
        <section className="desk-regions" aria-labelledby="desk-region-heading">
          <h2 id="desk-region-heading">Regional concentration</h2>
          <p>Flagged transactions by branch region.</p>
          {data.regions.length ? (
            <ul>
              {data.regions.map((region) => (
                <li key={region.name}>
                  <span>{region.name}</span>
                  <i style={{ width: `${Math.max(6, (region.value / regionMax) * 100)}%` }} />
                  <b>{region.value.toLocaleString()}</b>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No regional flags in this snapshot.</p>
          )}
        </section>
      </div>
      <section className="desk-signals" aria-labelledby="desk-radar-heading">
        <div className="desk-section-head">
          <h2 id="desk-radar-heading">
            Risk radar
            <span>{String(data.risks.length).padStart(2, "0")}</span>
          </h2>
          <button type="button" onClick={onRadar}>
            Explore all risk signals
          </button>
        </div>
        {!data.risks.length && (
          <p className="muted">
            All caught up — every signal is dismissed locally. Use “Explore all risk signals” to
            restore them.
          </p>
        )}
        <ol>
          {data.risks.map((risk, index) => (
            <li key={risk.id}>
              <button type="button" disabled={!canAnalyze} onClick={() => onInvestigate(risk.id)}>
                <span className="desk-index">{String(index + 1).padStart(2, "0")}</span>
                <span className={`desk-sev sev-${risk.severity}`}>{risk.severity}</span>
                <span className="desk-signal-copy">
                  <strong>{risk.title}</strong>
                  <small>{risk.summary}</small>
                </span>
                <span className="desk-signal-meta">{risk.metric}</span>
              </button>
            </li>
          ))}
        </ol>
      </section>
      <section className="desk-recent" aria-labelledby="desk-recent-heading">
        <h2 id="desk-recent-heading">Recent investigations</h2>
        {!data.recent.length && (
          <p className="muted">Open a risk signal to start your first saved investigation.</p>
        )}
        <ul>
          {data.recent.map((item) => (
            <li key={item.investigationId ?? item.id}>
              <button type="button" onClick={() => onInvestigate(item.investigationId ?? item.id)}>
                <strong>{item.title}</strong>
                <span>{item.status}</span>
                <time>{item.time}</time>
              </button>
            </li>
          ))}
        </ul>
      </section>
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
