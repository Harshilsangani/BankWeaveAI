"use client";
import { useEffect, useState } from "react";
import { getCustomerRepayments } from "@/services";
import { DataTable } from "@/components/blocks";
import { formatMoney } from "@/lib/utils";
import type { RepaymentLedger } from "@/types/repayments";
export function Repayments({ customerId }: { customerId: string }) {
  const [ledger, setLedger] = useState<RepaymentLedger>(),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void getCustomerRepayments(customerId)
      .then((value) => {
        if (active) setLedger(value);
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
      <summary>Repayment ledger & overdue evidence</summary>
      <div>
        {error ? (
          <p role="alert">{error}</p>
        ) : ledger ? (
          <>
            <p>
              As of {ledger.asOf} · {ledger.installments} dated installments ·{" "}
              {ledger.delinquentLoans} delinquent loans.
            </p>
            <p>
              Overdue principal {formatMoney(ledger.overduePrincipal, "INR")} · Recorded principal
              balance {formatMoney(ledger.outstandingPrincipal, "INR")}.
            </p>
            <DataTable
              data={{
                columns: [
                  "Installment",
                  "Loan",
                  "Due date",
                  "Paid principal",
                  "Overdue principal",
                  "Days overdue",
                ],
                rows: ledger.rows.map((row) => [
                  row.id,
                  row.loan_id,
                  row.due_on,
                  formatMoney(row.paid_minor / 100, "INR"),
                  formatMoney(row.overdueMinor / 100, "INR"),
                  row.daysOverdue,
                ]),
              }}
            />
            <ul>
              {ledger.limitations.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
          </>
        ) : (
          <p role="status">Loading dated repayment records…</p>
        )}
      </div>
    </details>
  );
}
