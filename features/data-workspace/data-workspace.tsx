"use client";
import { useEffect, useState } from "react";
import {
  Database,
  ArrowLeft,
  FileText,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { Dialog } from "@/components/dialog";
import { DataTable } from "@/components/blocks";
import {
  deleteCustomerProfile,
  getCustomerDirectory,
  getCustomerDetails,
  getSourceRecords,
  saveCustomerProfile,
  getStaffIdentity,
} from "@/services";
import type { CustomerFields, DatasetId, QueryContext } from "@/types";
import type {
  CustomerProfile,
  CustomerDetails,
  DirectoryPage,
  SourcePage,
} from "@/types/data-workspace";
import { formatAddedProfiles, formatStat } from "./stats";
import { DataQuality } from "./data-quality";
import { Repayments } from "./repayment-ledger";
import { Insurance } from "./insurance-overview";
import { Recommendations } from "./recommendations";
import { FinancialHealth } from "./financial-health";
import { KycReview } from "./kyc-review";
import { RecordMaintenance } from "./record-maintenance";
import { ApprovalQueue } from "./approval-queue";

function CustomerOverview({
  id,
  onClose,
  onInvestigate,
}: {
  id: string;
  onClose: () => void;
  onInvestigate: (id: string, scope: QueryContext) => void;
}) {
  const [customer, setCustomer] = useState<CustomerDetails>();
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    getCustomerDetails(id)
      .then((value) => {
        if (active) setCustomer(value);
      })
      .catch((error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, [id, revision]);
  const money = (value: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(value);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={customer?.fields.fullName ?? "Customer overview"}
      description={`${id} · One customer identity across banking records`}
      wide
    >
      {error ? (
        <p role="alert">{error}</p>
      ) : !customer ? (
        <p role="status">Loading customer relationships…</p>
      ) : (
        <div className="customer-overview">
          <div className="page-actions">
            <Button
              onClick={() =>
                onInvestigate("RSK-001", { datasetId: "meridian", domain: "fraud", customerId: id })
              }
            >
              Investigate customer transactions
            </Button>
            <Button
              disabled={!customer.links?.loans}
              onClick={() =>
                onInvestigate("RSK-002", { datasetId: "meridian", domain: "loans", customerId: id })
              }
            >
              Review customer loans
            </Button>
          </div>
          <div className="customer-identity">
            <Badge tone="accent">{customer.source}</Badge>
            <p>
              {customer.fields.email || "No email supplied"} ·{" "}
              {customer.fields.city || "No city supplied"}
            </p>
            {customer.master && (
              <p>
                {customer.master.branchName} · {customer.master.occupation} · Credit score{" "}
                {customer.master.creditScore}
              </p>
            )}
          </div>
          <div className="customer-link-metrics">
            <div>
              <strong>{customer.links?.accounts ?? 0}</strong>
              <span>Accounts</span>
            </div>
            <div>
              <strong>{customer.links?.loans ?? 0}</strong>
              <span>Loans</span>
            </div>
            <div>
              <strong>{customer.links?.transactions ?? 0}</strong>
              <span>Transactions</span>
            </div>
            <div>
              <strong>{customer.links?.flagged ?? 0}</strong>
              <span>Flagged transactions</span>
            </div>
          </div>
          <h3>Linked accounts</h3>
          <p className="mono">
            {customer.accounts.map((account) => account.id).join(" · ") || "No linked accounts"}
          </p>
          <h3>Loans</h3>
          {customer.loans.length ? (
            <DataTable
              data={{
                columns: ["Loan", "Type", "Principal"],
                rows: customer.loans.map((loan) => [loan.id, loan.type, money(loan.principal)]),
              }}
            />
          ) : (
            <p>No linked loans</p>
          )}
          <h3>Recent transactions</h3>
          {customer.transactions.length ? (
            <DataTable
              data={{
                columns: ["Transaction", "Account", "Amount", "Review flag"],
                rows: customer.transactions.map((tx) => [
                  tx.id,
                  tx.accountId,
                  money(tx.amount),
                  tx.flagged ? "Flagged" : "No flag",
                ]),
              }}
            />
          ) : (
            <p>No linked transactions</p>
          )}
          <p className="muted">
            Flags are signals for review, not confirmed fraud. These are synthetic banking records.
          </p>
          <h3>Customer review & products</h3>
          <p className="muted">
            Expand a section to review linked products, source evidence or recorded staff actions.
          </p>
          <Repayments key={"repayments" + revision} customerId={id} />
          <Insurance key={"insurance" + revision} customerId={id} />
          <Recommendations key={"recommendations" + revision} customerId={id} />
          <FinancialHealth key={"cashflow" + revision} customerId={id} />
          <KycReview customerId={id} />
          <RecordMaintenance
            customerId={id}
            onChanged={() => setRevision((current) => current + 1)}
          />
        </div>
      )}
    </Dialog>
  );
}

const labels: Record<keyof CustomerFields, string> = {
  fullName: "Full name",
  dateOfBirth: "Date of birth",
  email: "Email",
  phone: "Mobile number",
  address: "Address",
  city: "City",
  state: "State",
  postalCode: "PIN / postal code",
};
const lengths: Record<keyof CustomerFields, number> = {
  fullName: 150,
  dateOfBirth: 10,
  email: 200,
  phone: 20,
  address: 500,
  city: 80,
  state: 80,
  postalCode: 10,
};
const emptyFields: CustomerFields = {
  fullName: "",
  dateOfBirth: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  state: "",
  postalCode: "",
};

function CustomerEditor({
  profile,
  onClose,
  onSaved,
}: {
  profile?: CustomerProfile;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fields, setFields] = useState(profile?.fields ?? emptyFields);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      title={profile ? "Edit customer" : "Add customer"}
      description={
        profile
          ? `${profile.id} · Changes are saved to the local customer directory.`
          : "Create a local customer profile. Verification remains pending."
      }
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          try {
            await saveCustomerProfile(fields, profile);
            onSaved();
          } catch (error) {
            setError(error instanceof Error ? error.message : "Customer could not be saved.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="customer-fields">
          {(Object.keys(labels) as (keyof CustomerFields)[]).map((key) => (
            <label key={key}>
              {labels[key]}
              {(key === "fullName" || key === "dateOfBirth") && " *"}
              <input
                aria-label={labels[key]}
                autoFocus={key === "fullName"}
                required={key === "fullName" || key === "dateOfBirth"}
                type={key === "dateOfBirth" ? "date" : key === "email" ? "email" : "text"}
                maxLength={lengths[key]}
                minLength={key === "fullName" ? 2 : undefined}
                value={fields[key]}
                disabled={busy}
                onChange={(e) => setFields((current) => ({ ...current, [key]: e.target.value }))}
              />
            </label>
          ))}
        </div>
        {error && (
          <p role="alert" className="data-error">
            {error}
          </p>
        )}
        <div className="data-dialog-actions">
          <Button type="button" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Saving…" : profile ? "Save changes" : "Create customer"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function DataWorkspace({
  onAnalyst,
  onBack,
  onInvestigate,
}: {
  onAnalyst: () => void;
  onBack: () => void;
  onInvestigate: (id: string, scope: QueryContext) => void;
}) {
  const [mode, setMode] = useState<"customers" | "records" | "quality" | "approvals">("customers");
  const [filters, setFilters] = useState({ branch: "", source: "", status: "", product: "" });
  const [canWrite, setCanWrite] = useState(false);
  useEffect(() => {
    void getStaffIdentity()
      .then((i) => setCanWrite(i.permissions.includes("customer_write")))
      .catch((e) => setError(e.message));
  }, []);
  const [dataset, setDataset] = useState<DatasetId>("meridian"),
    [table, setTable] = useState("transactions");
  const [query, setQuery] = useState(""),
    [offset, setOffset] = useState(0),
    [revision, setRevision] = useState(0);
  const [directory, setDirectory] = useState<DirectoryPage>(),
    [records, setRecords] = useState<SourcePage>();
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [editor, setEditor] = useState<{ profile?: CustomerProfile }>();
  const [deleting, setDeleting] = useState<CustomerProfile>(),
    [deleteBusy, setDeleteBusy] = useState(false),
    [deleteError, setDeleteError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<string>();
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const timer = setTimeout(() => {
      Promise.all([
        getCustomerDirectory(
          mode === "customers" ? query : "",
          mode === "customers" ? offset : 0,
          mode === "customers" ? filters : {}
        ),
        mode === "records"
          ? getSourceRecords(dataset, table, query, offset)
          : Promise.resolve(undefined),
      ])
        .then(([customers, sources]) => {
          if (active) {
            setDirectory(customers);
            setRecords(sources);
          }
        })
        .catch((error) => {
          if (active)
            setError(error instanceof Error ? error.message : "Records could not be loaded.");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [mode, dataset, table, query, offset, revision, filters]);
  const page = mode === "customers" ? directory : records;
  function refresh() {
    setRevision((value) => value + 1);
  }
  function changeMode(value: "customers" | "records" | "quality" | "approvals") {
    setMode(value);
    setQuery("");
    setOffset(0);
    setNotice("");
  }
  return (
    <div className="data-workspace animate-in">
      <Button variant="ghost" className="data-back" onClick={onBack}>
        <ArrowLeft size={16} />
        Back to Command Center
      </Button>
      <div className="page-heading">
        <div>
          <h1>
            Data Workspace
            <span className="heading-dot" />
          </h1>
          <p>Your customer directory and banking source records, in one place.</p>
        </div>
        <Badge tone="accent">
          <span className="status-dot" /> Local database
        </Badge>
      </div>
      <div className="data-summary-grid">
        <div className="data-summary">
          <Users size={19} />
          <span>Total customers</span>
          <strong>{formatStat(directory?.stats.customers)}</strong>
          <small>Synthetic bank customers and new profiles</small>
        </div>
        <div className="data-summary">
          <FileText size={19} />
          <span>Synthetic bank customers</span>
          <strong>{formatStat(directory?.stats.synthetic)}</strong>
          <small>Shared across accounts, transactions and loans</small>
        </div>
        <div className="data-summary">
          <Pencil size={19} />
          <span>Added profiles</span>
          <strong>{formatAddedProfiles(directory?.stats)}</strong>
          <small>
            {directory?.stats.uploaded ?? 0} uploaded · {directory?.stats.manual ?? 0} manual
          </small>
        </div>
      </div>
      <section className="panel data-panel">
        <div className="data-view-tabs" role="group" aria-label="Data views">
          <button
            aria-pressed={mode === "customers"}
            className={mode === "customers" ? "active" : ""}
            onClick={() => changeMode("customers")}
          >
            <Users size={16} />
            Customer directory
          </button>
          <button
            aria-pressed={mode === "records"}
            className={mode === "records" ? "active" : ""}
            onClick={() => changeMode("records")}
          >
            <Database size={16} />
            Source records
          </button>
          <button
            aria-pressed={mode === "quality"}
            className={mode === "quality" ? "active" : ""}
            onClick={() => changeMode("quality")}
          >
            <ShieldCheck size={16} />
            Data quality & imports
          </button>
          <button
            aria-pressed={mode === "approvals"}
            className={mode === "approvals" ? "active" : ""}
            onClick={() => changeMode("approvals")}
          >
            <ShieldCheck size={16} />
            Approval requests
          </button>
        </div>
        {mode === "approvals" ? (
          <ApprovalQueue onApplied={refresh} />
        ) : mode === "quality" ? (
          <DataQuality onImported={refresh} />
        ) : (
          <>
            <div className="data-panel-heading">
              <div>
                <h2>{mode === "customers" ? "Customer directory" : "Explore banking records"}</h2>
                <p>
                  {mode === "customers"
                    ? "The same customers used in banking analysis. Select a name to view linked records."
                    : "Read-only imported data. Original records stay stable for analysis and evidence."}
                </p>
              </div>
              <div className="data-toolbar-actions">
                <Button onClick={refresh} disabled={loading} aria-label="Refresh records">
                  <RefreshCw size={15} />
                </Button>
                {mode === "customers" && (
                  <Button variant="primary" disabled={!canWrite} onClick={() => setEditor({})}>
                    <Plus size={16} />
                    Add customer
                  </Button>
                )}
              </div>
            </div>
            {!canWrite && mode === "customers" && (
              <p className="muted admin-access-note">
                Only admins can add, edit or delete banking records. Submit extracted customer forms
                through AI Analyst for approval.
              </p>
            )}
            <div className="data-filters">
              <label className="data-search">
                <Search size={16} />
                <input
                  aria-label="Search records"
                  placeholder={
                    mode === "customers"
                      ? "Search name, ID, city or email…"
                      : "Search record values…"
                  }
                  value={query}
                  maxLength={100}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setOffset(0);
                  }}
                />
              </label>
              {mode === "customers" && (
                <div className="directory-filters">
                  <label>
                    Branch
                    <select
                      aria-label="Customer branch"
                      value={filters.branch}
                      onChange={(e) => {
                        setFilters({ ...filters, branch: e.target.value });
                        setOffset(0);
                      }}
                    >
                      <option value="">All branches</option>
                      {directory?.filters.branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Source
                    <select
                      aria-label="Customer source"
                      value={filters.source}
                      onChange={(e) => {
                        setFilters({ ...filters, source: e.target.value });
                        setOffset(0);
                      }}
                    >
                      <option value="">All sources</option>
                      <option value="synthetic">Synthetic dataset</option>
                      <option value="uploaded">Form or spreadsheet upload</option>
                      <option value="manual">Manual entry</option>
                    </select>
                  </label>
                  <label>
                    Status
                    <select
                      aria-label="Customer status"
                      value={filters.status}
                      onChange={(e) => {
                        setFilters({ ...filters, status: e.target.value });
                        setOffset(0);
                      }}
                    >
                      <option value="">All statuses</option>
                      <option value="synthetic">Synthetic record</option>
                      <option value="pending_verification">Verification pending</option>
                    </select>
                  </label>
                  <label>
                    Products
                    <select
                      aria-label="Customer products"
                      value={filters.product}
                      onChange={(e) => {
                        setFilters({ ...filters, product: e.target.value });
                        setOffset(0);
                      }}
                    >
                      <option value="">All customers</option>
                      <option value="accounts">Has account</option>
                      <option value="loans">Has loan</option>
                      <option value="insurance">Has insurance</option>
                      <option value="none">No linked products</option>
                    </select>
                  </label>
                </div>
              )}
              {mode === "records" && (
                <>
                  <label>
                    Dataset
                    <select
                      aria-label="Source dataset"
                      value={dataset}
                      onChange={(e) => {
                        setDataset(e.target.value as DatasetId);
                        setOffset(0);
                      }}
                    >
                      <option value="meridian">Meridian demo · INR</option>
                      <option value="bankshield">BankShield sample · USD</option>
                    </select>
                  </label>
                  <label>
                    Table
                    <select
                      aria-label="Source table"
                      value={table}
                      onChange={(e) => {
                        setTable(e.target.value);
                        setOffset(0);
                      }}
                    >
                      <option value="customers">Customers</option>
                      <option value="accounts">Accounts</option>
                      <option value="loans">Loans</option>
                      <option value="transactions">Transactions</option>
                      <option value="fraud_alerts">Fraud alerts</option>
                      <option value="devices">Devices</option>
                    </select>
                  </label>
                </>
              )}
            </div>
            {mode === "customers" && (query || Object.values(filters).some(Boolean)) && (
              <div className="directory-filter-status">
                <span>Filtered customer directory</span>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setQuery("");
                    setFilters({ branch: "", source: "", status: "", product: "" });
                    setOffset(0);
                  }}
                >
                  Clear filters
                </Button>
              </div>
            )}
            {notice && (
              <div role="status" className="data-notice">
                <ShieldCheck size={16} />
                {notice}
              </div>
            )}
            {error ? (
              <div className="data-empty">
                <p role="alert">{error}</p>
                <Button onClick={refresh}>Retry</Button>
              </div>
            ) : loading ? (
              <div className="data-empty" role="status">
                Loading records…
              </div>
            ) : !page?.rows.length ? (
              <div className="data-empty">
                <Database size={28} />
                <h3>
                  {query
                    ? "No matching records"
                    : mode === "customers"
                      ? "Start your customer directory"
                      : "No records in this table"}
                </h3>
                <p>
                  {query
                    ? "Try a different name or record value."
                    : mode === "customers"
                      ? "Add a customer manually, or extract and review a filled form in AI Analyst."
                      : "Choose another table or dataset. Missing source records are not generated."}
                </p>
                {!query && mode === "customers" && (
                  <Button onClick={onAnalyst}>Read a form in AI Analyst</Button>
                )}
              </div>
            ) : mode === "customers" ? (
              <div className="directory-results">
                <p className="table-scroll-hint">
                  Scroll to see contact, product and review details. Customer names stay in view.
                </p>
                <div
                  className="data-table-scroll"
                  tabIndex={0}
                  role="region"
                  aria-label="Customer directory table"
                >
                  <table className="directory-table">
                    <caption className="sr-only">Local customer profiles</caption>
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Contact</th>
                        <th>City</th>
                        <th>Banking relationships</th>
                        <th>Source</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {directory?.rows.map((customer) => (
                        <tr key={customer.id}>
                          <td>
                            <button
                              className="customer-name"
                              onClick={() => setSelectedCustomer(customer.id)}
                            >
                              {customer.fields.fullName}
                            </button>
                            <small className="mono">{customer.id}</small>
                          </td>
                          <td>
                            {customer.fields.email || "—"}
                            <small>{customer.fields.phone || "No mobile number"}</small>
                          </td>
                          <td>{customer.fields.city || "—"}</td>
                          <td>
                            {customer.links?.accounts ?? 0} accounts · {customer.links?.loans ?? 0}{" "}
                            loans
                            <small>
                              {customer.links?.transactions ?? 0} transactions ·{" "}
                              {customer.links?.flagged ?? 0} flagged
                            </small>
                          </td>
                          <td>{customer.source}</td>
                          <td>
                            <Badge tone={customer.status === "synthetic" ? "accent" : "amber"}>
                              {customer.status === "synthetic"
                                ? "Synthetic record"
                                : "Verification pending"}
                            </Badge>
                          </td>
                          <td>
                            <div className="data-row-actions">
                              <button
                                className="icon-button"
                                aria-label={`Edit ${customer.fields.fullName}`}
                                disabled={!canWrite}
                                onClick={() => setEditor({ profile: customer })}
                              >
                                <Pencil size={15} />
                              </button>
                              <button
                                className="icon-button data-delete"
                                disabled={!canWrite}
                                aria-label={`Delete ${customer.fields.fullName}`}
                                onClick={() => {
                                  if (!canWrite) return;
                                  setDeleting(customer);
                                  setDeleteError("");
                                }}
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              records && <DataTable data={{ columns: records.columns, rows: records.rows }} />
            )}
            {!loading && !error && page && (
              <div className="data-pagination">
                <span>
                  {page.total ? `${page.offset + 1}–${page.offset + page.rows.length}` : "0"} of{" "}
                  {page.total.toLocaleString()} records
                </span>
                <Button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 15))}>
                  Previous
                </Button>
                <Button
                  disabled={page.nextOffset === null}
                  onClick={() => setOffset(page.nextOffset!)}
                >
                  Next
                </Button>
              </div>
            )}
            {mode === "records" && records && (
              <details className="data-source-notes">
                <summary>Source coverage · {records.datasetName}</summary>
                <ul>
                  {records.limitations.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <p>
                  Customer source tables contain identifiers. Meridian's customer directory uses
                  those same IDs for its synthetic profiles and linked banking records.
                </p>
              </details>
            )}
          </>
        )}
      </section>
      {selectedCustomer && (
        <CustomerOverview
          id={selectedCustomer}
          onInvestigate={onInvestigate}
          onClose={() => setSelectedCustomer(undefined)}
        />
      )}
      {editor && (
        <CustomerEditor
          profile={editor.profile}
          onClose={() => setEditor(undefined)}
          onSaved={() => {
            setNotice(
              editor.profile ? "Customer changes saved." : "Customer created. Verification pending."
            );
            setEditor(undefined);
            setOffset(0);
            refresh();
          }}
        />
      )}
      <Dialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open && !deleteBusy) setDeleting(undefined);
        }}
        title="Delete customer profile?"
        description={`Remove ${deleting?.fields.fullName ?? "this customer"} (${deleting?.id ?? ""}) from the directory. This cannot be undone. Original form drafts and audit history are retained.`}
      >
        {deleteError && (
          <p role="alert" className="data-error">
            {deleteError}
          </p>
        )}
        <div className="data-dialog-actions">
          <Button disabled={deleteBusy} onClick={() => setDeleting(undefined)}>
            Cancel
          </Button>
          <Button
            className="data-delete-confirm"
            disabled={deleteBusy}
            onClick={async () => {
              if (!deleting || deleteBusy) return;
              setDeleteBusy(true);
              setDeleteError("");
              try {
                await deleteCustomerProfile(deleting);
                setDeleting(undefined);
                setNotice("Customer profile deleted.");
                setOffset(0);
                refresh();
              } catch (error) {
                setDeleteError(
                  error instanceof Error ? error.message : "Customer could not be deleted."
                );
              } finally {
                setDeleteBusy(false);
              }
            }}
          >
            {deleteBusy ? "Deleting…" : "Delete customer"}
          </Button>
        </div>
      </Dialog>
      <footer className="dashboard-footer">
        <span>
          <span className="status-dot" />
          Local workspace · Changes persist in SQLite
        </span>
        <span>Customer management · Human operated</span>
      </footer>
    </div>
  );
}
