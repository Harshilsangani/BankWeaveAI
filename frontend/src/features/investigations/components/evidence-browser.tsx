"use client";
import { useState } from "react";
import { getEvidencePage } from "@/features/investigations/api";
import { Button } from "@/shared/ui/primitives";
import { DataTable } from "@/shared/analytics/blocks";
import type { QueryContext } from "@/shared/types/scope";
import { caseTime } from "@/features/investigations/format";

export function EvidenceBrowser({ scope, savedAt }: { scope: QueryContext; savedAt: string }) {
  const [page, setPage] = useState<Awaited<ReturnType<typeof getEvidencePage>>>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function load(offset: number) {
    setBusy(true);
    setError("");
    try {
      setPage(await getEvidencePage(scope, offset));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Evidence could not be loaded.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel evidence-browser">
      <div className="chart-heading">
        <div>
          <h3>Explore source records</h3>
          <p>Current source records · Original IDs · Same investigation scope</p>
        </div>
        {!page && (
          <Button disabled={busy} onClick={() => load(0)}>
            {busy ? "Retrieving…" : "Browse evidence"}
          </Button>
        )}
      </div>
      <p className="case-helper">
        These pages read the current database. The saved findings are from {caseTime(savedAt)} and
        retain their original evidence.
      </p>
      {error && (
        <p role="alert" className="text-amber">
          {error}
        </p>
      )}
      {page && (
        <>
          <DataTable
            data={{
              columns: page.columns,
              rows: page.rows,
            }}
          />
          <div className="evidence-pagination">
            <span>
              {page.total ? `${page.offset + 1}–${page.offset + page.rows.length}` : "0"} of{" "}
              {page.total} records
            </span>
            <Button
              disabled={busy || page.offset === 0}
              onClick={() => load(Math.max(0, page.offset - 10))}
            >
              Previous
            </Button>
            <Button
              disabled={busy || page.nextOffset === null}
              onClick={() => load(page.nextOffset!)}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
