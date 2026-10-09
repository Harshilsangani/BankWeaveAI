"use client";
import { Database, ShieldCheck } from "lucide-react";
import type { AnalysisMetadata, DatasetId, DatasetInfo } from "@/types";

export function DataControls({
  datasets,
  datasetId,
  period,
  busy,
  onDataset,
  onPeriod,
}: {
  datasets: DatasetInfo[];
  datasetId: DatasetId;
  period?: string;
  busy: boolean;
  onDataset: (id: DatasetId) => void;
  onPeriod: (period: string) => void;
}) {
  const selected = datasets.find((d) => d.id === datasetId);
  return (
    <div className="data-controls">
      <div className="dataset-selects">
        <Database size={15} className="text-accent" />
        <label>
          <span>Analysis dataset</span>
          <select
            aria-label="Analysis dataset"
            value={datasetId}
            disabled={busy || !datasets.length}
            onChange={(e) => onDataset(e.target.value as DatasetId)}
          >
            {!datasets.length && <option value="meridian">Loading datasets…</option>}
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Reporting month</span>
          <select
            aria-label="Reporting month"
            value={period ?? selected?.periods.at(-1) ?? ""}
            disabled={busy || !selected}
            onChange={(e) => onPeriod(e.target.value)}
          >
            {selected?.periods.map((p) => (
              <option key={p} value={p}>
                {new Date(`${p}-01T00:00:00Z`).toLocaleDateString("en-GB", {
                  month: "short",
                  year: "numeric",
                  timeZone: "UTC",
                })}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="dataset-status">
        <span className="status-dot" />
        Local analyst · {selected?.currency ?? "INR"} · Synthetic data
      </div>
      {selected && (
        <details className="dataset-coverage">
          <summary>
            {datasetId === "bankshield" ? "Limited sample coverage" : "Connected demo records"}{" "}
            <span>View coverage</span>
          </summary>
          <div className="coverage-grid">
            <div>
              <b>{selected.coverage.transactions.toLocaleString()}</b>
              <span>Transactions</span>
            </div>
            <div>
              <b>{selected.coverage.completeCustomerChains.toLocaleString()}</b>
              <span>Complete customer links</span>
            </div>
            <div>
              <b>{selected.coverage.missingDates}</b>
              <span>Missing dates</span>
            </div>
          </div>
          <ul>
            {selected.limitations.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {selected.sourceUrl && (
            <a href={selected.sourceUrl} target="_blank" rel="noopener noreferrer">
              Publisher dataset ↗
            </a>
          )}
        </details>
      )}
    </div>
  );
}

export function AnalysisDetails({ analysis }: { analysis: AnalysisMetadata }) {
  return (
    <details className="analysis-details">
      <summary>
        <ShieldCheck size={15} />
        <span>Data sent to AI</span>
        <strong>
          {analysis.externalTransmission ? analysis.provider : "None · local analysis"}
        </strong>
      </summary>
      <div>
        <p>
          {analysis.externalTransmission
            ? `Provider: ${analysis.provider}. Outbound fields: ${(analysis.outboundFields ?? []).join(", ")}. See deployment settings for provider handling.`
            : "Processed locally. No external model received this analysis."}
        </p>
        <div className="scope-item">
          <span>Dataset</span>
          <strong>{analysis.datasetName}</strong>
        </div>
        <div className="scope-item">
          <span>Reporting period</span>
          <strong>{analysis.period}</strong>
        </div>
        <div className="scope-item">
          <span>Baseline</span>
          <strong>{analysis.baseline}</strong>
        </div>
        <div className="scope-item">
          <span>Tool run</span>
          <strong className="mono">{analysis.runId}</strong>
        </div>
        <p className="muted">
          Database version: {analysis.datasetVersion.slice(0, 12)} · {analysis.currency}
        </p>
        <ul>
          {analysis.limitations.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      </div>
    </details>
  );
}
