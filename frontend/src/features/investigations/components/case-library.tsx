"use client";
import { useEffect, useState } from "react";
import { ArrowUpRight, FolderOpen, Search } from "lucide-react";
import { getInvestigationCases } from "@/features/investigations/api";
import type { CaseLibrary as LibraryData } from "@/features/investigations/types/cases";
import { caseTime, reviewerName } from "@/features/investigations/format";
import { scopeLabel } from "@/shared/lib/utils";
import { Badge, Button, EmptyState } from "@/shared/ui/primitives";

export function CaseLibrary({
  onOpen,
  onStart,
}: {
  onOpen: (id: string) => void;
  onStart: () => void;
}) {
  const [data, setData] = useState<LibraryData>();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [dataset, setDataset] = useState("");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const timer = setTimeout(
      () => {
        void getInvestigationCases({ q: query, status, datasetId: dataset, offset })
          .then((value) => {
            if (active) setData(value);
          })
          .catch((error) => {
            if (active)
              setError(error instanceof Error ? error.message : "Saved cases could not be loaded.");
          })
          .finally(() => {
            if (active) setLoading(false);
          });
      },
      query ? 250 : 0
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, status, dataset, offset, reload]);
  return (
    <div className="case-library animate-in">
      <div className="page-heading">
        <div>
          <span className="case-eyebrow">
            <FolderOpen size={14} /> FROM SIGNAL TO DECISION
          </span>
          <h1>Investigations</h1>
          <p>
            Review flagged activity, document your conclusion, and keep the evidence and report
            together.
          </p>
        </div>
        <Button variant="primary" onClick={onStart}>
          Find a signal to investigate <ArrowUpRight size={15} />
        </Button>
      </div>
      <section className="case-purpose" aria-label="How investigations work">
        <div className="case-purpose-intro">
          <h2>Turn a risk signal into a reviewed case</h2>
          <p>
            Risk Radar finds activity that needs attention. Investigations is where you check that
            activity and record a staff decision.
          </p>
        </div>
        <ol className="case-workflow">
          <li>
            <span>01</span>
            <div>
              <h3>Open a signal</h3>
              <p>Choose Investigate in Risk Radar. Its findings are saved as a case.</p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <h3>Check the evidence</h3>
              <p>Review the affected records, trends, and connections.</p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <h3>Decide & share</h3>
              <p>Save a review note and status, then create a report for your team.</p>
            </div>
          </li>
        </ol>
      </section>
      <div className="case-library-intro">
        <div>
          <h2>Saved cases</h2>
          <p>Reopen a case to continue its review or see the saved decision.</p>
        </div>
        <Badge>
          {loading
            ? "Loading…"
            : data
              ? data.total.toLocaleString() +
                (data.total === 1 ? " case in this view" : " cases in this view")
              : "Cases unavailable"}
        </Badge>
      </div>
      <div className="case-library-filters">
        <label className="case-search">
          <Search size={17} />
          <input
            aria-label="Search saved investigations"
            placeholder="Search case title, ID, or reviewer…"
            maxLength={200}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOffset(0);
            }}
          />
        </label>
        <label>
          Status
          <select
            aria-label="Filter cases by status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setOffset(0);
            }}
          >
            <option value="all">All statuses</option>
            <option>In review</option>
            <option>Monitoring</option>
            <option>Resolved</option>
          </select>
        </label>
        <label>
          Dataset
          <select
            aria-label="Filter cases by dataset"
            value={dataset}
            onChange={(event) => {
              setDataset(event.target.value);
              setOffset(0);
            }}
          >
            <option value="">All datasets</option>
            <option value="meridian">Meridian</option>
            <option value="bankshield">BankShield</option>
          </select>
        </label>
      </div>
      {error && (
        <div className="case-message" role="alert">
          {error}
          <Button onClick={() => setReload((value) => value + 1)}>Retry saved cases</Button>
        </div>
      )}
      {loading && (
        <p role="status" className="case-message">
          Loading saved investigations…
        </p>
      )}
      {!error && data && (
        <div className="case-library-list" aria-busy={loading}>
          {data.items.map((item) => (
            <article key={item.id} className="case-library-row">
              <span className={"case-row-icon severity-" + item.severity}>
                <FolderOpen size={20} />
              </span>
              <div className="case-row-main">
                <div>
                  <Badge tone={item.severity}>{item.severity} severity</Badge>
                  <span className="risk-id">{item.id}</span>
                </div>
                <h3>{item.title}</h3>
                <p>
                  {scopeLabel(item.scope)} · {item.affectedRecords.toLocaleString()} affected
                  records
                </p>
                <small>
                  {reviewerName(item.owner)} · Updated {caseTime(item.updatedAt)} ·{" "}
                  {item.reportCount} saved {item.reportCount === 1 ? "report" : "reports"}
                </small>
              </div>
              <div className="case-row-actions">
                <Badge>{item.status}</Badge>
                <Button
                  disabled={loading}
                  aria-label={"Open case " + item.id}
                  onClick={() => onOpen(item.id)}
                >
                  Open case <ArrowUpRight size={14} />
                </Button>
              </div>
            </article>
          ))}
          {!loading && !data.items.length && (
            <EmptyState
              icon={<FolderOpen size={26} />}
              title={
                query || status !== "all" || dataset
                  ? "No matching cases"
                  : "Your first case starts with a signal"
              }
              text={
                query || status !== "all" || dataset
                  ? "Try another search or clear the filters."
                  : "Open Risk Radar, inspect a signal, and choose Investigate. Your saved cases will appear here."
              }
            >
              {query || status !== "all" || dataset ? (
                <Button
                  onClick={() => {
                    setQuery("");
                    setStatus("all");
                    setDataset("");
                    setOffset(0);
                  }}
                >
                  Clear case filters
                </Button>
              ) : (
                <Button onClick={onStart}>Explore Risk Radar</Button>
              )}
            </EmptyState>
          )}
        </div>
      )}
      {data && data.total > data.limit && (
        <div className="evidence-pagination">
          <span>
            {data.offset + 1}–{Math.min(data.offset + data.items.length, data.total)} of{" "}
            {data.total} cases
          </span>
          <Button
            disabled={loading || data.offset === 0}
            onClick={() => setOffset(Math.max(0, data.offset - data.limit))}
          >
            Previous cases
          </Button>
          <Button
            disabled={loading || data.nextOffset === null}
            onClick={() => setOffset(data.nextOffset!)}
          >
            Next cases
          </Button>
        </div>
      )}
    </div>
  );
}
