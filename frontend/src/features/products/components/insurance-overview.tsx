"use client";
import { useEffect, useState } from "react";
import { getCustomerInsurance } from "@/features/products/api";
import type { InsuranceOverview } from "@/features/products/types/insurance";
import { DataTable } from "@/shared/analytics/blocks";
import { formatMoney } from "@/shared/lib/utils";
export function Insurance({ customerId }: { customerId: string }) {
  const [data, setData] = useState<InsuranceOverview>(),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void getCustomerInsurance(customerId)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, [customerId]);
  return (
    <details className="analysis-details">
      <summary>Insurance policies & coverage</summary>
      <div>
        {error ? (
          <p role="alert">{error}</p>
        ) : data ? (
          <>
            <p>
              As of {data.asOf} ·{" "}
              {data.activeCustomers ? "Active recorded coverage" : "No active coverage recorded"}.
            </p>
            {data.rows.length ? (
              <DataTable
                data={{
                  columns: [
                    "Policy",
                    "Product",
                    "Cover",
                    "Annual premium",
                    "Expiry",
                    "Status",
                    "Nominee",
                  ],
                  rows: data.rows.map((row) => [
                    row.id,
                    row.product,
                    formatMoney(row.cover_minor / 100, "INR"),
                    formatMoney(row.premium_minor / 100, "INR"),
                    row.end_on,
                    row.effectiveStatus,
                    row.nominee_complete ? "Complete" : "Missing",
                  ]),
                }}
              />
            ) : (
              <p>No policies linked to this customer.</p>
            )}
            <ul>
              {data.limitations.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
          </>
        ) : (
          <p role="status">Loading policy observations…</p>
        )}
      </div>
    </details>
  );
}
