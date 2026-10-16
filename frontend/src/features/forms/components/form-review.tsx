"use client";
import { useEffect, useRef, useState } from "react";
import { Check, CheckCircle2, Copy, Download, FileText } from "lucide-react";
import { MarkdownContent } from "@/shared/ui/markdown";
import { Button } from "@/shared/ui/primitives";
import {
  getApprovalRequest,
  submitCustomerApproval,
  saveFormCorrection,
} from "@/features/forms/api";
import { getStaffIdentity } from "@/shared/api/client";
import type { CustomerFields } from "@/features/customers/types";
import type { FormDraft } from "@/features/forms/types";
import type { ApprovalRequest } from "@/features/forms/types/approvals";

const fieldLabels: Record<keyof CustomerFields, string> = {
  fullName: "Full name",
  dateOfBirth: "Date of birth",
  email: "Email",
  phone: "Mobile number",
  address: "Address",
  city: "City",
  state: "State",
  postalCode: "PIN / postal code",
};
export function FormReview({
  draft,
  onSaved,
  onStatusChange,
}: {
  draft: FormDraft;
  onSaved?: () => void;
  onStatusChange?: (status: string) => void;
}) {
  const [fields, setFields] = useState(draft.fields),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [saved, setSaved] = useState<string | undefined>(
    draft.status === "saved" ? draft.customerId : undefined
  );
  const [correctionStatus, setCorrectionStatus] = useState("");
  const [quality, setQuality] = useState<
    Pick<FormDraft, "revision" | "provenance" | "possibleDuplicates">
  >({
    revision: draft.revision,
    provenance: draft.provenance,
    possibleDuplicates: draft.possibleDuplicates,
  });
  const [duplicateDecision, setDuplicateDecision] = useState<"reuse" | "create_separate" | "">("");
  const [duplicateReason, setDuplicateReason] = useState("");
  const correctionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const [approval, setApproval] = useState<ApprovalRequest | null>(draft.approval ?? null);
  const [canSubmit, setCanSubmit] = useState(false);
  const locked = !!approval || draft.status !== "pending" || !!saved;
  useEffect(() => {
    let active = true;
    void getStaffIdentity()
      .then((identity) => {
        if (active) setCanSubmit(identity.permissions.includes("form_submit"));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  async function refreshApproval() {
    if (!approval) return;
    setBusy(true);
    setError("");
    try {
      const updated = await getApprovalRequest(approval.id);
      setApproval(updated);
      onStatusChange?.(
        updated.customerDeleted
          ? "deleted"
          : updated.status === "approved"
            ? "saved"
            : updated.status === "rejected"
              ? "rejected"
              : "submitted"
      );
      if (updated.customerDeleted) setSaved(undefined);
      else if (updated.status === "approved" && updated.customerId) {
        setSaved(updated.customerId);
        onSaved?.();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not refresh the request.");
    } finally {
      setBusy(false);
    }
  }
  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(draft.markdown);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
  }
  function downloadMarkdown() {
    const name = (draft.filename.split(/[\\/]/).at(-1) ?? "extracted-form")
      .replace(/\.[^.]+$/, "")
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
      .slice(0, 120)
      .trim();
    const url = URL.createObjectURL(
      new Blob([draft.markdown], { type: "text/markdown;charset=utf-8" })
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${name || "extracted-form"}.md`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  useEffect(() => {
    if (busy || locked || !canSubmit || fields === draft.fields) return;
    const timer = setTimeout(() => {
      void saveFormCorrection(draft.id, fields)
        .then((review) => {
          setQuality(review);
          setCorrectionStatus("Corrections saved");
        })
        .catch((e) => setCorrectionStatus(e.message));
    }, 400);
    correctionTimer.current = timer;
    return () => clearTimeout(timer);
  }, [fields, draft, locked, canSubmit, busy]);
  async function save() {
    setBusy(true);
    setError("");
    clearTimeout(correctionTimer.current);
    try {
      const review = await saveFormCorrection(draft.id, fields);
      setQuality(review);
      const result = await submitCustomerApproval(draft, fields, {
        reviewRevision: review.revision,
        ...(duplicateDecision ? { duplicateDecision, duplicateReason } : {}),
      });
      setApproval(result);
      onStatusChange?.("submitted");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Customer could not be saved.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="form-review">
      <div className="form-source">
        <FileText size={18} />
        <strong>{draft.filename}</strong>
        <span>
          {draft.provider === "local"
            ? "Local form reader · No external AI call"
            : "Vertex form reader · Document sent for extraction"}
        </span>
      </div>
      <section aria-label="Extracted form text">
        <MarkdownContent className="markdown-preview ocr-markdown">
          {draft.markdown}
        </MarkdownContent>
      </section>
      <div className="form-document-actions">
        <Button variant="ghost" onClick={copyMarkdown} aria-label="Copy extracted Markdown">
          {copyStatus === "copied" ? <Check size={15} /> : <Copy size={15} />}
          {copyStatus === "copied" ? "Copied" : "Copy Markdown"}
        </Button>
        <Button variant="ghost" onClick={downloadMarkdown} aria-label="Download extracted Markdown">
          <Download size={15} /> Download .md
        </Button>
        <span className="muted" role="status">
          {copyStatus === "copied"
            ? "Markdown copied to clipboard."
            : copyStatus === "error"
              ? "Copy is unavailable. Use Download .md to save the text."
              : ""}
        </span>
      </div>
      <details className="form-markdown-source">
        <summary>View Markdown source</summary>
        <pre>{draft.markdown}</pre>
      </details>
      <div className="customer-draft">
        <h3>Review customer details</h3>
        <p>
          Review the extracted fields, then send a request to an admin. Submission does not add a
          customer. Admin approval creates a profile with verification pending; account opening and
          KYC approval remain separate.
        </p>
        <div className="customer-fields">
          {(Object.keys(fieldLabels) as (keyof CustomerFields)[]).map((key) => (
            <label key={key}>
              {fieldLabels[key]}
              {(key === "fullName" || key === "dateOfBirth") && " *"}
              <input
                aria-label={`Customer ${fieldLabels[key]}`}
                type={key === "dateOfBirth" ? "date" : key === "email" ? "email" : "text"}
                value={fields[key]}
                disabled={busy || locked || !canSubmit}
                onChange={(e) => setFields((v) => ({ ...v, [key]: e.target.value }))}
              />
              {quality.provenance?.[key] && (
                <small
                  className={
                    ["missing", "invalid"].includes(quality.provenance[key].status)
                      ? "text-amber"
                      : "muted"
                  }
                >
                  {quality.provenance[key].status} ·{" "}
                  {quality.provenance[key].page
                    ? `Page ${quality.provenance[key].page}`
                    : quality.provenance[key].method}
                  <span className="field-reason">{quality.provenance[key].reason}</span>
                </small>
              )}
            </label>
          ))}
        </div>
        <ul>
          {draft.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
        {correctionStatus && (
          <p className="muted" role="status">
            {correctionStatus}
          </p>
        )}
        {!!quality.possibleDuplicates?.length && !locked && (
          <section className="duplicate-review">
            <h4>Possible existing customer</h4>
            <p>Review these matches. Nothing is merged or overwritten automatically.</p>
            {quality.possibleDuplicates.map((match) => (
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
                aria-label="Duplicate decision"
                value={duplicateDecision}
                disabled={busy || !canSubmit}
                onChange={(e) => setDuplicateDecision(e.target.value as typeof duplicateDecision)}
              >
                <option value="">Choose after review</option>
                {quality.possibleDuplicates.length === 1 && (
                  <option value="reuse">Link this form to the existing customer</option>
                )}
                <option value="create_separate">Create a separate profile</option>
              </select>
            </label>
            <label>
              Review reason
              <input
                aria-label="Duplicate review reason"
                value={duplicateReason}
                maxLength={500}
                disabled={busy || !canSubmit}
                onChange={(e) => setDuplicateReason(e.target.value)}
              />
            </label>
          </section>
        )}
        {error && (
          <p role="alert" className="text-amber">
            {error}
          </p>
        )}
        {approval && (
          <section className="form-approval-status" aria-label="Admin approval status">
            <strong>
              {approval.status === "pending"
                ? "Awaiting admin approval"
                : approval.status === "approved"
                  ? "Approved by admin"
                  : "Request rejected"}
            </strong>
            <p>
              {approval.id} · Requested by {approval.requestedBy}
            </p>
            {approval.decisionNote && (
              <p>
                {approval.decidedBy}: {approval.decisionNote}
              </p>
            )}
            {approval.status === "pending" && (
              <>
                <p>
                  No customer has been added. The admin can review this in Data Workspace → Approval
                  requests.
                </p>
                <Button disabled={busy} onClick={refreshApproval}>
                  {busy ? "Checking…" : "Refresh approval status"}
                </Button>
              </>
            )}
            {approval.status === "rejected" && (
              <p>No customer was created. Upload a corrected application to start a new request.</p>
            )}
          </section>
        )}
        {saved ? (
          <div className="customer-saved" role="status">
            <CheckCircle2 size={19} />
            <span>
              Customer saved: <strong>{saved}</strong> · Verification pending
            </span>
          </div>
        ) : draft.status === "deleted" || approval?.customerDeleted ? (
          <p className="text-amber">This customer was deleted. Start a new review.</p>
        ) : approval ? null : (
          <Button
            variant="primary"
            disabled={
              busy ||
              !canSubmit ||
              locked ||
              !fields.fullName.trim() ||
              !fields.dateOfBirth ||
              (!!quality.possibleDuplicates?.length &&
                (!duplicateDecision || duplicateReason.trim().length < 5))
            }
            onClick={save}
          >
            {busy ? "Submitting request…" : "Submit for admin approval"}
          </Button>
        )}
      </div>
    </div>
  );
}
