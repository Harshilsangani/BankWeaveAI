"use client";
import { useEffect, useState } from "react";
import {
  getCustomerRecommendations,
  getStaffIdentity,
  updateCustomerNeeds,
  reviewCustomerRecommendation,
} from "@/services";
import type { Recommendations as Data, CustomerNeed } from "@/types/recommendations";
import { Button, Badge } from "@/components/ui";
export function Recommendations({ customerId }: { customerId: string }) {
  const [data, setData] = useState<Data>(),
    [canWrite, setCanWrite] = useState(false),
    [canReview, setCanReview] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [consent, setConsent] = useState(false),
    [needs, setNeeds] = useState<CustomerNeed[]>([]),
    [cover, setCover] = useState(0),
    [reason, setReason] = useState(""),
    [notes, setNotes] = useState<Record<string, string>>({});
  function loaded(value: Data) {
    setData(value);
    setConsent(value.preferences.consent);
    setNeeds(value.preferences.needs);
    setCover(value.preferences.minimumCover);
  }
  useEffect(() => {
    let active = true;
    void getCustomerRecommendations(customerId)
      .then((value) => {
        if (active) loaded(value);
      })
      .catch((error) => {
        if (active) setError(error.message);
      });
    void getStaffIdentity().then((identity) => {
      if (active) {
        setCanWrite(identity.permissions.includes("customer_write"));
        setCanReview(identity.permissions.includes("analyze"));
      }
    });
    return () => {
      active = false;
    };
  }, [customerId]);
  async function save() {
    if (!data) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const saved = await updateCustomerNeeds(customerId, {
        revision: data.preferences.revision,
        consent,
        needs,
        minimumCover: cover,
        reason,
      });
      loaded(saved);
      setNotice(`Declarations saved · revision ${saved.preferences.revision}`);
      setReason("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Declaration update failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="analysis-details">
      <summary>Declared needs & staff suggestions</summary>
      <div>
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        {data ? (
          <>
            <p>
              {data.preferences.provenance} · revision {data.preferences.revision}
            </p>
            <div className="customer-form">
              <label>
                <span>Consent to suggestion review</span>
                <input
                  type="checkbox"
                  aria-label="Consent to suggestion review"
                  checked={consent}
                  disabled={!canWrite || busy}
                  onChange={(event) => setConsent(event.target.checked)}
                />
              </label>
              {(["health_cover", "repayment_support", "renewal_reminder"] as CustomerNeed[]).map(
                (need) => (
                  <label key={need}>
                    <span>{need.replaceAll("_", " ")}</span>
                    <input
                      aria-label={"Declared " + need.replaceAll("_", " ")}
                      type="checkbox"
                      checked={needs.includes(need)}
                      disabled={!canWrite || busy}
                      onChange={(event) =>
                        setNeeds((current) =>
                          event.target.checked
                            ? [...current, need]
                            : current.filter((value) => value !== need)
                        )
                      }
                    />
                  </label>
                )
              )}
              <label>
                Requested minimum health cover (₹)
                <input
                  aria-label="Requested minimum health cover"
                  type="number"
                  min={0}
                  max={100000000}
                  value={cover}
                  disabled={!canWrite || busy}
                  onChange={(event) => setCover(Number(event.target.value))}
                />
              </label>
              {canWrite && (
                <>
                  <label>
                    Reason for recording declaration
                    <input
                      aria-label="Declaration reason"
                      value={reason}
                      maxLength={500}
                      disabled={busy}
                      onChange={(event) => setReason(event.target.value)}
                    />
                  </label>
                  <Button disabled={busy || reason.trim().length < 5} onClick={() => void save()}>
                    Save declared needs
                  </Button>
                </>
              )}
            </div>
            {!data.suggestions.length && (
              <p>No suggestions from the current declared needs, consent and recorded facts.</p>
            )}
            {data.suggestions.map((item) => (
              <article className="insight-card" key={item.id}>
                <Badge>{item.status}</Badge>
                <h3>{item.title}</h3>
                <p>{item.reason}</p>
                <details>
                  <summary>Why this suggestion?</summary>
                  <pre className="source-facts">{JSON.stringify(item.sourceFacts, null, 2)}</pre>
                  <small>
                    {item.ruleVersion} · {data.runId} · {data.inputHash.slice(0, 16)}
                  </small>
                </details>
                {item.reviewNote && (
                  <p>
                    {item.reviewActor}: {item.reviewNote}
                  </p>
                )}
                {canReview && (
                  <>
                    <label className="case-note-label">
                      Review note
                      <input
                        aria-label={"Review note " + item.id}
                        value={notes[item.id] ?? ""}
                        maxLength={500}
                        disabled={busy}
                        onChange={(event) =>
                          setNotes((current) => ({ ...current, [item.id]: event.target.value }))
                        }
                      />
                    </label>
                    <div className="page-actions">
                      {["Reviewed for discussion", "Declined"].map((status) => (
                        <Button
                          key={status}
                          disabled={busy || (notes[item.id] ?? "").trim().length < 5}
                          onClick={async () => {
                            setBusy(true);
                            setError("");
                            try {
                              loaded(
                                await reviewCustomerRecommendation(customerId, item.id, {
                                  revision: item.revision,
                                  status,
                                  note: notes[item.id],
                                })
                              );
                            } catch (error) {
                              setError(error instanceof Error ? error.message : "Review failed.");
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          {status}
                        </Button>
                      ))}
                    </div>
                  </>
                )}
              </article>
            ))}
            <ul>
              {data.limitations.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
          </>
        ) : (
          <p role="status">Loading declared needs and rules…</p>
        )}
      </div>
    </details>
  );
}
