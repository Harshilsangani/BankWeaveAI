"use client";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { getInvestigationCase, updateInvestigationCase } from "@/features/investigations/api";
import { getStaffIdentity, workspaceSessionId } from "@/shared/api/client";
import type { InvestigationCase } from "@/features/investigations/types/cases";
import { caseTime, reviewerName } from "@/features/investigations/format";
import { Badge, Button } from "@/shared/ui/primitives";
export function CaseControls({
  id,
  onRecordChange,
  onDirtyChange,
}: {
  id: string;
  onRecordChange: (record: InvestigationCase) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [record, setRecord] = useState<InvestigationCase>();
  const [status, setStatus] = useState("In review");
  const [owner, setOwner] = useState("local-analyst");
  const [note, setNote] = useState("");
  const [kind, setKind] = useState<"note" | "action">("note");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [canAssign, setCanAssign] = useState(false);
  const active = useRef(true);
  const draftKey = useRef<string | undefined>(undefined);
  function apply(value: InvestigationCase) {
    setRecord(value);
    setStatus(value.status);
    setOwner(value.owner);
    onRecordChange(value);
  }
  useEffect(() => {
    active.current = true;
    void Promise.all([getInvestigationCase(id), getStaffIdentity()])
      .then(([value, identity]) => {
        if (!active.current) return;
        apply(value);
        setCanEdit(identity.permissions.includes("analyze"));
        setCanAssign(identity.adapter === "development");
        draftKey.current = "bankweave-case-draft-" + workspaceSessionId() + "-" + id;
        if (!identity.permissions.includes("analyze")) return;
        try {
          const draft = JSON.parse(sessionStorage.getItem(draftKey.current) ?? "null");
          if (draft && typeof draft.note === "string" && draft.note.length <= 2000) {
            setNote(draft.note);
            setKind(draft.kind === "action" ? "action" : "note");
            if (draft.revision === value.revision) {
              if (["In review", "Monitoring", "Resolved"].includes(draft.status))
                setStatus(draft.status);
              if (
                identity.adapter === "development" &&
                ["local-analyst", "local-admin", "local-customer_operator"].includes(draft.owner)
              )
                setOwner(draft.owner);
            }
            setNotice("Unsaved review draft restored. It has not been saved to the case.");
          }
        } catch {
          /* Browser storage is optional; the active form still works. */
        }
      })
      .catch((error) => {
        if (active.current) setError(error.message);
      });
    return () => {
      active.current = false;
    };
    // This panel is keyed by case ID so each case has its own draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  const dirty = Boolean(
    record && (status !== record.status || owner !== record.owner || note.trim())
  );
  useEffect(() => {
    if (!draftKey.current || !record || !canEdit) return;
    try {
      if (dirty)
        sessionStorage.setItem(
          draftKey.current,
          JSON.stringify({ revision: record.revision, status, owner, note, kind })
        );
      else sessionStorage.removeItem(draftKey.current);
    } catch {
      /* Preserve the current-page draft even if browser storage is unavailable. */
    }
  }, [record, canEdit, dirty, status, owner, note, kind]);
  const conflict = error.includes("case changed");
  useEffect(() => {
    onDirtyChange(dirty || busy || conflict);
  }, [dirty, busy, conflict, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const resolutionNeedsNote =
    status === "Resolved" && record?.status !== "Resolved" && !note.trim();
  async function reload() {
    setRefreshing(true);
    setError("");
    setNotice("");
    try {
      const value = await getInvestigationCase(id);
      if (active.current) {
        apply(value);
        setNotice("Latest case loaded. Your draft note was kept.");
      }
    } catch (error) {
      if (active.current)
        setError(error instanceof Error ? error.message : "The case could not be loaded.");
    } finally {
      if (active.current) setRefreshing(false);
    }
  }
  async function save() {
    if (!record || !dirty || resolutionNeedsNote) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const value = await updateInvestigationCase(id, {
        revision: record.revision,
        kind,
        note: note.trim(),
        ...(status !== record.status ? { status } : {}),
        ...(owner !== record.owner ? { owner } : {}),
      });
      if (active.current) {
        apply(value);
        setNote("");
        setNotice("Case update saved.");
      }
    } catch (error) {
      if (active.current)
        setError(error instanceof Error ? error.message : "Case could not be saved.");
    } finally {
      if (active.current) setBusy(false);
    }
  }
  const locked = !record || !canEdit || busy || refreshing;
  return (
    <section className="panel case-controls">
      <div className="chart-heading">
        <div>
          <h3>Your review</h3>
          <p>Save a decision and the reason behind it.</p>
        </div>
        <Badge>{record?.status ?? "Loading"}</Badge>
      </div>
      {error && (
        <div className="case-message" role="alert">
          <span>{error}</span>
          <Button disabled={busy || refreshing} onClick={() => void reload()}>
            Load latest case
          </Button>
        </div>
      )}
      {notice && (
        <p className="case-save-notice" role="status">
          <CheckCircle2 size={14} />
          {notice}
        </p>
      )}
      <div className="case-fields">
        <label>
          Status
          <select
            aria-label="Case status"
            value={status}
            disabled={locked}
            onChange={(event) => {
              setStatus(event.target.value);
              setNotice("");
            }}
          >
            <option>In review</option>
            <option>Monitoring</option>
            <option>Resolved</option>
          </select>
        </label>
        <label>
          Reviewer
          <select
            aria-label="Case owner"
            value={owner}
            disabled={locked || !canAssign}
            onChange={(event) => {
              setOwner(event.target.value);
              setNotice("");
            }}
          >
            {canAssign ? (
              <>
                <option value="local-analyst">Local analyst</option>
                <option value="local-admin">Local admin</option>
                {owner === "local-customer_operator" && (
                  <option value="local-customer_operator">Local analyst · current reviewer</option>
                )}
              </>
            ) : (
              <option value={owner}>{reviewerName(owner)}</option>
            )}
          </select>
        </label>
        <label>
          Entry type
          <select
            aria-label="Case entry type"
            value={kind}
            disabled={locked}
            onChange={(event) => setKind(event.target.value as typeof kind)}
          >
            <option value="note">Review note</option>
            <option value="action">Action recorded by staff</option>
          </select>
        </label>
      </div>
      <label className="case-note-label">
        {status === "Resolved" && record?.status !== "Resolved"
          ? "Resolution note"
          : "Review note / action"}
        <textarea
          aria-label="Case note"
          aria-required={status === "Resolved" && record?.status !== "Resolved"}
          disabled={locked}
          value={note}
          onChange={(event) => {
            setNote(event.target.value);
            setNotice("");
          }}
          maxLength={2000}
          rows={4}
          placeholder="What did you review, what did you conclude, and what needs follow-up?"
        />
      </label>
      {resolutionNeedsNote && (
        <p className="case-helper">Add a resolution note before marking this case resolved.</p>
      )}
      <div className="case-save-actions">
        <Button
          variant="primary"
          disabled={locked || !dirty || resolutionNeedsNote || conflict}
          onClick={() => void save()}
        >
          {busy ? "Saving…" : "Save case update"}
        </Button>
        {dirty && (
          <Button
            variant="ghost"
            disabled={busy || refreshing}
            onClick={() => {
              if (record) {
                setStatus(record.status);
                setOwner(record.owner);
              }
              setNote("");
              setKind("note");
            }}
          >
            Discard draft
          </Button>
        )}
        {!dirty && !error && (
          <Button
            variant="ghost"
            disabled={busy || refreshing}
            aria-label="Reload case management"
            onClick={() => void reload()}
          >
            <RotateCcw size={14} />
          </Button>
        )}
      </div>
      <p className="case-helper">
        {dirty
          ? "Unsaved review changes. Save or discard them before exporting."
          : record
            ? "Revision " + record.revision + " · Review decisions do not execute banking actions."
            : "Loading the saved review…"}
      </p>
      {!canEdit && record && (
        <p className="case-helper">Viewer access · Case updates require an Analyst or Admin.</p>
      )}
      <div className="case-events" aria-label="Recent case activity">
        {record?.events
          .slice(-3)
          .reverse()
          .map((event) => (
            <article key={event.id}>
              <strong>
                {event.kind === "note"
                  ? "Review note"
                  : event.kind === "action"
                    ? "Staff action"
                    : event.kind === "opened"
                      ? "Case opened"
                      : event.kind === "assignment"
                        ? "Reviewer changed"
                        : "Status updated"}{" "}
                · {reviewerName(event.actor_id)}
              </strong>
              <small>{caseTime(event.created_at)}</small>
              <p>{event.note}</p>
            </article>
          ))}
      </div>
    </section>
  );
}
