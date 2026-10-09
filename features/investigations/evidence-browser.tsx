"use client";
import { useState } from "react";
import { getEvidencePage } from "@/services";
import { Button } from "@/components/ui";
import { DataTable } from "@/components/blocks";
import type { QueryContext } from "@/types";

export function EvidenceBrowser({ scope }: { scope: QueryContext }) {
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
          <p>Bounded evidence pages · Original source IDs · Current scope</p>
        </div>
        {!page && (
          <Button disabled={busy} onClick={() => load(0)}>
            {busy ? "Retrieving…" : "Browse evidence"}
          </Button>
        )}
      </div>
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
