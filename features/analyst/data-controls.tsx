"use client";
import { createElement } from "react";
import { ShieldCheck } from "lucide-react";
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
        <label className="dataset-field">
          <span>Dataset</span>
          <select
            aria-label="Analysis dataset"
            title={selected?.name}
            value={datasetId}
            disabled={busy || !datasets.length}
            onChange={(e) => onDataset(e.target.value as DatasetId)}
          >
            <button type="button">{createElement("selectedcontent")}</button>
            {!datasets.length && <option value="meridian">Loading datasets…</option>}
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="month-field">
          <span>Month</span>
          <select
            aria-label="Reporting month"
            value={period ?? "all"}
            disabled={busy || !selected}
            onChange={(e) => onPeriod(e.target.value)}
          >
            <button type="button">{createElement("selectedcontent")}</button>
            <option value="all">All months</option>
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
    </div>
  );
}

export function AnalysisDetails({ analysis }: { analysis: AnalysisMetadata }) {
  return (
    <details className="analysis-details">
      <summary>
        <ShieldCheck size={15} />
        <span>Query details</span>
      </summary>
      <div>
        <div className="scope-item">
          <span>Dataset</span>
          <strong>{analysis.datasetName}</strong>
        </div>
        <div className="scope-item">
          <span>Period</span>
          <strong>{analysis.period}</strong>
        </div>
        <div className="scope-item">
          <span>Currency</span>
          <strong>{analysis.currency}</strong>
        </div>
      </div>
    </details>
  );
}
