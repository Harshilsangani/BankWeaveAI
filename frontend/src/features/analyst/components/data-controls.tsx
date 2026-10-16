"use client";
import { createElement } from "react";
import type { DatasetId, DatasetInfo } from "@/shared/types/scope";

export function DataControls({
  datasets,
  datasetId,
  busy,
  onDataset,
}: {
  datasets: DatasetInfo[];
  datasetId: DatasetId;
  busy: boolean;
  onDataset: (id: DatasetId) => void;
}) {
  const selected = datasets.find((d) => d.id === datasetId);
  return (
    <div className="data-controls">
      <div className="dataset-selects single">
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
      </div>
    </div>
  );
}
