"use client";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Clock3,
  RotateCcw,
  Search,
  ShieldCheck,
} from "lucide-react";
import {
  getDetectionView,
  getRiskDispositions,
  runDetection,
  updateRiskDisposition,
} from "@/features/risk/api";
import { getStaffIdentity } from "@/shared/api/client";
import type { DatasetId, DatasetInfo, QueryContext } from "@/shared/types/scope";
import type { RiskEvent } from "@/features/risk/types";
import type { DetectionView } from "@/features/risk/types/detection";
import { RiskCard } from "@/features/risk/components/risk-card";
import { Badge, Button, EmptyState } from "@/shared/ui/primitives";

const monthName = (period: string) =>
  new Date(period + "-01T00:00:00Z").toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
const count = (value: number) => value.toLocaleString("en-GB");
function savedScope(datasets: DatasetInfo[], datasetId: DatasetId, period: string) {
  try {
    const saved = JSON.parse(sessionStorage.getItem("bankweave-radar-scope") ?? "null");
    const dataset = datasets.find((item) => item.id === saved?.datasetId);
    if (dataset?.periods.includes(saved?.period))
      return { datasetId: dataset.id, period: saved.period as string };
  } catch {
    /* Keep Radar usable when browser storage is unavailable. */
  }
  return { datasetId, period };
}

export function Radar({
  datasets,
  initialDataset,
  initialPeriod,
  onInvestigate,
  onEvidence,
  onRefresh,
  onNotice,
}: {
  datasets: DatasetInfo[];
  initialDataset: DatasetId;
  initialPeriod: string;
  onInvestigate: (id: string, scope?: QueryContext) => void;
  onEvidence: (risk: RiskEvent) => void;
  onRefresh: () => void;
  onNotice: (message: string) => void;
}) {
  const [datasetId, setDatasetId] = useState(
    () => savedScope(datasets, initialDataset, initialPeriod).datasetId
  );
  const [period, setPeriod] = useState(
    () => savedScope(datasets, initialDataset, initialPeriod).period
  );
  const [view, setView] = useState<DetectionView>();
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [canRun, setCanRun] = useState(false);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("All signals");
  const [query, setQuery] = useState("");
  const [reload, setReload] = useState(0);
  const revision = useRef(0);
  const selectedDataset = datasets.find((dataset) => dataset.id === datasetId);
  const scope = { datasetId, period };
  useEffect(() => {
    if (!selectedDataset?.periods.includes(period)) return;
    try {
      sessionStorage.setItem("bankweave-radar-scope", JSON.stringify({ datasetId, period }));
    } catch {
      /* The current page retains its scope without browser storage. */
    }
  }, [datasetId, period, selectedDataset]);

  useEffect(() => {
    let active = true;
    void getStaffIdentity()
      .then((identity) => {
        if (active) setCanRun(identity.permissions.includes("analyze"));
      })
      .catch(() => {
        if (active) setError("Staff permissions could not be loaded. Reload to start a task.");
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const current = ++revision.current;
    setLoading(true);
    setError("");
    setNotice("");
    setView(undefined);
    setDismissed([]);
    void Promise.all([
      getDetectionView({ datasetId, period }),
      getRiskDispositions({ datasetId, period }),
    ])
      .then(([snapshot, dispositions]) => {
        if (current !== revision.current) return;
        setView(snapshot);
        setDismissed(dispositions.dismissed);
      })
      .catch((error) => {
        if (current === revision.current)
          setError(error instanceof Error ? error.message : "Risk signals could not be loaded.");
      })
      .finally(() => {
        if (current === revision.current) setLoading(false);
      });
    return () => {
      revision.current++;
    };
  }, [datasetId, period, reload]);

  async function detect() {
    const current = revision.current;
    setRunning(true);
    setError("");
    setNotice("");
    try {
      const result = await runDetection(scope);
      const refreshed = await getDetectionView(scope);
      if (current !== revision.current) return;
      setView(refreshed);
      setNotice(
        (result.replayed ? "Existing snapshot reused" : "Detection completed") +
          " · " +
          result.events.length +
          " signals · " +
          result.id
      );
      onRefresh();
    } catch (error) {
      if (current === revision.current)
        setError(error instanceof Error ? error.message : "Detection failed.");
    } finally {
      if (current === revision.current) setRunning(false);
    }
  }
  async function disposition(action: "dismiss" | "restore", id?: string) {
    const current = revision.current;
    setSaving(true);
    setError("");
    try {
      const result = await updateRiskDisposition(action, id, scope);
      if (current !== revision.current) return;
      setDismissed(result.dismissed);
      onNotice(action === "dismiss" ? "Risk dismissal saved." : "Risk signals reopened.");
      onRefresh();
    } catch (error) {
      if (current === revision.current)
        setError(error instanceof Error ? error.message : "The review could not be saved.");
    } finally {
      if (current === revision.current) setSaving(false);
    }
  }

  const events = view?.snapshot?.events ?? [];
  const open = events.filter((risk) => !dismissed.includes(risk.id));
  const visible = events.filter((risk) => {
    if (filter === "Dismissed" ? !dismissed.includes(risk.id) : dismissed.includes(risk.id))
      return false;
    if (filter === "High severity" && risk.severity !== "high") return false;
    if (filter === "Credit risk" && risk.category !== "loans") return false;
    if (filter === "Transaction risk" && risk.category !== "fraud") return false;
    return (risk.title + " " + risk.id + " " + risk.summary)
      .toLowerCase()
      .includes(query.trim().toLowerCase());
  });
  visible.sort(
    (a, b) =>
      ["high", "medium", "low"].indexOf(a.severity) - ["high", "medium", "low"].indexOf(b.severity)
  );
  const locked = running || saving || loading;
  const reviewLocked = locked || !canRun || Boolean(view?.stale);
  const snapshot = view?.snapshot;
  return (
    <div className="radar-page animate-in">
      <div className="page-heading">
        <div>
          <span className="radar-eyebrow">
            <Activity size={14} /> DETECT · REVIEW · INVESTIGATE
          </span>
          <h1>Risk Radar</h1>
          <p>Explainable signals, with the source evidence to decide what needs attention.</p>
        </div>
        <div className="page-actions">
          {canRun && (
            <Button
              variant="primary"
              disabled={locked || !selectedDataset}
              onClick={() => void detect()}
            >
              <Activity size={15} />
              {running ? "Running detection…" : "Run detection"}
            </Button>
          )}
        </div>
      </div>

      <section className="radar-scope" aria-label="Detection scope">
        <label>
          Dataset
          <select
            aria-label="Risk dataset"
            value={datasetId}
            disabled={locked || !datasets.length}
            onChange={(event) => {
              const id = event.target.value as DatasetId;
              const dataset = datasets.find((dataset) => dataset.id === id);
              if (!dataset?.periods.length) return;
              setDatasetId(id);
              setPeriod(dataset.periods.at(-1)!);
              setFilter("All signals");
              setQuery("");
            }}
          >
            {datasets.map((dataset) => (
              <option key={dataset.id} value={dataset.id}>
                {dataset.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Source month
          <select
            aria-label="Risk snapshot month"
            value={period}
            disabled={locked || !selectedDataset}
            onChange={(event) => {
              setPeriod(event.target.value);
              setFilter("All signals");
            }}
          >
            {selectedDataset?.periods.map((month) => (
              <option key={month} value={month}>
                {monthName(month)}
              </option>
            ))}
          </select>
        </label>
        <div className="radar-method">
          <span>Detection method</span>
          <strong>
            <ShieldCheck size={15} /> Recorded rules
          </strong>
          <small>Database checks · 0 model calls</small>
        </div>
      </section>

      {error && (
        <p className="radar-notice" role="alert">
          {error}
          <Button variant="ghost" onClick={() => setReload((value) => value + 1)} disabled={locked}>
            Retry loading
          </Button>
        </p>
      )}
      {notice && (
        <p className="radar-notice" role="status">
          <CheckCircle2 size={16} />
          {notice}
        </p>
      )}
      {loading && (
        <p className="radar-notice" role="status">
          Loading the recorded snapshot…
        </p>
      )}
      {view?.stale && (
        <p className="radar-notice" role="status">
          Source data or rules changed since this run.{" "}
          {canRun
            ? "Run detection to refresh the evidence before investigating."
            : "Ask an Analyst to refresh detection."}
        </p>
      )}

      <div className="radar-overview" aria-label="Signal summary">
        <div>
          <span>Open signals</span>
          <strong>{loading ? "—" : open.length}</strong>
          <small>Awaiting staff review</small>
        </div>
        <div>
          <span>High severity</span>
          <strong>{loading ? "—" : open.filter((risk) => risk.severity === "high").length}</strong>
          <small>Review these first</small>
        </div>
        <div>
          <span>Dismissed</span>
          <strong>
            {loading ? "—" : events.filter((risk) => dismissed.includes(risk.id)).length}
          </strong>
          <small>Saved in this workspace</small>
        </div>
      </div>

      <div className="radar-section-heading">
        <div>
          <h2>Review queue</h2>
          <p>
            {monthName(period)} · {selectedDataset?.name ?? "Bank data"}
          </p>
        </div>
        {dismissed.length > 0 && (
          <Button disabled={!canRun || locked} onClick={() => void disposition("restore")}>
            <RotateCcw size={14} /> Restore dismissed
          </Button>
        )}
      </div>
      <div className="radar-queue-controls">
        <div className="filter-tabs" role="group" aria-label="Filter risk events">
          {["All signals", "High severity", "Transaction risk", "Credit risk", "Dismissed"].map(
            (name) => (
              <button
                key={name}
                className={filter === name ? "active" : ""}
                aria-pressed={filter === name}
                onClick={() => setFilter(name)}
              >
                {name}
              </button>
            )
          )}
        </div>
        <label className="radar-search">
          <Search size={15} />
          <input
            aria-label="Search risk signals"
            placeholder="Search signals…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      {!loading &&
        !error &&
        (visible.length ? (
          <div className="risk-grid">
            {visible.map((risk) => (
              <RiskCard
                key={risk.id}
                risk={risk}
                onInvestigate={() => onInvestigate(risk.id, risk.detection?.scope)}
                onEvidence={(event) =>
                  onEvidence({
                    ...event,
                    detection: event.detection
                      ? { ...event.detection, stale: view?.stale }
                      : undefined,
                  })
                }
                onDismiss={
                  canRun && filter !== "Dismissed"
                    ? (id) => void disposition("dismiss", id)
                    : undefined
                }
                disabled={reviewLocked || filter === "Dismissed"}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title={
              !snapshot
                ? "No detection run for this month"
                : events.length
                  ? "No signals in this view"
                  : "No rules matched this snapshot"
            }
            text={
              !snapshot
                ? "Run detection to check the available source data. No run does not mean no risk."
                : events.length
                  ? "Try another filter, search, or restore dismissed signals."
                  : "Review the detection checks and source coverage below. Unavailable comparisons are shown separately."
            }
          />
        ))}

      {view && (
        <section className="radar-methodology" aria-labelledby="radar-method-heading">
          <div className="radar-section-heading">
            <div>
              <h2 id="radar-method-heading">How this snapshot was checked</h2>
              <p>Published demo checks: monthly growth and dated overdue-principal review.</p>
            </div>
            <Badge>{view.rulesVersion}</Badge>
          </div>
          <p className="radar-baseline">
            <Clock3 size={14} /> {monthName(period)} <ArrowRight size={14} /> Baseline:{" "}
            {monthName(view.baselinePeriod)}
            {!view.baselineAvailable && " · Unavailable"}
          </p>
          {snapshot?.checks.length ? (
            <div className="radar-checks">
              {snapshot.checks.map((check) => (
                <article key={check.id} className={"radar-check check-" + check.status}>
                  <div>
                    <h3>{check.name}</h3>
                    <Badge tone={check.status === "matched" ? "high" : "muted"}>
                      {check.status === "matched"
                        ? "Signal found"
                        : check.status === "insufficient"
                          ? "Insufficient data"
                          : "No match"}
                    </Badge>
                  </div>
                  <p>{check.reason}</p>
                  <strong>
                    {check.baselineCount === null ? "No baseline" : count(check.baselineCount)}{" "}
                    <ArrowRight size={14} /> {count(check.currentCount)}{" "}
                    {check.threshold.recordUnit ?? "records"}
                  </strong>
                  <small>
                    {check.baselineRate === null
                      ? "Baseline rate unavailable"
                      : check.baselineRate.toFixed(2) + "% baseline rate"}{" "}
                    · {check.currentRate.toFixed(2)}% current rate
                  </small>
                  {check.asOf && (
                    <p>
                      As of {check.asOf} · {check.missingLoans ?? 0} loans without due observations
                      · {check.invalidLoans ?? 0} invalid loan ledgers · {check.orphanRecords ?? 0}{" "}
                      unlinked records
                    </p>
                  )}
                  <details>
                    <summary>Thresholds</summary>
                    <p>
                      At least {check.threshold.minCount} positive{" "}
                      {check.threshold.recordUnit ?? "records"}
                      {check.threshold.minDaysPastDue !== undefined &&
                        ` with at least ${check.threshold.minDaysPastDue} days past due and INR ${(check.threshold.minOverdueMinor! / 100).toLocaleString("en-IN")} unpaid principal. This point-in-time check does not require a previous month`}
                      {check.threshold.minIncreasePct !== null &&
                        ", " +
                          check.threshold.minIncreasePct +
                          "% count increase, " +
                          check.threshold.minRateIncreasePp +
                          " percentage-point rate increase, and " +
                          check.threshold.minBaselineCount +
                          " baseline positives"}
                      . These are demonstration thresholds.
                    </p>
                  </details>
                </article>
              ))}
            </div>
          ) : (
            <p className="radar-muted">
              {snapshot
                ? "This earlier run has no recorded check summary. Refresh detection to record all outcomes."
                : view.rules.length +
                  " rules are available for this dataset. A run records matches, non-matches and insufficient-data outcomes."}
            </p>
          )}
          <details className="radar-receipt">
            <summary>Source coverage & run receipt</summary>
            <dl>
              <div>
                <dt>Transaction coverage</dt>
                <dd>{count(view.coverage.transactions)} source records</dd>
              </div>
              <div>
                <dt>Missing account links</dt>
                <dd>{count(view.coverage.missingAccounts)}</dd>
              </div>
              <div>
                <dt>Complete customer chains</dt>
                <dd>{count(view.coverage.completeCustomerChains)}</dd>
              </div>
              {snapshot && (
                <>
                  <div>
                    <dt>Recorded at</dt>
                    <dd>{new Date(snapshot.createdAt).toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>Run</dt>
                    <dd>{snapshot.id}</dd>
                  </div>
                  <div>
                    <dt>Input SHA-256</dt>
                    <dd>{snapshot.inputHash}</dd>
                  </div>
                  <div>
                    <dt>Source version</dt>
                    <dd>{snapshot.sourceVersion}</dd>
                  </div>
                </>
              )}
            </dl>
            <ul>
              {view.limitations.map((limitation) => (
                <li key={limitation}>{limitation}</li>
              ))}
            </ul>
          </details>
        </section>
      )}
      <p className="risk-footnote">
        <ShieldCheck size={14} /> Historical source snapshots · No live monitoring or trained
        detection model. Signals require human review; flagged values and loan principal are not
        confirmed losses. Signals can overlap.
      </p>
    </div>
  );
}
