"use client";
import { useEffect, useState } from "react";
import { getStaffIdentity, runDetection } from "@/services";
import { RotateCcw, ShieldCheck } from "lucide-react";
import type { RiskEvent } from "@/types";
import { RiskCard } from "@/components/blocks";
import { Button, EmptyState } from "@/components/ui";
export function Radar({
  risks,
  dismissed,
  onDismiss,
  onRestore,
  onInvestigate,
  onEvidence,
  onRefresh,
}: {
  risks: RiskEvent[];
  dismissed: string[];
  onDismiss: (id: string) => void;
  onRestore: () => void;
  onInvestigate: (id: string) => void;
  onEvidence: (risk: RiskEvent) => void;
  onRefresh: () => void;
}) {
  const [canRun, setCanRun] = useState(false),
    [running, setRunning] = useState(false),
    [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    void getStaffIdentity()
      .then((identity) => {
        if (active) setCanRun(identity.permissions.includes("analyze"));
      })
      .catch(() => {
        if (active) setNotice("Staff permissions could not be loaded. Reload to start a task.");
      });
    return () => {
      active = false;
    };
  }, []);
  const [filter, setFilter] = useState("All signals");
  const visible = risks.filter(
    (r) =>
      !dismissed.includes(r.id) &&
      (filter === "All signals" ||
        (filter === "High severity" && r.severity === "high") ||
        (filter === "Credit risk" && r.category === "loans"))
  );
  return (
    <div className="animate-in">
      <div className="page-heading">
        <div>
          <h1>Risk Radar</h1>
          <p>A prioritized view of the risks emerging across your bank.</p>
        </div>
        <div className="page-actions">
          {canRun && (
            <Button
              disabled={running}
              onClick={async () => {
                setRunning(true);
                try {
                  const result = await runDetection();
                  setNotice(
                    `${result.replayed ? "Existing snapshot reused" : "Detection completed"} · ${result.id}`
                  );
                  onRefresh();
                } catch (error) {
                  setNotice(error instanceof Error ? error.message : "Detection failed.");
                } finally {
                  setRunning(false);
                }
              }}
            >
              {running ? "Running detection…" : "Run detection"}
            </Button>
          )}
          {dismissed.length > 0 && (
            <Button onClick={onRestore} disabled={!canRun}>
              <RotateCcw size={14} />
              Restore dismissed
            </Button>
          )}
        </div>
      </div>
      {notice && (
        <p role="status" className="muted">
          {notice}
        </p>
      )}
      <div className="filter-bar">
        <div className="filter-tabs" aria-label="Filter risk events">
          {["All signals", "High severity", "Credit risk"].map((f) => (
            <button
              key={f}
              className={filter === f ? "active" : ""}
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
        <span>{visible.length} signals · September 2026 snapshot</span>
      </div>
      {visible.length ? (
        <div className="risk-grid">
          {visible.map((r) => (
            <RiskCard
              key={r.id}
              risk={r}
              onInvestigate={onInvestigate}
              onEvidence={onEvidence}
              onDismiss={canRun ? onDismiss : undefined}
              disabled={!canRun}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No signals in this view"
          text="Try another filter or restore dismissed signals."
        />
      )}
      <p className="risk-footnote">
        <ShieldCheck size={14} className="inline mr-2" />
        Dismissal is saved for this workspace and recorded with the staff actor and source snapshot.
        All alerts are synthetic and require human review.
      </p>
    </div>
  );
}
