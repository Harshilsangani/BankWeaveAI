"use client";
import { useState } from "react";
import type { InvestigationCase } from "@/features/investigations/types/cases";
import { caseTime, reviewerName } from "@/features/investigations/format";
import { Button } from "@/shared/ui/primitives";
const names: Record<string, string> = {
  opened: "Case opened",
  assignment: "Reviewer changed",
  status: "Status updated",
  note: "Review note",
  action: "Staff action",
};
export function CaseActivity({ record }: { record?: InvestigationCase }) {
  const [limit, setLimit] = useState(20);
  return (
    <section className="panel case-activity">
      <div className="chart-heading">
        <div>
          <h3>Case activity</h3>
          <p>Saved notes, review decisions, and reviewer changes.</p>
        </div>
      </div>
      {!record ? (
        <p className="case-helper">Loading case history…</p>
      ) : (
        <ol>
          {record.events
            .slice(-limit)
            .reverse()
            .map((event) => (
              <li key={event.id}>
                <div>
                  <strong>{names[event.kind] ?? "Case update"}</strong>
                  <time dateTime={event.created_at}>{caseTime(event.created_at)}</time>
                </div>
                <small>{reviewerName(event.actor_id)}</small>
                <p>{event.note}</p>
              </li>
            ))}
        </ol>
      )}
      {record && record.events.length > limit && (
        <Button onClick={() => setLimit((value) => value + 20)}>Show earlier activity</Button>
      )}
    </section>
  );
}
