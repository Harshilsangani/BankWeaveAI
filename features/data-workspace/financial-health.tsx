"use client";
import { useEffect, useState } from "react";
import { getCustomerFinancialHealth } from "@/services";
import type { FinancialHealth as Data } from "@/types/financial-health";
import { DataTable, ChartCard } from "@/components/blocks";
import { formatMoney } from "@/lib/utils";
export function FinancialHealth({ customerId }: { customerId: string }) {
  const [data, setData] = useState<Data>(),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void getCustomerFinancialHealth(customerId)
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
      <summary>Cashflow & recorded obligations</summary>
      <div>
        {error ? (
          <p role="alert">{error}</p>
        ) : data ? (
          <>
            <p>As of {data.asOf} · Synthetic cashflow observations</p>
            {data.hasObservations ? (
              <>
                <DataTable
                  data={{
                    columns: ["Observation", "Value"],
                    rows: [
                      ["Incoming", formatMoney(data.income, "INR")],
                      ["Outgoing", formatMoney(data.spending, "INR")],
                      ["Paid loan principal", formatMoney(data.paidPrincipal, "INR")],
                      ["Due monthly principal", formatMoney(data.duePrincipal, "INR")],
                      ["Net flow", formatMoney(data.netFlow, "INR")],
                      ["Recorded synthetic balance", formatMoney(data.recordedBalance, "INR")],
                    ],
                  }}
                />
                <ChartCard
                  title="Synthetic net cashflow"
                  subtitle="INR · recorded principal payments subtracted"
                  kind="bar"
                  points={data.trend}
                />
              </>
            ) : (
              <p>
                No cashflow observations supplied. Missing data does not establish financial health.
              </p>
            )}
            <ul>
              {data.limitations.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
          </>
        ) : (
          <p role="status">Loading cashflow observations…</p>
        )}
      </div>
    </details>
  );
}
