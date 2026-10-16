"use client";
import { useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { getInvestigationSource } from "@/features/investigations/api";
import type { CaseSourceStatus } from "@/features/investigations/types/cases";
import { caseTime } from "@/features/investigations/format";
import { Button } from "@/shared/ui/primitives";
export function SourceStatus({ id }: { id: string }) {
  const [data, setData] = useState<CaseSourceStatus>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, [id]);
  async function check() {
    setBusy(true);
    setError("");
    try {
      const value = await getInvestigationSource(id);
      if (active.current) setData(value);
    } catch (error) {
      if (active.current)
        setError(error instanceof Error ? error.message : "Source changes could not be checked.");
    } finally {
      if (active.current) setBusy(false);
    }
  }
  return (
    <div className="case-source-status">
      <div>
        <ShieldCheck size={17} />
        <p>
          The investigation keeps its saved evidence. Check whether the source dataset has changed
          before reviewing current record pages.
        </p>
      </div>
      <Button disabled={busy} onClick={() => void check()}>
        {busy ? "Checking source…" : "Check source changes"}
      </Button>
      {error && <p role="alert">{error}</p>}
      {data && (
        <p role="status" className={"source-state source-" + data.state}>
          {data.reason}
          <small>Checked {caseTime(data.checkedAt)}</small>
        </p>
      )}
    </div>
  );
}
