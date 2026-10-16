"use client";
import { useEffect, useState } from "react";
import { Database } from "lucide-react";
import { getCampaignReadiness } from "@/features/campaigns/api";
import { Badge, Button } from "@/shared/ui/primitives";
import type { CampaignReadiness } from "@/features/campaigns/types";
export function CampaignDataReadiness() {
  const [data, setData] = useState<CampaignReadiness>();
  const [error, setError] = useState("");
  const load = () => {
    setError("");
    void getCampaignReadiness()
      .then(setData)
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : "Data readiness unavailable.")
      );
  };
  useEffect(load, []);
  return (
    <section className="panel campaign-readiness">
      <div className="campaign-section-heading">
        <div>
          <h3>
            <Database size={17} /> Campaign data readiness
          </h3>
          <p>Linked customer evidence for card campaign reports.</p>
        </div>
        <Badge>{data?.ready ? "Ready" : data ? "Missing coverage" : "Checking"}</Badge>
      </div>
      {error ? (
        <p role="alert">
          {error} <Button onClick={load}>Retry readiness</Button>
        </p>
      ) : (
        data && (
          <>
            <p>{data.reason}</p>
            {data.batch && (
              <div className="campaign-data-facts">
                <span>{data.batch.cohortSize.toLocaleString("en-IN")} existing customers</span>
                <span>
                  {data.batch.windowStart} to {data.cutoff}
                </span>
                <span>
                  {data.batch.reusedPeriods.length} reused months +{" "}
                  {data.batch.generatedPeriods.length} generated months
                </span>
              </div>
            )}
            <p className="muted">
              Synthetic credit and income observations. Email-marketing consent is recorded
              separately from declared needs.
            </p>
          </>
        )
      )}
    </section>
  );
}
