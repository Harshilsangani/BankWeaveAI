"use client";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronRight, Download, FileSpreadsheet, UploadCloud } from "lucide-react";
import {
  applyBankingImport,
  getImportHistory,
  getImportSchema,
  reviewBankingImport,
  uploadBankingFile,
} from "@/features/imports/api";
import type {
  FileImportPreview,
  ImportEntity,
  ImportHistory,
  ImportSchema,
  ImportUpload,
} from "@/features/imports/types";
import { errorCsv, suggestMapping } from "@/features/imports/mapping";
import { Badge, Button } from "@/shared/ui/primitives";
import { DataTable } from "@/shared/analytics/blocks";

const names: Record<ImportEntity, string> = {
  customers: "Customers",
  accounts: "Accounts",
  transactions: "Transactions",
  loans: "Loans",
};
const descriptions: Record<ImportEntity, string> = {
  customers: "Profiles awaiting identity verification",
  accounts: "Accounts linked to existing customer IDs",
  transactions: "Historical records linked to existing accounts",
  loans: "Original principal and supplied default observations",
};
export function ImportWizard({
  dataset,
  canPreview,
  canWrite,
  onImported,
  onBusy,
}: {
  dataset: string;
  canPreview: boolean;
  canWrite: boolean;
  onImported: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const [schema, setSchema] = useState<ImportSchema>();
  const [entity, setEntity] = useState<ImportEntity>("transactions");
  const [upload, setUpload] = useState<ImportUpload>();
  const [sheet, setSheet] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<FileImportPreview>();
  const [history, setHistory] = useState<ImportHistory[]>([]);
  const [historyError, setHistoryError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [timezone, setTimezone] = useState<"+05:30" | "+00:00">("+05:30");
  const [csv, setCsv] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [receipt, setReceipt] = useState<{ rows: number; entity: ImportEntity; id: string }>();
  const [revision, setRevision] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const requestRevision = useRef(0);
  const fields = schema?.entities[entity] ?? [];
  const activeSheet = upload?.sheets.find((s) => s.name === sheet);

  useEffect(() => {
    let active = true;
    getImportSchema(dataset)
      .then((value) => {
        if (active) setSchema(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
      requestRevision.current++;
    };
  }, [dataset, revision]);
  useEffect(() => {
    let active = true;
    setHistoryError("");
    getImportHistory(dataset)
      .then((value) => {
        if (active) setHistory(value);
      })
      .catch((e) => {
        if (active) setHistoryError(e.message);
      });
    return () => {
      active = false;
    };
  }, [dataset, revision]);

  function setWorking(value: boolean) {
    setBusy(value);
    onBusy(value);
  }
  function reset() {
    requestRevision.current++;
    setUpload(undefined);
    setPreview(undefined);
    setReceipt(undefined);
    setError("");
    setStep(0);
    setConfirmed(false);
    setCsv("");
    if (fileInput.current) fileInput.current.value = "";
  }
  function chooseSheet(name: string) {
    setSheet(name);
    setPreview(undefined);
    setConfirmed(false);
    setMapping(
      suggestMapping(fields, upload?.sheets.find((s) => s.name === name)?.headers ?? [], entity)
    );
  }
  function chooseEntity(value: ImportEntity) {
    setEntity(value);
    setPreview(undefined);
    setConfirmed(false);
    setReceipt(undefined);
    setMapping(suggestMapping(schema?.entities[value] ?? [], activeSheet?.headers ?? [], value));
    if (step === 2) setStep(1);
  }
  async function readFile(file: File) {
    if (busy || !schema) return;
    setError("");
    setReceipt(undefined);
    if (!/\.(csv|xlsx)$/i.test(file.name)) {
      setError("Use CSV or Excel (.xlsx). Export SQL table records to one of these formats.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Use a file up to 5 MB.");
      return;
    }
    setWorking(true);
    const generation = ++requestRevision.current;
    try {
      const result = await uploadBankingFile(dataset, file);
      if (generation !== requestRevision.current) return;
      setUpload(result);
      const first = result.sheets.find((s) => s.rows > 0)!;
      setSheet(first.name);
      setMapping(suggestMapping(fields, first.headers, entity));
      setPreview(undefined);
      setConfirmed(false);
      setStep(1);
    } catch (e) {
      if (generation === requestRevision.current)
        setError(e instanceof Error ? e.message : "Unable to read the file.");
    } finally {
      if (generation === requestRevision.current) setWorking(false);
    }
  }
  async function validate() {
    if (!upload || busy) return;
    setError("");
    setWorking(true);
    setConfirmed(false);
    try {
      setPreview(
        await reviewBankingImport({ uploadId: upload.id, entity, sheet, mapping, timezone })
      );
      setStep(2);
      setRevision((r) => r + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Validation failed.");
    } finally {
      setWorking(false);
    }
  }
  async function save() {
    if (!preview || !confirmed || busy) return;
    setWorking(true);
    setError("");
    try {
      const result = await applyBankingImport(preview);
      setReceipt({ rows: result.importedRows, entity: result.entity, id: result.previewId });
      setStep(3);
      setRevision((r) => r + 1);
      onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
      setConfirmed(false);
    } finally {
      setWorking(false);
    }
  }
  function downloadErrors() {
    if (!preview) return;
    const url = URL.createObjectURL(
      new Blob([errorCsv(preview.errors)], { type: "text/csv;charset=utf-8" })
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "bankweave-import-errors.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }
  const missing = fields.filter((f) => f.required && !mapping[f.key]).length;
  const values = Object.values(mapping).filter(Boolean);
  const duplicateMapping = new Set(values).size !== values.length;

  return (
    <section className="import-wizard" aria-label="Guided banking data import">
      <div className="import-heading">
        <div>
          <span className="eyebrow">BRING YOUR RECORDS TOGETHER</span>
          <h3>Import banking data</h3>
          <p>Map your spreadsheet to linked banking records. Review every batch before saving.</p>
        </div>
        <Badge tone="accent">CSV + Excel</Badge>
      </div>
      <ol className="import-steps" aria-label="Import progress">
        {["Upload", "Map columns", "Review", "Complete"].map((label, index) => (
          <li
            key={label}
            aria-current={step === index ? "step" : undefined}
            className={index <= step ? "reached" : ""}
          >
            <span>{step > index ? <Check size={14} /> : index + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      {error && (
        <p className="data-error" role="alert">
          {error}
        </p>
      )}
      {!schema && !error && <p role="status">Loading record formats…</p>}
      {schema && (
        <>
          {step < 3 && (
            <label className="import-entity-label">
              Record type
              <select
                aria-label="Import record type"
                value={entity}
                disabled={busy || !canPreview}
                onChange={(e) => chooseEntity(e.target.value as ImportEntity)}
              >
                {Object.keys(schema.entities).map((key) => (
                  <option key={key} value={key}>
                    {names[key as ImportEntity]}
                  </option>
                ))}
              </select>
              <small>{descriptions[entity]}</small>
            </label>
          )}
          {step === 0 && (
            <>
              <div
                className="import-upload-zone"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (canPreview && !busy && e.dataTransfer.files[0])
                    void readFile(e.dataTransfer.files[0]);
                }}
              >
                <span className="import-file-icon">
                  <UploadCloud size={28} />
                </span>
                <h4>Drop a spreadsheet here</h4>
                <p>.xlsx or UTF-8 .csv · Up to 5 MB · 500 rows per sheet</p>
                <input
                  ref={fileInput}
                  className="sr-only"
                  aria-label="Banking data file"
                  type="file"
                  accept=".xlsx,.csv"
                  disabled={!canPreview || busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void readFile(file);
                    e.target.value = "";
                  }}
                />
                <Button
                  variant="primary"
                  disabled={!canPreview || busy}
                  onClick={() => fileInput.current?.click()}
                >
                  {busy ? "Reading file…" : "Choose CSV or Excel file"}
                </Button>
                {!canPreview && (
                  <small>Your role can view imports. An Analyst or Admin must upload data.</small>
                )}
              </div>
              <div className="import-template-links">
                {dataset === "meridian" && (
                  <a href="/demo/banking-import-template.xlsx" download>
                    <Download size={15} />
                    Excel workbook template
                  </a>
                )}
                <a href={`/api/import-template?entity=${entity}&dataset=${dataset}`} download>
                  <Download size={15} />
                  {names[entity]} CSV template
                </a>
              </div>
              {canPreview && (
                <details className="import-paste">
                  <summary>Paste CSV instead</summary>
                  <label>
                    CSV records
                    <textarea
                      aria-label="Transaction CSV"
                      rows={5}
                      value={csv}
                      disabled={busy}
                      onChange={(e) => setCsv(e.target.value)}
                    />
                  </label>
                  <Button
                    disabled={busy || !csv.trim()}
                    onClick={() =>
                      void readFile(new File([csv], "pasted-records.csv", { type: "text/csv" }))
                    }
                  >
                    Read pasted CSV
                  </Button>
                </details>
              )}
              <p className="import-order">
                For linked sheets, import Customers → Accounts → Transactions. Loans also reference
                customer IDs. Select and confirm each sheet separately.
              </p>
            </>
          )}
          {step === 1 && upload && activeSheet && (
            <>
              <div className="import-file-summary">
                <FileSpreadsheet size={20} />
                <div>
                  <strong>{upload.filename}</strong>
                  <small>
                    {activeSheet.rows} records · {upload.format.toUpperCase()}
                  </small>
                </div>
                <Button variant="ghost" disabled={busy} onClick={reset}>
                  Change file
                </Button>
              </div>
              <div className="import-scope">
                <label>
                  Worksheet
                  <select
                    aria-label="Import worksheet"
                    value={sheet}
                    disabled={busy}
                    onChange={(e) => chooseSheet(e.target.value)}
                  >
                    {upload.sheets
                      .filter((s) => s.rows)
                      .map((s) => (
                        <option key={s.name} value={s.name}>
                          {s.name} ({s.rows} rows)
                        </option>
                      ))}
                  </select>
                </label>
                {entity === "transactions" && (
                  <label>
                    Timezone for dates without an offset
                    <select
                      aria-label="Import timezone"
                      value={timezone}
                      disabled={busy}
                      onChange={(e) => setTimezone(e.target.value as typeof timezone)}
                    >
                      <option value="+05:30">India (UTC +05:30)</option>
                      <option value="+00:00">UTC (+00:00)</option>
                    </select>
                  </label>
                )}
              </div>
              <p className="muted">
                Suggestions are matched by column names. Check each mapping; unmapped columns are
                ignored.
              </p>
              <div className="import-mapping-grid">
                {fields.map((field) => (
                  <label key={field.key}>
                    <span>
                      {field.label}
                      {field.required && <small className="import-required"> Required</small>}
                    </span>
                    <select
                      aria-label={`Map ${field.label}`}
                      disabled={busy}
                      value={mapping[field.key] ?? ""}
                      onChange={(e) => setMapping({ ...mapping, [field.key]: e.target.value })}
                    >
                      <option value="">
                        {field.required ? "Choose a column" : "Not supplied"}
                      </option>
                      {activeSheet.headers.map((header) => (
                        <option key={header} value={header}>
                          {header}
                        </option>
                      ))}
                    </select>
                    {field.hint && <small>{field.hint}</small>}
                  </label>
                ))}
              </div>
              <details className="import-source-preview">
                <summary>Preview uploaded rows</summary>
                <DataTable
                  data={{
                    columns: activeSheet.headers,
                    rows: activeSheet.sample.map((row) => activeSheet.headers.map((h) => row[h])),
                  }}
                />
              </details>
              {missing > 0 && (
                <p role="status">
                  Map {missing} remaining required {missing === 1 ? "field" : "fields"} to continue.
                </p>
              )}
              {duplicateMapping && (
                <p role="alert" className="data-error">
                  Each source column can map to only one field.
                </p>
              )}
              <Button
                variant="primary"
                disabled={busy || !!missing || duplicateMapping}
                onClick={() => void validate()}
              >
                {busy ? "Validating records…" : "Preview import"}
                <ChevronRight size={16} />
              </Button>
            </>
          )}
          {step === 2 && preview && (
            <section className="quality-preview import-review">
              <div className="import-heading">
                <div>
                  <Badge tone={preview.canImport ? "accent" : "high"}>
                    {preview.canImport ? "Ready for review" : "Import blocked"}
                  </Badge>
                  <h4>
                    {preview.validRows} of {preview.rows} valid {names[entity].toLowerCase()}
                  </h4>
                  <p>
                    {upload?.filename} · {sheet} · {schema.currency}
                  </p>
                </div>
                <Button
                  disabled={busy}
                  onClick={() => {
                    setStep(1);
                    setConfirmed(false);
                    setPreview(undefined);
                  }}
                >
                  Edit mapping
                </Button>
              </div>
              <DataTable
                data={{
                  columns: fields.map((f) => f.label),
                  rows: preview.sample.map((row) => fields.map((f) => row[f.key] || "—")),
                }}
              />
              {preview.errors.length > 0 && (
                <>
                  <DataTable
                    data={{
                      columns: ["File row", "What to fix"],
                      rows: preview.errors.map((e) => [e.row, e.reasons.join(" ")]),
                    }}
                  />
                  <Button onClick={downloadErrors}>
                    <Download size={15} />
                    Download row errors
                  </Button>
                  <p>No records have been added. Correct the source file and upload it again.</p>
                </>
              )}
              {preview.canImport && (
                <>
                  <p>
                    {entity === "customers"
                      ? "Customers will be added as pending verification. This does not approve KYC."
                      : entity === "loans"
                        ? "Loan imports save original principal and supplied default markers. No repayment schedule or payments are invented."
                        : "Existing records are preserved. Only new IDs are appended."}
                  </p>
                  {canWrite ? (
                    <>
                      <label className="import-confirm">
                        <input
                          type="checkbox"
                          checked={confirmed}
                          disabled={busy}
                          onChange={(e) => setConfirmed(e.target.checked)}
                        />
                        I reviewed the records and approve adding this batch.
                      </label>
                      <Button
                        variant="primary"
                        disabled={busy || !confirmed}
                        onClick={() => void save()}
                      >
                        {busy
                          ? "Saving reviewed records…"
                          : `Confirm import — append ${preview.rows} ${names[entity].toLowerCase()}`}
                      </Button>
                    </>
                  ) : (
                    <p>
                      Only an admin can confirm an import. An admin must upload and review the file
                      in their workspace.
                    </p>
                  )}
                </>
              )}
              <p className="import-receipt-id">
                Review {preview.id} · Source {preview.sourceHash.slice(0, 12)}
              </p>
            </section>
          )}
          {step === 3 && receipt && (
            <div className="import-success" role="status">
              <span className="import-file-icon">
                <Check size={28} />
              </span>
              <h4>
                {receipt.rows} {names[receipt.entity].toLowerCase()} imported
              </h4>
              <p>
                The records are now available in the data workspace and linked banking analysis.
              </p>
              <small>Receipt {receipt.id}</small>
              <Button onClick={reset}>Import another sheet or file</Button>
            </div>
          )}
          <details className="import-storage">
            <summary>Storage and SQL database exports</summary>
            <p>
              Original CSV/Excel files are discarded after parsing. Parsed rows, previews, receipts
              and confirmed records remain in the local database. Gemini is disconnected. Automatic
              retention/deletion controls are deployment work.
            </p>
            <p>
              Banks can export tables from SQL databases to CSV or Excel. Customer IDs are preserved
              on import. Executable .sql dumps and direct database connections are not supported by
              this upload flow.
            </p>
            <p>
              Current analytical snapshots support {schema.periods.join(", ")} in {schema.currency}.{" "}
              {entity === "loans" && `Branch IDs: ${schema.branches.map((b) => b.id).join(", ")}.`}{" "}
              Imported source labels require review.
            </p>
          </details>
        </>
      )}
      <div className="import-history">
        <div className="import-heading">
          <div>
            <h4>Recent import reviews</h4>
            <p>Your workspace and staff role · Latest 20</p>
          </div>
          <Button variant="ghost" disabled={busy} onClick={() => setRevision((r) => r + 1)}>
            Refresh
          </Button>
        </div>
        {historyError ? (
          <p role="alert">{historyError}</p>
        ) : history.length ? (
          <DataTable
            data={{
              columns: ["File / sheet", "Records", "Status", "Saved", "Reviewed"],
              rows: history.map((h) => [
                `${h.filename} / ${h.sheet}`,
                `${h.rows} ${h.entity}`,
                h.status === "imported"
                  ? "Imported"
                  : h.errorRows
                    ? `${h.errorRows} rows need fixes`
                    : "Awaiting confirmation",
                h.importedRows,
                new Date(h.createdAt).toLocaleString(),
              ]),
            }}
          />
        ) : (
          <p className="muted">No file reviews yet. Upload a spreadsheet to get started.</p>
        )}
      </div>
    </section>
  );
}
