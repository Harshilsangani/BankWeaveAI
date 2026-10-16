"use client";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  FileCheck2,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { Badge, Button } from "@/shared/ui/primitives";
import { MarkdownContent } from "@/shared/ui/markdown";
import {
  decideApprovalRequest,
  getApprovalRequest,
  getApprovalRequests,
} from "@/features/forms/api";
import type { ApprovalDetail, ApprovalPage } from "@/features/forms/types/approvals";

const labels = {
  fullName: "Full name",
  dateOfBirth: "Date of birth",
  email: "Email",
  phone: "Phone",
  address: "Address",
  city: "City",
  state: "State",
  postalCode: "Postal code",
};

export function ApprovalQueue({ onApplied }: { onApplied: () => void }) {
  const [status, setStatus] = useState("pending"),
    [offset, setOffset] = useState(0);
  const [page, setPage] = useState<ApprovalPage>(),
    [selected, setSelected] = useState<string>();
  const [detail, setDetail] = useState<ApprovalDetail>();
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [version, setVersion] = useState(0);
  const [note, setNote] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const [duplicateDecision, setDuplicateDecision] = useState<"" | "reuse" | "create_separate">("");
  const [duplicateReason, setDuplicateReason] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void getApprovalRequests(status, offset)
      .then((value) => {
        if (active) setPage(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [status, offset, version]);
  useEffect(() => {
    let active = true;
    setDetail(undefined);
    setNote("");
    setConfirmed(false);
    setError("");
    if (selected)
      void getApprovalRequest(selected)
        .then((value) => {
          if (active) {
            setDetail(value);
            setDuplicateDecision(value.snapshot.duplicateDecision ?? "");
            setDuplicateReason(value.snapshot.duplicateReason);
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [selected, version]);
  async function decide(decision: "approve" | "reject") {
    if (!detail) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const updated = await decideApprovalRequest(detail.id, {
        decision,
        revision: detail.revision,
        confirmed,
        note: note.trim(),
        ...(duplicateDecision ? { duplicateDecision, duplicateReason } : {}),
      });
      setDetail(updated);
      setConfirmed(false);
      setNotice(
        decision === "approve"
          ? `Approved. Customer ${updated.customerId} is saved with verification pending.`
          : "Rejected. No customer was added."
      );
      if (decision === "approve") onApplied();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The decision could not be saved.");
    } finally {
      setBusy(false);
    }
  }
  const needsDuplicateReview = !!detail?.currentQuality.possibleDuplicates?.length;
  return (
    <div className="approval-workspace">
      <div className="data-panel-heading">
        <div>
          <h2>
            <ShieldCheck size={21} /> Approval requests
          </h2>
          <p>
            {page?.canApprove
              ? "Review staff submissions before adding customer records."
              : "Track your submitted forms and admin decisions. Only admins can apply banking changes."}
          </p>
        </div>
        <Button
          disabled={busy || loading}
          onClick={() => setVersion((v) => v + 1)}
          aria-label="Refresh approval requests"
        >
          <RefreshCw size={15} /> Refresh
        </Button>
      </div>
      {error && (
        <p role="alert" className="data-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="data-notice">
          {notice}
        </p>
      )}
      {selected ? (
        <>
          <Button
            disabled={busy}
            onClick={() => {
              setSelected(undefined);
              setNotice("");
              setVersion((v) => v + 1);
            }}
          >
            <ArrowLeft size={15} /> Back to requests
          </Button>
          {!detail ? (
            <p role="status">Loading submitted review…</p>
          ) : (
            <article className="approval-detail">
              <div className="approval-request-heading">
                <div>
                  <h3>{detail.customerName}</h3>
                  <p>
                    {detail.filename} · {detail.id}
                  </p>
                </div>
                <Badge>{detail.status}</Badge>
              </div>
              <p className="muted">
                Submitted by {detail.requestedBy} · {new Date(detail.createdAt).toLocaleString()}
              </p>
              <div className="approval-fields">
                {Object.entries(labels).map(([key, label]) => (
                  <div key={key}>
                    <span>{label}</span>
                    <strong>
                      {detail.snapshot.fields[key as keyof typeof labels] || "Not supplied"}
                    </strong>
                  </div>
                ))}
              </div>
              <details className="approval-document">
                <summary>View extracted form and provenance</summary>
                <MarkdownContent>{detail.snapshot.markdown}</MarkdownContent>
                <ul>
                  {Object.entries(detail.snapshot.provenance ?? {}).map(([key, source]) => (
                    <li key={key}>
                      {labels[key as keyof typeof labels]}: {source.status} ·{" "}
                      {source.page ? `Page ${source.page}` : source.method} · {source.reason}
                    </li>
                  ))}
                </ul>
              </details>
              {detail.status === "pending" && page?.canApprove && (
                <section className="approval-decision">
                  <h4>Admin decision</h4>
                  <p>
                    The submitted fields are fixed for this review. Approving adds or links a
                    pending-verification customer; it does not approve KYC or open an account.
                  </p>
                  {needsDuplicateReview && (
                    <section className="duplicate-review">
                      <h4>Possible existing customer</h4>
                      {detail.currentQuality.possibleDuplicates?.map((match) => (
                        <p key={match.customerId}>
                          <strong>
                            {match.name} · {match.customerId}
                          </strong>
                          <br />
                          {match.reasons.join(" · ")}
                        </p>
                      ))}
                      <label>
                        Duplicate decision
                        <select
                          aria-label="Admin duplicate decision"
                          value={duplicateDecision}
                          disabled={busy}
                          onChange={(e) =>
                            setDuplicateDecision(e.target.value as typeof duplicateDecision)
                          }
                        >
                          <option value="">Choose after review</option>
                          {detail.currentQuality.possibleDuplicates?.length === 1 && (
                            <option value="reuse">Link existing customer</option>
                          )}
                          <option value="create_separate">Create separate profile</option>
                        </select>
                      </label>
                      <label>
                        Duplicate review reason
                        <input
                          aria-label="Admin duplicate reason"
                          value={duplicateReason}
                          maxLength={500}
                          disabled={busy}
                          onChange={(e) => setDuplicateReason(e.target.value)}
                        />
                      </label>
                    </section>
                  )}
                  <label className="approval-note">
                    Decision note
                    <textarea
                      aria-label="Admin decision note"
                      value={note}
                      maxLength={500}
                      disabled={busy}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Record what you reviewed and why you approve or reject this request."
                    />
                  </label>
                  <label className="approval-confirm">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      disabled={busy}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />{" "}
                    I reviewed the submitted fields and confirm this decision.
                  </label>
                  <div className="approval-actions">
                    <Button
                      variant="primary"
                      disabled={
                        busy ||
                        !confirmed ||
                        note.trim().length < 5 ||
                        (needsDuplicateReview &&
                          (!duplicateDecision || duplicateReason.trim().length < 5))
                      }
                      onClick={() => decide("approve")}
                    >
                      <CheckCircle2 size={16} />
                      {busy ? "Saving decision…" : "Approve & add customer"}
                    </Button>
                    <Button
                      className="approval-reject"
                      disabled={busy || !confirmed || note.trim().length < 5}
                      onClick={() => decide("reject")}
                    >
                      <XCircle size={16} /> Reject request
                    </Button>
                  </div>
                </section>
              )}
              {detail.status === "pending" && !page?.canApprove && (
                <p className="form-approval-status">
                  <Clock3 size={16} /> Awaiting admin approval. No customer has been added.
                </p>
              )}
              {detail.status !== "pending" && (
                <div className="form-approval-status">
                  <strong>
                    {detail.customerDeleted
                      ? "Previously approved · Customer profile deleted"
                      : detail.status === "approved"
                        ? `Customer saved: ${detail.customerId}`
                        : "Rejected · No customer created"}
                  </strong>
                  <p>
                    {detail.decidedBy} · {detail.decisionNote}
                  </p>
                </div>
              )}
              <section className="approval-audit">
                <h4>Request history</h4>
                {detail.events.map((event) => (
                  <div key={event.id}>
                    <strong>
                      {event.kind} · {event.actor_id}
                    </strong>
                    <small>{new Date(event.created_at).toLocaleString()}</small>
                    <p>{event.note}</p>
                  </div>
                ))}
              </section>
            </article>
          )}
        </>
      ) : (
        <>
          <div className="approval-filters">
            <label>
              Status
              <select
                aria-label="Approval request status"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setOffset(0);
                }}
              >
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="all">All requests</option>
              </select>
            </label>
            <span className="muted">{page?.total ?? 0} requests</span>
          </div>
          {loading ? (
            <p role="status">Loading approval requests…</p>
          ) : !page?.rows.length ? (
            <div className="data-empty">
              <FileCheck2 size={26} />
              <h3>No {status === "all" ? "submitted" : status} requests</h3>
              <p>
                Upload a customer form in AI Analyst, review the extraction and submit it for admin
                approval.
              </p>
            </div>
          ) : (
            <div className="approval-list">
              {page.rows.map((row) => (
                <article className="approval-request" key={row.id}>
                  <div>
                    <h3>{row.customerName}</h3>
                    <p>{row.filename}</p>
                    <small>
                      {row.requestedBy} · {new Date(row.createdAt).toLocaleString()}
                    </small>
                  </div>
                  <Badge>{row.status}</Badge>
                  <Button
                    onClick={() => {
                      setSelected(row.id);
                      setNotice("");
                    }}
                  >
                    Review request
                  </Button>
                </article>
              ))}
            </div>
          )}
          <div className="approval-actions">
            <Button
              disabled={loading || offset === 0}
              onClick={() => setOffset(Math.max(0, offset - 20))}
            >
              Previous
            </Button>
            <Button
              disabled={loading || page?.nextOffset == null}
              onClick={() => setOffset(page?.nextOffset ?? 0)}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
