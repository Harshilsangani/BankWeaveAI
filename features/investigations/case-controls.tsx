"use client";
import { useEffect, useState } from "react";
import { getInvestigationCase, updateInvestigationCase, getStaffIdentity } from "@/services";
import type { InvestigationCase } from "@/types/cases";
import { Badge, Button } from "@/components/ui";
export function CaseControls({ id }: { id: string }) {
  const [record, setRecord] = useState<InvestigationCase>();
  const [status, setStatus] = useState("In review"),
    [owner, setOwner] = useState("local-analyst");
  const [note, setNote] = useState(""),
    [kind, setKind] = useState<"note" | "action">("note");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [canEdit, setCanEdit] = useState(false);
  function apply(value: InvestigationCase) {
    setRecord(value);
    setStatus(value.status);
    setOwner(value.owner);
  }
  useEffect(() => {
    let active = true;
    void getInvestigationCase(id)
      .then((v) => {
        if (active) apply(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    void getStaffIdentity()
      .then((v) => {
        if (active) setCanEdit(v.permissions.includes("analyze"));
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id]);
  async function save() {
    if (!record) return;
    setBusy(true);
    setError("");
    try {
      apply(
        await updateInvestigationCase(id, { revision: record.revision, status, owner, kind, note })
      );
      setNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Case could not be saved.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel case-controls">
      <div className="chart-heading">
        <div>
          <h3>Case management</h3>
          <p>Staff review, ownership and a recorded action history.</p>
        </div>
        <Badge>{record?.status ?? "Loading"}</Badge>
      </div>
      {error && (
        <p role="alert" className="text-amber">
          {error}
        </p>
      )}
      <div className="case-fields">
        <label>
          Status
          <select
            aria-label="Case status"
            value={status}
            disabled={!record || !canEdit || busy}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option>In review</option>
            <option>Monitoring</option>
            <option>Resolved</option>
          </select>
        </label>
        <label>
          Owner
          <select
            aria-label="Case owner"
            value={owner}
            disabled={!record || !canEdit || busy}
            onChange={(e) => setOwner(e.target.value)}
          >
            <option value="local-analyst">Local analyst</option>
            <option value="local-admin">Local admin</option>
            {owner === "local-customer_operator" && (
              <option value="local-customer_operator">Analyst · existing workspace</option>
            )}
          </select>
        </label>
        <label>
          Entry type
          <select
            aria-label="Case entry type"
            disabled={!record || !canEdit || busy}
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          >
            <option value="note">Analyst note</option>
            <option value="action">Action taken by staff</option>
          </select>
        </label>
      </div>
      <label className="case-note-label">
        Review note / action
        <textarea
          aria-label="Case note"
          disabled={!record || !canEdit || busy}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={2000}
          placeholder="Record the evidence reviewed and your action. This does not execute a banking control."
        />
      </label>
      <Button disabled={!record || !canEdit || busy} onClick={save}>
        {busy ? "Saving…" : "Save case update"}
      </Button>
      <div className="case-events">
        {record?.events
          .slice()
          .reverse()
          .map((event) => (
            <article key={event.id}>
              <strong>
                {event.kind} · {event.actor_id}
              </strong>
              <small>{new Date(event.created_at).toLocaleString()}</small>
              <p>{event.note}</p>
            </article>
          ))}
      </div>
    </section>
  );
}
