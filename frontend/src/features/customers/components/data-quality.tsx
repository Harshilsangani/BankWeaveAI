"use client";
import { useEffect, useState } from "react";
import { getDataQuality } from "@/features/customers/api";
import { getStaffIdentity } from "@/shared/api/client";
import type { DataQuality as Quality } from "@/features/imports/types/quality";
import { ImportWizard } from "@/features/imports/components/import-wizard";
import { DataTable } from "@/shared/analytics/blocks";
export function DataQuality({ onImported }: { onImported: () => void }) {
  const [dataset, setDataset] = useState("meridian"),
    [quality, setQuality] = useState<Quality>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0),
    [canWrite, setCanWrite] = useState(false),
    [canPreview, setCanPreview] = useState(false);
  useEffect(() => {
    let active = true;
    void getDataQuality(dataset)
      .then((value) => {
        if (active) setQuality(value);
      })
      .catch((error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, [dataset, revision]);
  useEffect(() => {
    void getStaffIdentity()
      .then((identity) => {
        setCanWrite(identity.permissions.includes("customer_write"));
        setCanPreview(identity.permissions.includes("data_import"));
      })
      .catch((error) => setError(error.message));
  }, []);
  return (
    <div className="quality-workspace">
      <div className="data-panel-heading">
        <div>
          <h2>Data quality & imports</h2>
          <p>Inspect source coverage before using records in banking analysis.</p>
        </div>
        <label>
          Dataset{" "}
          <select
            aria-label="Quality dataset"
            value={dataset}
            disabled={busy}
            onChange={(event) => {
              setDataset(event.target.value);
              setQuality(undefined);
              setError("");
            }}
          >
            <option value="meridian">Meridian demo</option>
            <option value="bankshield">BankShield public sample</option>
          </select>
        </label>
      </div>
      {error && (
        <p className="data-error" role="alert">
          {error}
        </p>
      )}
      {quality ? (
        <>
          <div className="customer-link-metrics">
            <div>
              <strong>{quality.counts.transactions.toLocaleString()}</strong>
              <span>Transactions</span>
            </div>
            <div>
              <strong>{quality.completeCustomerChains.toLocaleString()}</strong>
              <span>Complete customer links</span>
            </div>
            <div>
              <strong>{quality.currency}</strong>
              <span>Transaction currency</span>
            </div>
            <div>
              <strong>{quality.duplicatePrimaryKeys}</strong>
              <span>Duplicate active keys</span>
            </div>
          </div>
          <ImportWizard
            key={dataset}
            dataset={dataset}
            canPreview={canPreview}
            canWrite={canWrite}
            onBusy={setBusy}
            onImported={() => {
              setRevision((current) => current + 1);
              onImported();
            }}
          />
          <details className="import-storage">
            <summary>Source data quality and limitations</summary>
            <DataTable
              data={{
                columns: ["Quality check", "Affected records"],
                rows: Object.entries(quality.checks).map(([label, count]) => [
                  label,
                  count.toLocaleString(),
                ]),
              }}
            />
            <p className="muted">{quality.duplicateNote}</p>
            <ul className="quality-limitations">
              {quality.limitations.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
          </details>
        </>
      ) : (
        <p role="status">Checking dataset quality…</p>
      )}
    </div>
  );
}
