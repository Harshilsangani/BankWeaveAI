"use client";
import { useEffect, useState } from "react";
import { getCustomerKyc, openCustomerKyc, reviewKyc, getStaffIdentity } from "@/services";
import type { KycCase } from "@/types/kyc";
import { Badge, Button } from "@/components/ui";
function Case({
  data,
  canReview,
  onSaved,
}: {
  data: KycCase;
  canReview: boolean;
  onSaved: (data: KycCase) => void;
}) {
  const [status, setStatus] = useState(data.status),
    [kind, setKind] = useState("Reviewer note"),
    [reference, setReference] = useState(""),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => setStatus(data.status), [data.status]);
  return (
    <article className="insight-card">
      <Badge>{data.status}</Badge>
      <h3>
        {data.id} · {data.documentType}
      </h3>
      <p>
        Identity verification: not performed. Missing references:{" "}
        {data.missingEvidence.join(", ") ||
          "none recorded as missing; authenticity remains unverified"}
        .
      </p>
      {data.draftId && (
        <p className="mono">
          Form {data.draftId} · extraction revision {data.quality.revision} ·{" "}
          {data.sourceHash?.slice(0, 16)}
        </p>
      )}
      {data.quality.provenance && (
        <details>
          <summary>Extraction quality</summary>
          <ul>
            {Object.entries(data.quality.provenance).map(([field, source]) => (
              <li key={field}>
                {field}: {source.status} · {source.method} · page {source.page ?? "unavailable"} ·{" "}
                {source.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
      <details>
        <summary>Review history ({data.events.length})</summary>
        {data.events.map((event) => (
          <p key={event.id}>
            {event.created_at.slice(0, 10)} · {event.actor} · {event.kind} · {event.reference}
            <br />
            {event.note}
          </p>
        ))}
      </details>
      {canReview && (
        <div className="customer-form">
          <label>
            Status
            <select
              aria-label={"KYC status " + data.id}
              value={status}
              disabled={busy}
              onChange={(event) => setStatus(event.target.value)}
            >
              {[
                "Needs information",
                "Reviewed pending verification",
                "Rejected",
                "Closed without verification",
              ].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            Evidence type
            <select
              aria-label={"KYC evidence type " + data.id}
              value={kind}
              onChange={(event) => setKind(event.target.value)}
            >
              {["Reviewer note", "Identity proof reference", "Address proof reference"].map(
                (value) => (
                  <option key={value}>{value}</option>
                )
              )}
            </select>
          </label>
          <label>
            Evidence reference
            <input
              aria-label={"KYC reference " + data.id}
              value={reference}
              maxLength={120}
              onChange={(event) => setReference(event.target.value)}
            />
          </label>
          <label>
            Review note
            <textarea
              aria-label={"KYC note " + data.id}
              value={note}
              maxLength={500}
              rows={3}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          <Button
            disabled={
              busy || note.trim().length < 5 || (kind !== "Reviewer note" && !reference.trim())
            }
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                onSaved(
                  await reviewKyc(data.id, {
                    revision: data.revision,
                    status,
                    kind,
                    reference,
                    note,
                  })
                );
                setNote("");
                setReference("");
              } catch (error) {
                setError(error instanceof Error ? error.message : "Review failed.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Save KYC review
          </Button>
          {error && <p role="alert">{error}</p>}
        </div>
      )}
      <ul>
        {data.limitations.map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ul>
    </article>
  );
}
export function KycReview({ customerId }: { customerId: string }) {
  const [cases, setCases] = useState<KycCase[]>(),
    [canReview, setCanReview] = useState(false),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void getCustomerKyc(customerId)
      .then((value) => {
        if (active) setCases(value);
      })
      .catch((error) => {
        if (active) setError(error.message);
      });
    void getStaffIdentity().then((identity) => {
      if (active) setCanReview(identity.permissions.includes("customer_write"));
    });
    return () => {
      active = false;
    };
  }, [customerId]);
  return (
    <details className="analysis-details">
      <summary>KYC review cases</summary>
      <div>
        {error && <p role="alert">{error}</p>}
        {cases ? (
          cases.length ? (
            cases.map((data) => (
              <Case
                key={data.id}
                data={data}
                canReview={canReview}
                onSaved={(updated) =>
                  setCases((current) =>
                    current?.map((item) => (item.id === updated.id ? updated : item))
                  )
                }
              />
            ))
          ) : (
            <p>
              No review cases in this staff workspace. A profile or extracted form is not KYC
              approval.
            </p>
          )
        ) : (
          <p role="status">Loading review cases…</p>
        )}
        {canReview && (
          <div className="customer-form">
            <label>
              Reason to open a review
              <input
                aria-label="New KYC review reason"
                value={reason}
                maxLength={500}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <Button
              disabled={busy || reason.trim().length < 5}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const record = await openCustomerKyc(customerId, reason);
                  setCases((current) => [
                    record,
                    ...(current ?? []).filter((item) => item.id !== record.id),
                  ]);
                  setReason("");
                } catch (error) {
                  setError(error instanceof Error ? error.message : "Case creation failed.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Open KYC review
            </Button>
          </div>
        )}
      </div>
    </details>
  );
}
