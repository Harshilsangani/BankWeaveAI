"use client";

import { useEffect, useRef, useState } from "react";
import {
  getCampaignEmailDeliveries,
  getCampaignEmailPreview,
  sendCampaignTestEmail,
} from "@/features/campaigns/api";
import type {
  CampaignEmailState,
  CampaignEmailPreview,
  CampaignReport,
} from "@/features/campaigns/types";
import { Button } from "@/shared/ui/primitives";

const labels = {
  accepted: "Accepted by mail server",
  sending: "Submitting to mail server",
  failed: "Not sent",
  unknown: "Confirmation unavailable — check inbox",
};

export function CampaignEmailDelivery({
  report,
  customerId,
}: {
  report: CampaignReport;
  customerId?: string;
}) {
  const [state, setState] = useState<CampaignEmailState>();
  const [preview, setPreview] = useState<CampaignEmailPreview>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const submitting = useRef(false);
  useEffect(() => {
    let current = true;
    setPreview(undefined);
    if (customerId)
      void getCampaignEmailPreview(report.id, customerId)
        .then((value) => {
          if (current) setPreview(value);
        })
        .catch((cause) => {
          if (current)
            setError(cause instanceof Error ? cause.message : "Email preview unavailable.");
        });
    return () => {
      current = false;
    };
  }, [report.id, report.reviewRevision, customerId, refresh]);
  useEffect(() => {
    let current = true;
    setState(undefined);
    setError("");
    void getCampaignEmailDeliveries(report.id)
      .then((value) => {
        if (current) setState(value);
      })
      .catch((cause) => {
        if (current) setError(cause instanceof Error ? cause.message : "Email status unavailable.");
      });
    return () => {
      current = false;
    };
  }, [report.id, report.reviewRevision, refresh]);
  const history =
    state?.history.filter((row) => !customerId || row.customerId === customerId) ?? [];
  const latest = history.find((row) => row.presentationHash === preview?.hash);
  const terminal = latest && latest.status !== "failed";
  async function send() {
    if (!customerId || !preview || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await sendCampaignTestEmail(report.id, {
        customerId,
        revision: report.reviewRevision,
        contentHash: report.contentHash,
        retry: latest?.status === "failed",
        presentationHash: preview.hash,
      });
      setState(
        (current) =>
          current && {
            ...current,
            remaining: Math.max(0, current.remaining - 1),
            history: [result, ...current.history.filter((row) => row.id !== result.id)],
          }
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Submission confirmation unavailable. Refresh status before trying again."
      );
      // Reload the durable claim after a lost response before permitting any new action.
      setRefresh((value) => value + 1);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="campaign-email-delivery" aria-label="Test email delivery">
      <h3>{customerId ? "Send this draft as a test" : "Test email delivery history"}</h3>
      {state ? (
        <>
          <p>
            {state.recipient
              ? `Test destination: ${state.recipient}`
              : "Configure a test destination on the backend."}{" "}
            Synthetic customer addresses are never used for sending.
          </p>
          {!state.enabled && <p>{state.reason}</p>}
          {!state.reviewed && (
            <p>Open Employee report, add a review note and choose Mark reviewed before sending.</p>
          )}
          {customerId ? (
            <>
              <p>
                A short email with the saved card benefits and fee. The preview below shows the
                email that will be sent.
              </p>
              {preview && (
                <>
                  <strong>{preview.subject}</strong>
                  <iframe
                    title="Formatted email preview"
                    sandbox=""
                    referrerPolicy="no-referrer"
                    srcDoc={preview.html}
                    className="campaign-email-preview"
                  />
                </>
              )}
              <Button
                disabled={
                  busy ||
                  !preview ||
                  !state.enabled ||
                  !state.reviewed ||
                  state.remaining < 1 ||
                  !!terminal ||
                  (latest?.attempt ?? 0) >= 3
                }
                onClick={() => void send()}
              >
                {busy
                  ? "Sending test email…"
                  : latest?.status === "failed"
                    ? "Retry test email"
                    : "Send test email"}
              </Button>
            </>
          ) : (
            <p>
              Open Email drafts → Read email draft to send one reviewed sample to the configured
              inbox.
            </p>
          )}
          <p>
            {state.remaining} test attempts remaining today. SMTP acceptance does not confirm inbox
            delivery.
          </p>
        </>
      ) : (
        !error && <p>Loading email status…</p>
      )}
      {error && <p role="alert">{error}</p>}
      <Button disabled={busy} onClick={() => setRefresh((value) => value + 1)}>
        Refresh email status
      </Button>
      {history.length > 0 && (
        <ul className="campaign-email-history">
          {history.map((row) => (
            <li key={row.id}>
              <strong>{labels[row.status]}</strong>
              <p>
                {row.recipient} · {row.customerId}
              </p>
              <p>{row.subject}</p>
              <small>
                {new Date(row.updatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} ·
                Attempt {row.attempt}
              </small>
              {row.error && <p role="status">{row.error}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
