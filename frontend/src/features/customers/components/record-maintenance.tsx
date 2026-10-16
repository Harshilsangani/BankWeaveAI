"use client";
import { randomId } from "@/shared/lib/random-id";
import { useEffect, useRef, useState } from "react";
import { getRecordMaintenance, maintainRecord } from "@/features/customers/api";
import { getStaffIdentity } from "@/shared/api/client";
import type { Maintenance } from "@/features/customers/types/maintenance";
import { Button, Badge } from "@/shared/ui/primitives";
import { formatMoney } from "@/shared/lib/utils";
export function RecordMaintenance({
  customerId,
  onChanged,
}: {
  customerId: string;
  onChanged: () => void;
}) {
  const [data, setData] = useState<Maintenance>(),
    [canWrite, setCanWrite] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [action, setAction] = useState("accounts"),
    [reason, setReason] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const [product, setProduct] = useState("Health cover"),
    [cover, setCover] = useState("500000"),
    [premium, setPremium] = useState("12000"),
    [start, setStart] = useState(new Date().toISOString().slice(0, 10)),
    [end, setEnd] = useState(() => {
      const date = new Date();
      date.setUTCFullYear(date.getUTCFullYear() + 1);
      return date.toISOString().slice(0, 10);
    }),
    [nominee, setNominee] = useState(false),
    [policyId, setPolicyId] = useState(""),
    [policyStatus, setPolicyStatus] = useState("active"),
    [installment, setInstallment] = useState(""),
    [amount, setAmount] = useState(""),
    [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10)),
    [reversalReason, setReversalReason] = useState("");
  const requestKey = useRef<{ input: string; id: string } | undefined>(undefined);
  useEffect(() => {
    let active = true;
    void getRecordMaintenance(customerId)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((error) => {
        if (active) setError(error.message);
      });
    void getStaffIdentity().then((identity) => {
      if (active) setCanWrite(identity.permissions.includes("customer_write"));
    });
    return () => {
      active = false;
    };
  }, [customerId]);
  async function apply() {
    if (!data || !confirmed) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const policy = data.policies.find((row) => row.id === policyId);
      const fields: Record<string, unknown> =
        action === "policies"
          ? {
              product,
              cover,
              annualPremium: premium,
              startOn: start,
              endOn: end,
              nomineeComplete: nominee,
            }
          : action === "policy_update"
            ? {
                policyId,
                revision: policy?.revision,
                status: policyStatus,
                nomineeComplete: nominee,
              }
            : action === "payments"
              ? { installmentId: installment, amount, paidOn }
              : {};
      const input = JSON.stringify({ action, fields, reason });
      if (requestKey.current?.input !== input) requestKey.current = { input, id: randomId() };
      const receipt = await maintainRecord(customerId, action, {
        ...fields,
        requestId: requestKey.current.id,
        confirmed: true,
        reason,
      });
      setNotice(
        `${receipt.replayed ? "Saved operation recovered" : "Observation recorded"} · ${receipt.operationId} · ${receipt.entityId}`
      );
      requestKey.current = undefined;
      setConfirmed(false);
      setReason("");
      setData(await getRecordMaintenance(customerId));
      onChanged();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Recording failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="analysis-details">
      <summary>Controlled record maintenance</summary>
      <div>
        <p>
          Record synthetic account, policy or principal-payment observations. Each workflow
          validates relationships and records staff history.
        </p>
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        {data ? (
          <>
            {canWrite && (
              <form
                className="customer-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void apply();
                }}
              >
                <fieldset disabled={busy}>
                  <label>
                    Workflow
                    <select
                      aria-label="Record workflow"
                      value={action}
                      onChange={(event) => {
                        setAction(event.target.value);
                        setConfirmed(false);
                        setError("");
                      }}
                    >
                      <option value="accounts">Record account observation</option>
                      <option value="policies">Record insurance policy</option>
                      <option value="policy_update">Update policy status/nominee</option>
                      <option value="payments">Record principal payment</option>
                    </select>
                  </label>
                  {action === "policies" && (
                    <>
                      <label>
                        Product
                        <select
                          aria-label="Record policy product"
                          value={product}
                          onChange={(event) => setProduct(event.target.value)}
                        >
                          <option>Health cover</option>
                          <option>Term life</option>
                        </select>
                      </label>
                      <label>
                        Cover (₹)
                        <input
                          aria-label="Record policy cover"
                          type="number"
                          min="0.01"
                          step="0.01"
                          required
                          value={cover}
                          onChange={(event) => setCover(event.target.value)}
                        />
                      </label>
                      <label>
                        Annual premium (₹)
                        <input
                          aria-label="Record annual premium"
                          type="number"
                          min="0.01"
                          step="0.01"
                          required
                          value={premium}
                          onChange={(event) => setPremium(event.target.value)}
                        />
                      </label>
                      <label>
                        Start date
                        <input
                          type="date"
                          required
                          value={start}
                          onChange={(event) => setStart(event.target.value)}
                        />
                      </label>
                      <label>
                        End date
                        <input
                          type="date"
                          required
                          value={end}
                          onChange={(event) => setEnd(event.target.value)}
                        />
                      </label>
                    </>
                  )}
                  {action === "policy_update" && (
                    <>
                      <label>
                        Policy
                        <select
                          aria-label="Record policy to update"
                          required
                          value={policyId}
                          onChange={(event) => {
                            setPolicyId(event.target.value);
                            const row = data.policies.find((row) => row.id === event.target.value);
                            setPolicyStatus(row?.status ?? "active");
                            setNominee(Boolean(row?.nominee_complete));
                          }}
                        >
                          <option value="">Select a policy</option>
                          {data.policies.map((row) => (
                            <option key={row.id} value={row.id}>
                              {row.id} · {row.product}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Status
                        <select
                          aria-label="Record policy status"
                          value={policyStatus}
                          onChange={(event) => setPolicyStatus(event.target.value)}
                        >
                          <option value="active">Active recorded policy</option>
                          <option value="cancelled">Cancelled recorded policy</option>
                        </select>
                      </label>
                    </>
                  )}
                  {["policies", "policy_update"].includes(action) && (
                    <label>
                      <span>Nominee details complete</span>
                      <input
                        aria-label="Record nominee complete"
                        type="checkbox"
                        checked={nominee}
                        onChange={(event) => setNominee(event.target.checked)}
                      />
                    </label>
                  )}
                  {action === "payments" && (
                    <>
                      <label>
                        Installment
                        <select
                          aria-label="Record payment installment"
                          required
                          value={installment}
                          onChange={(event) => {
                            setInstallment(event.target.value);
                            const row = data.installments.find(
                              (row) => row.id === event.target.value
                            );
                            setAmount(row ? String(row.remaining_minor / 100) : "");
                          }}
                        >
                          <option value="">Select unpaid principal</option>
                          {data.installments.map((row) => (
                            <option key={row.id} value={row.id}>
                              {row.id} · {formatMoney(row.remaining_minor / 100, "INR")} due{" "}
                              {row.due_on}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Principal amount (₹)
                        <input
                          aria-label="Record principal amount"
                          type="number"
                          step="0.01"
                          min="0.01"
                          required
                          value={amount}
                          onChange={(event) => setAmount(event.target.value)}
                        />
                      </label>
                      <label>
                        Recorded payment date
                        <input
                          aria-label="Record payment date"
                          type="date"
                          required
                          value={paidOn}
                          onChange={(event) => setPaidOn(event.target.value)}
                        />
                      </label>
                    </>
                  )}
                  <label>
                    Reason
                    <input
                      aria-label="Record maintenance reason"
                      value={reason}
                      minLength={5}
                      maxLength={500}
                      required
                      onChange={(event) => setReason(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>I reviewed and confirm these synthetic observations</span>
                    <input
                      aria-label="Confirm record observation"
                      type="checkbox"
                      checked={confirmed}
                      required
                      onChange={(event) => setConfirmed(event.target.checked)}
                    />
                  </label>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={busy || !confirmed || reason.trim().length < 5}
                  >
                    Record observation
                  </Button>
                </fieldset>
              </form>
            )}
            <h3>Recorded changes</h3>
            {!data.operations.length && <p>No changes recorded in this staff workspace.</p>}
            {data.operations.map((operation) => (
              <article className="insight-card" key={operation.id}>
                <Badge>{operation.status}</Badge>
                <h4>
                  {operation.kind.replaceAll("_", " ")} · {operation.entityId}
                </h4>
                <small>
                  {operation.id} · {operation.createdAt.slice(0, 10)}
                </small>
                <details>
                  <summary>Staff history</summary>
                  {operation.events.map((event, index) => (
                    <p key={index}>
                      {event.action} · {event.actor} · {event.reason}
                    </p>
                  ))}
                </details>
                {canWrite && operation.status === "applied" && (
                  <Button
                    disabled={busy || reversalReason.trim().length < 5}
                    onClick={async () => {
                      setBusy(true);
                      setError("");
                      try {
                        await maintainRecord(customerId, "reverse", {
                          operationId: operation.id,
                          confirmed: true,
                          reason: reversalReason,
                        });
                        setNotice(`Operation reversed · ${operation.id}`);
                        setData(await getRecordMaintenance(customerId));
                        setReversalReason("");
                        onChanged();
                      } catch (error) {
                        setError(error instanceof Error ? error.message : "Reversal failed.");
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Reverse {operation.id}
                  </Button>
                )}
              </article>
            ))}
            {canWrite && data.operations.some((row) => row.status === "applied") && (
              <label className="customer-form">
                Reason for reversal
                <input
                  aria-label="Record reversal reason"
                  value={reversalReason}
                  maxLength={500}
                  onChange={(event) => setReversalReason(event.target.value)}
                />
              </label>
            )}
            <ul>
              {data.limitations.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
          </>
        ) : (
          <p role="status">Loading validated record workflows…</p>
        )}
      </div>
    </details>
  );
}
