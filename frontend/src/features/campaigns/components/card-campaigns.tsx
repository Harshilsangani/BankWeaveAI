"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Download,
  CreditCard,
  RefreshCw,
  Loader2,
  CheckCircle2,
  X,
} from "lucide-react";
import { Badge, Button, EmptyState } from "@/shared/ui/primitives";
import { Dialog } from "@/shared/ui/dialog";
import { ChartCard } from "@/shared/analytics/blocks";
import { CampaignEmailDelivery } from "@/features/campaigns/components/campaign-email";
import { randomId } from "@/shared/lib/random-id";
import type { StaffIdentity } from "@/shared/api/client";
import {
  getCampaignReadiness,
  getCardProducts,
  getCardCampaigns,
  getCardCampaign,
  createCardCampaign,
  startCampaignRun,
  getCampaignRun,
  cancelCampaignRun,
  getCampaignCandidates,
  getCampaignReport,
  reviewCampaignReport,
  downloadCampaignReport,
  setCampaignSchedule,
  addCardProductVersion,
} from "@/features/campaigns/api";
import type {
  CampaignReadiness,
  CardProduct,
  CardCampaign,
  CampaignRun,
  CampaignReport,
  CampaignCandidate,
  CandidatePage,
} from "@/features/campaigns/types";
import {
  CampaignMetrics,
  campaignLabel,
  campaignMoney,
} from "@/features/campaigns/components/campaign-reports";
const activeStatuses = new Set([
  "queued",
  "validating",
  "building_features",
  "matching",
  "drafting",
  "reporting",
]);
const steps = ["validating", "building_features", "matching", "drafting", "reporting", "ready"];

export function CardCampaigns({
  identity,
  reportId,
  onReport,
  onBack,
}: {
  identity?: StaffIdentity;
  reportId?: string;
  onReport: (id: string) => void;
  onBack: () => void;
}) {
  const [period, setPeriod] = useState("2026-10");
  const [dataset, setDataset] = useState("meridian");
  const [readiness, setReadiness] = useState<CampaignReadiness>();
  const [products, setProducts] = useState<CardProduct[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [campaigns, setCampaigns] = useState<CardCampaign[]>([]);
  const [campaign, setCampaign] = useState<CardCampaign>();
  const [run, setRun] = useState<CampaignRun>();
  const [report, setReport] = useState<CampaignReport>();
  const [tab, setTab] = useState("overview");
  const [candidateStatus, setCandidateStatus] = useState("all");
  const [candidatePage, setCandidatePage] = useState<CandidatePage>();
  const [candidateOffset, setCandidateOffset] = useState(0);
  const [selectedCandidate, setSelectedCandidate] = useState<CampaignCandidate>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [note, setNote] = useState("");
  const [editingProduct, setEditingProduct] = useState<CardProduct>();
  const [catalogVersion, setCatalogVersion] = useState("demo-v2");
  const submitting = useRef(false);
  const loadSequence = useRef(0);
  const canRun = identity?.permissions.includes("campaign_run") ?? false;
  const canDetails = identity?.permissions.includes("campaign_read") ?? false;
  const canAdmin = identity?.permissions.includes("campaign_admin") ?? false;

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    try {
      const [ready, catalog, history] = await Promise.all([
        getCampaignReadiness(period, dataset),
        dataset === "meridian" ? getCardProducts(period) : Promise.resolve([]),
        getCardCampaigns(),
      ]);
      if (sequence !== loadSequence.current) return;
      setReadiness(ready);
      setProducts(catalog);
      setCampaigns(history);
    } catch (cause) {
      if (sequence !== loadSequence.current) return;
      setError(
        cause instanceof Error ? cause.message : "Campaign information could not be loaded."
      );
    }
  }, [period, dataset]);
  useEffect(() => {
    setReadiness(undefined);
    setError("");
    void load();
  }, [load]);
  useEffect(() => {
    let current = true;
    if (reportId) {
      setReport(undefined);
      void getCampaignReport(reportId)
        .then((value) => {
          if (current) {
            setReport(value);
            setTab("report");
          }
        })
        .catch((cause) => {
          if (current)
            setError(cause instanceof Error ? cause.message : "Report could not be loaded.");
        });
    } else setReport(undefined);
    return () => {
      current = false;
    };
  }, [reportId]);
  useEffect(() => {
    const fromHash = () => {
      const parameters = new URLSearchParams(window.location.hash.split("?")[1] ?? "");
      const id = parameters.get("campaign");
      if (!id) return;
      void getCardCampaign(id)
        .then((saved) => {
          setCampaign(saved);
          setPeriod(saved.configuration.period);
          setDataset(saved.configuration.datasetId);
          const selected =
            saved.runs?.find((item) => item.id === parameters.get("run")) ?? saved.runs?.[0];
          setRun(selected);
          setTab("overview");
          if (selected?.reportId) onReport(selected.reportId);
        })
        .catch((cause) =>
          setError(cause instanceof Error ? cause.message : "Campaign could not be reopened.")
        );
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [onReport]);
  useEffect(() => {
    if (!run || !activeStatuses.has(run.status)) return;
    let current = true;
    const tick = async () => {
      try {
        const next = await getCampaignRun(run.campaignId, run.id);
        if (!current) return;
        setRun(next);
        if (next.status === "ready" && next.reportId) {
          window.dispatchEvent(new Event("bankweave-campaign-ready"));
          setNotice("Your employee report is ready in Command Center, Reports, and notifications.");
          onReport(next.reportId);
          void load();
        }
      } catch (cause) {
        if (current)
          setError(
            cause instanceof Error
              ? cause.message
              : "Run status unavailable. Reopen the campaign to recover its saved progress."
          );
      }
    };
    const timer = setInterval(() => void tick(), 1500);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [run?.id, run?.status, onReport, load]);
  const activeCampaign = report?.campaignId ?? run?.campaignId;
  const activeRun = report?.runId ?? run?.id;
  useEffect(() => {
    if (!canDetails || !activeCampaign || !activeRun || !["prospects", "drafts"].includes(tab))
      return;
    let current = true;
    setCandidatePage(undefined);
    void getCampaignCandidates(
      activeCampaign,
      activeRun,
      tab === "drafts" ? "prospect" : candidateStatus,
      candidateOffset
    )
      .then((value) => {
        if (current) setCandidatePage(value);
      })
      .catch((cause) => {
        if (current)
          setError(cause instanceof Error ? cause.message : "Prospects could not be loaded.");
      });
    return () => {
      current = false;
    };
  }, [canDetails, activeCampaign, activeRun, tab, candidateStatus, candidateOffset]);

  async function prepare() {
    if (!readiness?.ready || !readiness.batch || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const created = await createCardCampaign({
        requestId: randomId(),
        title: `${period} card campaign`,
        datasetId: dataset,
        period,
        batchId: readiness.batch.id,
        productIds: selectedProducts,
        sampleRewrites: 0,
      });
      setCampaign(created);
      const accepted = await startCampaignRun(created.id, randomId());
      setRun(accepted);
      setTab("overview");
      void load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Report preparation could not start.");
    } finally {
      setBusy(false);
      submitting.current = false;
    }
  }
  async function openCampaign(id: string) {
    setError("");
    try {
      const saved = await getCardCampaign(id);
      setCampaign(saved);
      setPeriod(saved.configuration.period);
      setDataset(saved.configuration.datasetId);
      const latest = saved.runs?.[0];
      setRun(latest);
      if (latest?.reportId) onReport(latest.reportId);
      else {
        onBack();
        setTab("overview");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Campaign could not be reopened.");
    }
  }
  async function review(decision: string) {
    if (!report) return;
    setBusy(true);
    setError("");
    try {
      const result = await reviewCampaignReport(report.id, {
        revision: report.reviewRevision,
        contentHash: report.contentHash,
        decision,
        note,
      });
      setReport(result);
      setNote("");
      setNotice(
        decision === "changes_requested"
          ? "Changes requested. A new campaign revision is available; the saved report is preserved."
          : "Review decision saved. No customer message was sent."
      );
      window.dispatchEvent(new Event("bankweave-campaign-ready"));
      void load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Review could not be saved.");
    } finally {
      setBusy(false);
    }
  }
  async function rerun(id: string) {
    setBusy(true);
    setError("");
    try {
      const accepted = await startCampaignRun(id, randomId());
      onBack();
      setRun(accepted);
      setTab("overview");
      if (accepted.reportId) onReport(accepted.reportId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "A revised run could not start.");
    } finally {
      setBusy(false);
    }
  }
  const counts = report?.counts ?? run?.counts;
  const pending = run && activeStatuses.has(run.status);
  return (
    <div className="campaign-page animate-in">
      <div className="page-heading">
        <div>
          <div className="eyebrow">EMPLOYEE CAMPAIGN WORKSPACE</div>
          <h1>Card Campaigns</h1>
          <p>Find potential card prospects, prepare drafts, and deliver an employee report.</p>
        </div>
        <div className="page-actions">
          <Badge>Synthetic demo</Badge>
          {reportId && (
            <Button
              onClick={() => {
                onBack();
                setTab("overview");
              }}
            >
              <ArrowLeft size={14} />
              Campaign workspace
            </Button>
          )}
          <Button onClick={() => void load()} aria-label="Refresh campaigns">
            <RefreshCw size={15} />
            Refresh
          </Button>
        </div>
      </div>
      {error && (
        <div className="error-banner" role="alert">
          {error}
          <button aria-label="Dismiss campaign error" onClick={() => setError("")}>
            <X size={14} />
          </button>
        </div>
      )}
      {notice && (
        <p className="campaign-success" role="status">
          <CheckCircle2 size={16} />
          {notice}
        </p>
      )}
      {!reportId && (
        <section className="panel campaign-setup">
          <div className="campaign-section-heading">
            <div>
              <h2>Prepare an employee report</h2>
              <p>Use a completed data window and reviewed demo products.</p>
            </div>
            {canAdmin && products.length > 0 ? (
              <Button
                onClick={() => {
                  setEditingProduct(products[0]);
                  setCatalogVersion("demo-v2");
                }}
              >
                Manage demo catalog
              </Button>
            ) : (
              <CreditCard className="campaign-setup-icon" size={25} aria-hidden="true" />
            )}
          </div>
          <div className="campaign-form-row">
            <label>
              Customer dataset
              <select
                aria-label="Campaign dataset"
                value={dataset}
                onChange={(event) => setDataset(event.target.value)}
                disabled={busy || !!pending}
              >
                <option value="meridian">Meridian demo · INR</option>
                <option value="bankshield">BankShield public sample · USD</option>
              </select>
            </label>
          </div>
          <div
            className={`campaign-data-status ${readiness?.ready ? "is-ready" : ""}`}
            role="status"
          >
            <Badge>
              {readiness?.ready ? "Data ready" : readiness ? "Missing coverage" : "Checking inputs"}
            </Badge>
            <span>
              {readiness?.batch
                ? `${readiness.batch.cohortSize.toLocaleString("en-IN")} existing customers · ${readiness.batch.windowStart} to ${readiness.cutoff}`
                : (readiness?.reason ?? "Checking the linked customer evidence…")}
            </span>
          </div>
          {readiness?.batch && (
            <p className="campaign-subtle">
              {readiness.batch.reusedPeriods.length} months of recorded synthetic history +{" "}
              {readiness.batch.generatedPeriods.length} generated extension months. Card screening
              and marketing consent are checked separately.
            </p>
          )}
          <fieldset className="campaign-product-grid">
            <legend>
              Products to consider{" "}
              <small>Leave all unchecked to compare the active demo catalog.</small>
            </legend>
            {products.map((product) => (
              <label className="campaign-product-choice" key={`${product.id}-${product.version}`}>
                <input
                  type="checkbox"
                  aria-label={`Include ${product.name}`}
                  checked={selectedProducts.includes(product.id)}
                  disabled={
                    busy ||
                    !!pending ||
                    (selectedProducts.length >= 3 && !selectedProducts.includes(product.id))
                  }
                  onChange={(event) =>
                    setSelectedProducts((current) =>
                      event.target.checked
                        ? [...current, product.id]
                        : current.filter((id) => id !== product.id)
                    )
                  }
                />
                <span>
                  <strong>{product.name}</strong>
                  <small>
                    Annual fee {campaignMoney(product.annualFeeMinor)} · {product.version}
                  </small>
                  <small>{Object.values(product.benefits)[0]}</small>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="campaign-prepare-row">
            <p>
              {canRun
                ? "The report is assigned to you and an Admin reviewer in this demo. Drafts stay inside the workspace."
                : "Viewers can read assigned summaries. An Analyst or Admin prepares campaign reports."}
            </p>
            <Button
              variant="primary"
              onClick={() => void prepare()}
              disabled={!canRun || !readiness?.ready || busy || !!pending}
            >
              {busy ? <Loader2 size={15} className="spin" /> : <ArrowUpRight size={15} />}Prepare
              employee report
            </Button>
          </div>
        </section>
      )}
      {pending && (
        <section className="panel campaign-progress" aria-label="Campaign progress">
          <div className="campaign-section-heading">
            <div>
              <h2>
                <Loader2 size={17} className="spin" />
                Preparing employee report
              </h2>
              <p>
                {run.status === "queued"
                  ? "Queued for the campaign worker. You can leave this page and reopen the run."
                  : campaignLabel(run.status)}
              </p>
            </div>
            <Button
              onClick={() =>
                void cancelCampaignRun(run.campaignId, run.id)
                  .then(setRun)
                  .catch((cause) => setError(cause.message))
              }
              disabled={run.cancelRequested}
            >
              {run.cancelRequested ? "Cancellation requested" : "Cancel preparation"}
            </Button>
          </div>
          <ol className="campaign-steps">
            {steps.map((step, index) => (
              <li className={index <= steps.indexOf(run.status) ? "reached" : ""} key={step}>
                {campaignLabel(step)}
              </li>
            ))}
          </ol>
        </section>
      )}
      {run?.status === "failed" && (
        <div className="error-banner" role="alert">
          {run.error ||
            "The campaign failed before publication. Open run history and correct the inputs."}
        </div>
      )}
      {run?.status === "cancelled" && (
        <p className="campaign-subtle" role="status">
          Preparation cancelled. No employee report or customer message was published.
        </p>
      )}
      {counts && <CampaignMetrics counts={counts} />}
      {(run || report || campaigns.length > 0) && (
        <div className="filter-tabs campaign-tabs" role="group" aria-label="Campaign view">
          {[
            ["overview", "Overview"],
            ["prospects", "Prospects"],
            ["drafts", "Email drafts"],
            ["report", "Employee report"],
            ["history", "Run history"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={tab === value ? "active" : ""}
              aria-pressed={tab === value}
              disabled={
                (["prospects", "drafts"].includes(value) && (!canDetails || !activeRun)) ||
                (value === "report" && !report && !run?.reportId)
              }
              onClick={() => {
                setTab(value);
                setCandidateOffset(0);
                if (value === "report" && run?.reportId && !report) onReport(run.reportId);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {tab === "overview" && counts && (
        <div className="campaign-overview-grid">
          <section className="panel campaign-exclusions">
            <h2>What needs attention</h2>
            <dl>
              <div>
                <dt>Insufficient data</dt>
                <dd>{counts.insufficientData.toLocaleString("en-IN")}</dd>
              </div>
              <div>
                <dt>No matching offer</dt>
                <dd>{counts.noMatch.toLocaleString("en-IN")}</dd>
              </div>
              <div>
                <dt>Contact suppressed</dt>
                <dd>{counts.suppressed.toLocaleString("en-IN")}</dd>
              </div>
              <div>
                <dt>Customer emails sent</dt>
                <dd>{counts.emailsSent}</dd>
              </div>
            </dl>
            <p>
              Potential prospects require staff review. Product matching does not approve a card.
            </p>
          </section>
          {report && (
            <ChartCard
              title="Recommended product distribution"
              subtitle="One primary product per potential prospect"
              tone="research"
              kind="donut"
              points={report.products.map((product) => ({
                name: product.name,
                value: product.prospects,
              }))}
            />
          )}
        </div>
      )}
      {["prospects", "drafts"].includes(tab) && activeRun && (
        <section className="panel campaign-candidates">
          <div className="campaign-section-heading">
            <div>
              <h2>{tab === "drafts" ? "Drafts for staff review" : "Customer screening results"}</h2>
              <p>
                {candidatePage
                  ? `${candidatePage.total.toLocaleString("en-IN")} results`
                  : "Loading results…"}
              </p>
            </div>
            {tab === "prospects" && (
              <label>
                Screening status
                <select
                  aria-label="Campaign prospect status"
                  value={candidateStatus}
                  onChange={(event) => {
                    setCandidateStatus(event.target.value);
                    setCandidateOffset(0);
                  }}
                >
                  <option value="all">All customers</option>
                  <option value="prospect">Potential prospects</option>
                  <option value="no_match">No match</option>
                  <option value="insufficient_data">Insufficient data</option>
                </select>
              </label>
            )}
          </div>
          <div className="table-scroll" tabIndex={0}>
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Result</th>
                  <th>Card</th>
                  <th>Contact permission</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {candidatePage?.rows.map((item) => (
                  <tr key={item.customerId}>
                    <td>
                      <strong>{item.name}</strong>
                      <small>{item.customerId}</small>
                    </td>
                    <td>
                      {item.status === "prospect"
                        ? "Potential prospect"
                        : campaignLabel(item.status)}
                    </td>
                    <td>
                      {products.find((product) => product.id === item.productId)?.name ??
                        item.productId ??
                        "—"}
                    </td>
                    <td>
                      {item.currentContactStatus === "allowed"
                        ? "Recorded email consent"
                        : campaignLabel(item.currentContactReason)}
                    </td>
                    <td>
                      <Button onClick={() => setSelectedCandidate(item)}>
                        {tab === "drafts" && item.draft ? "Read email draft" : "Review evidence"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {candidatePage && !candidatePage.rows.length && (
            <EmptyState
              title="No customers match this filter"
              text="Choose another screening status to browse the report."
            />
          )}
          <div className="campaign-pagination">
            <Button
              disabled={!candidateOffset}
              onClick={() => setCandidateOffset((value) => Math.max(0, value - 20))}
            >
              Previous results
            </Button>
            <span>
              {candidatePage?.total
                ? `${candidateOffset + 1}–${candidateOffset + candidatePage.rows.length} of ${candidatePage.total}`
                : "0 results"}
            </span>
            <Button
              disabled={candidatePage?.nextOffset == null}
              onClick={() => setCandidateOffset(candidatePage?.nextOffset ?? 0)}
            >
              Next results
            </Button>
          </div>
        </section>
      )}
      {tab === "report" &&
        (report ? (
          <section className="panel campaign-report-detail">
            <div className="campaign-section-heading">
              <div>
                <h2>{report.title}</h2>
                <p>
                  {report.period} campaign · Data through {report.cutoff} · Revision{" "}
                  {report.campaignRevision}
                </p>
              </div>
              <Badge>{campaignLabel(report.reviewStatus)}</Badge>
            </div>
            {report.warnings.map((warning) => (
              <p className="campaign-subtle" key={warning}>
                {warning}
              </p>
            ))}
            <div className="campaign-overview-grid">
              <ChartCard
                title="Recommended product distribution"
                subtitle="Potential prospects by selected card"
                tone="research"
                kind="donut"
                points={report.products.map((product) => ({
                  name: product.name,
                  value: product.prospects,
                }))}
              />
              <section className="campaign-exclusions">
                <h3>Screening and contact exclusions</h3>
                <dl>
                  {report.exclusions.map((item) => (
                    <div key={item.reason}>
                      <dt>{campaignLabel(item.reason)}</dt>
                      <dd>{item.count.toLocaleString("en-IN")}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            </div>
            <p>
              Customer emails sent: <strong>{report.counts.emailsSent}</strong>. This report records
              potential offers and drafts for employee review.
            </p>
            <div className="page-actions">
              {canDetails && (
                <Button
                  onClick={() =>
                    void downloadCampaignReport(report.id).catch((cause) => setError(cause.message))
                  }
                >
                  <Download size={15} />
                  Download employee report
                </Button>
              )}
              <Button
                onClick={() => {
                  setTab("drafts");
                  setCandidateOffset(0);
                }}
                disabled={!canDetails}
              >
                Review email drafts
              </Button>
            </div>
            <details className="campaign-source-details">
              <summary>Source scope and limitations</summary>
              <p>
                {report.windowStart} to {report.cutoff} · Synthetic INR data
              </p>
              {report.limitations.map((limit) => (
                <p key={limit}>{limit}</p>
              ))}
              {report.source && (
                <>
                  <p>
                    Reused months: {report.source.reusedPeriods.join(", ")}. Generated months:{" "}
                    {report.source.generatedPeriods.join(", ")}.
                  </p>
                  <p>
                    Rules: {report.source.rulesVersion} · Templates: {report.source.templateVersion}
                  </p>
                </>
              )}
              <small>Report hash: {report.contentHash}</small>
            </details>
            {report.canReview && (
              <div className="campaign-review">
                <h3>Record your employee review</h3>
                <p>Reviewing this report does not send an email or approve a credit card.</p>
                <label>
                  Review note
                  <textarea
                    aria-label="Campaign review note"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    rows={3}
                    placeholder="Record what you reviewed or which changes are needed…"
                  />
                </label>
                <div className="page-actions">
                  <Button
                    variant="primary"
                    disabled={busy || note.trim().length < 5}
                    onClick={() => void review("reviewed")}
                  >
                    Mark reviewed
                  </Button>
                  <Button
                    disabled={busy || note.trim().length < 5}
                    onClick={() => void review("changes_requested")}
                  >
                    Request changes
                  </Button>
                  <Button
                    disabled={busy || note.trim().length < 5}
                    onClick={() => void review("rejected")}
                  >
                    Reject report
                  </Button>
                </div>
              </div>
            )}
            {!!report.reviewEvents?.length && (
              <div className="campaign-review-history">
                <h3>Review history</h3>
                {report.reviewEvents.map((event, index) => (
                  <p key={index}>
                    <strong>{campaignLabel(event.decision)}</strong> · {event.note}
                  </p>
                ))}
              </div>
            )}
            {report.canReview && <CampaignEmailDelivery report={report} />}
          </section>
        ) : (
          <p role="status">Loading the assigned employee report…</p>
        ))}
      {tab === "history" && (
        <section className="panel campaign-run-history">
          <h2>Saved campaigns and runs</h2>
          {campaigns.length ? (
            campaigns.map((saved) => (
              <div className="campaign-history-row" key={saved.id}>
                <div>
                  <strong>{saved.title}</strong>
                  <small>
                    {saved.configuration.period} · Revision {saved.revision} ·{" "}
                    {saved.scheduleEnabled ? "Monthly schedule enabled" : "Manual campaign"}
                  </small>
                  {saved.configuration.scheduleStatus && (
                    <p>{saved.configuration.scheduleStatus}</p>
                  )}
                </div>
                <div className="page-actions">
                  <Button onClick={() => void openCampaign(saved.id)}>Open campaign</Button>
                  {canRun && (
                    <Button onClick={() => void rerun(saved.id)} disabled={busy}>
                      Prepare current revision
                    </Button>
                  )}
                  {canAdmin && (
                    <Button
                      disabled={busy}
                      onClick={() => {
                        setBusy(true);
                        void setCampaignSchedule(saved.id, !saved.scheduleEnabled, saved.revision)
                          .then(() => load())
                          .catch((cause) => setError(cause.message))
                          .finally(() => setBusy(false));
                      }}
                    >
                      {saved.scheduleEnabled
                        ? "Disable monthly schedule"
                        : "Enable monthly schedule"}
                    </Button>
                  )}
                </div>
              </div>
            ))
          ) : (
            <EmptyState
              title="No saved campaigns yet"
              text="Prepare your first employee report to create a recoverable campaign run."
            />
          )}
          <p className="campaign-subtle">
            Monthly campaigns run at 09:00 IST using the prior completed month. Missing coverage
            pauses the schedule; no history is invented.
          </p>
          {campaign?.runs?.map((savedRun) => (
            <p key={savedRun.id}>
              {campaignLabel(savedRun.status)} · {savedRun.createdAt}{" "}
              {savedRun.reportId && (
                <Button onClick={() => onReport(savedRun.reportId!)}>Open saved report</Button>
              )}
            </p>
          ))}
        </section>
      )}
      <Dialog
        open={!!selectedCandidate}
        onOpenChange={(open) => {
          if (!open) setSelectedCandidate(undefined);
        }}
        title={selectedCandidate?.name ?? "Prospect evidence"}
        description="Recorded synthetic evidence for staff review; no credit decision or customer contact has occurred."
      >
        {selectedCandidate && (
          <>
            <Badge>
              {selectedCandidate.status === "prospect"
                ? "Potential prospect"
                : campaignLabel(selectedCandidate.status)}
            </Badge>
            <p className="campaign-subtle">
              {selectedCandidate.customerId} · Data through{" "}
              {selectedCandidate.evidence.features.cutoff}
            </p>
            <ul className="policy-sections">
              {selectedCandidate.evidence.reasons.map((reason) => (
                <li key={reason}>{campaignLabel(reason)}</li>
              ))}
            </ul>
            <dl className="campaign-evidence-facts">
              <div>
                <dt>Generated monthly income</dt>
                <dd>{campaignMoney(selectedCandidate.evidence.features.averageIncomeMinor)}</dd>
              </div>
              <div>
                <dt>Demo credit score</dt>
                <dd>{selectedCandidate.evidence.features.score ?? "Not supplied"}</dd>
              </div>
              <div>
                <dt>Demo debt ratio</dt>
                <dd>
                  {selectedCandidate.evidence.features.debtRatioBps == null
                    ? "Incomplete evidence"
                    : `${(selectedCandidate.evidence.features.debtRatioBps / 100).toFixed(1)}%`}
                </dd>
              </div>
              <div>
                <dt>Current contact permission</dt>
                <dd>{campaignLabel(selectedCandidate.currentContactReason)}</dd>
              </div>
            </dl>
            {selectedCandidate.draft ? (
              <div className="campaign-draft-preview">
                <h3>{selectedCandidate.draft.subject}</h3>
                <pre>{selectedCandidate.draft.body}</pre>
                <Badge>
                  {selectedCandidate.draft.provider === "vertex"
                    ? "AI template · Staff review required"
                    : "Local template · Staff review required"}
                </Badge>
                {canAdmin && report && (
                  <CampaignEmailDelivery
                    key={`${report.id}-${selectedCandidate.customerId}`}
                    report={report}
                    customerId={selectedCandidate.customerId}
                  />
                )}
              </div>
            ) : (
              <p>No contactable draft is available for this customer.</p>
            )}
          </>
        )}
      </Dialog>
      <Dialog
        open={!!editingProduct}
        onOpenChange={(open) => {
          if (!open) setEditingProduct(undefined);
        }}
        title="Publish a demo product version"
        description="Changes create a new immutable fictional catalog version. Existing campaign reports keep their original terms and rules."
      >
        {editingProduct && (
          <form
            className="customer-form"
            onSubmit={(event) => {
              event.preventDefault();
              setBusy(true);
              setError("");
              void addCardProductVersion({
                id: editingProduct.id,
                version: catalogVersion,
                name: editingProduct.name,
                category: editingProduct.category,
                effectiveOn: readiness?.cutoff ?? "2026-09-30",
                annualFeeMinor: editingProduct.annualFeeMinor,
                feeConditions: editingProduct.feeConditions,
                benefits: editingProduct.benefits,
                rules: editingProduct.rules,
              })
                .then(() => {
                  setEditingProduct(undefined);
                  setNotice(
                    "New demo product version published. Start a revised campaign to use it."
                  );
                  return load();
                })
                .catch((cause) =>
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : "Product version could not be published."
                  )
                )
                .finally(() => setBusy(false));
            }}
          >
            <label>
              Demo product
              <select
                aria-label="Demo catalog product"
                value={editingProduct.id}
                onChange={(event) =>
                  setEditingProduct(products.find((item) => item.id === event.target.value))
                }
              >
                {products.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              New version
              <input
                aria-label="New demo product version"
                value={catalogVersion}
                required
                pattern="[a-zA-Z0-9-]+"
                onChange={(event) => setCatalogVersion(event.target.value)}
              />
            </label>
            <label>
              Annual fee (INR)
              <input
                aria-label="Demo product annual fee"
                type="number"
                min="0"
                step="0.01"
                value={editingProduct.annualFeeMinor / 100}
                onChange={(event) =>
                  setEditingProduct({
                    ...editingProduct,
                    annualFeeMinor: Math.round(Number(event.target.value) * 100),
                  })
                }
              />
            </label>
            <label>
              Minimum generated monthly income (INR)
              <input
                aria-label="Demo product minimum income"
                type="number"
                min="0"
                step="1"
                value={editingProduct.rules.minIncomeMinor / 100}
                onChange={(event) =>
                  setEditingProduct({
                    ...editingProduct,
                    rules: {
                      ...editingProduct.rules,
                      minIncomeMinor: Math.round(Number(event.target.value) * 100),
                    },
                  })
                }
              />
            </label>
            <label>
              Minimum demo score (blank for secured starter)
              <input
                aria-label="Demo product minimum score"
                type="number"
                min="300"
                max="900"
                value={editingProduct.rules.minScore ?? ""}
                onChange={(event) =>
                  setEditingProduct({
                    ...editingProduct,
                    rules: {
                      ...editingProduct.rules,
                      minScore: event.target.value ? Number(event.target.value) : null,
                    },
                  })
                }
              />
            </label>
            <label>
              Maximum demo debt ratio (%)
              <input
                aria-label="Demo product maximum debt ratio"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={editingProduct.rules.maxDebtRatioBps / 100}
                onChange={(event) =>
                  setEditingProduct({
                    ...editingProduct,
                    rules: {
                      ...editingProduct.rules,
                      maxDebtRatioBps: Math.round(Number(event.target.value) * 100),
                    },
                  })
                }
              />
            </label>
            <label>
              Fee conditions
              <textarea
                aria-label="Demo product fee conditions"
                value={editingProduct.feeConditions}
                onChange={(event) =>
                  setEditingProduct({ ...editingProduct, feeConditions: event.target.value })
                }
                rows={3}
              />
            </label>
            <p className="campaign-subtle">
              These are fictional demonstration thresholds. Product benefits and separate customer
              application/consent requirements remain visible on each draft.
            </p>
            {error && <p role="alert">{error}</p>}
            <Button type="submit" variant="primary" disabled={busy}>
              Publish demo product version
            </Button>
          </form>
        )}
      </Dialog>
    </div>
  );
}
