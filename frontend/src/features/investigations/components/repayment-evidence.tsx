"use client";

import type { Investigation } from "@/features/investigations/types";
import { DataTable } from "@/shared/analytics/blocks";

const amount = (minor: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(minor / 100);

export function RepaymentEvidence({
  data,
}: {
  data: NonNullable<Investigation["repaymentEvidence"]>;
}) {
  return (
    <section className="panel repayment-evidence">
      <h3>Frozen repayment evidence</h3>
      <p className="case-helper">
        As of {data.asOf} · {data.rows.length} of {data.totalLoans} qualifying loans, ordered by
        overdue age and unpaid principal. These are the saved records; later payments do not rewrite
        this case.
      </p>
      <DataTable data={{ columns: data.columns, rows: data.rows }} />
      <details className="case-source-receipt">
        <summary>Linked installment and payment references</summary>
        {data.loans.map((loan) => (
          <section key={loan.loanId} className="repayment-source-loan">
            <h4>{loan.loanId}</h4>
            {loan.installments.map((item) => (
              <div key={item.id}>
                <strong>
                  {item.id} · Due {item.dueOn}
                </strong>
                <p>
                  {amount(item.dueMinor)} scheduled − {amount(item.paidMinor)} recorded by cutoff ={" "}
                  <strong>{amount(item.unpaidMinor)} unpaid</strong> · {item.daysPastDue} days past
                  due
                </p>
                <ul>
                  {item.payments.length ? (
                    item.payments.map((payment) => (
                      <li key={payment.id}>
                        {payment.id} · {payment.paidOn} · {amount(payment.amountMinor)}
                      </li>
                    ))
                  ) : (
                    <li>No linked payment recorded by the cutoff.</li>
                  )}
                </ul>
              </div>
            ))}
          </section>
        ))}
      </details>
    </section>
  );
}

export function RelatedPolicyGuidance({
  data,
}: {
  data: NonNullable<Investigation["policyGuidance"]>;
}) {
  return (
    <section className="panel repayment-evidence">
      <h3>Related supplied policy guidance</h3>
      <p className="case-helper">{data.limitation}</p>
      {!data.sections.length && (
        <p>
          No related policy sections were found. Obtain the applicable procedure before making a
          policy-based decision.
        </p>
      )}
      {data.sections.map((section) => (
        <details key={section.reference} className="case-source-receipt">
          <summary>
            {section.title} · {section.section}
          </summary>
          <p>{section.text}</p>
          <small>
            {section.documentId} · {section.version}
          </small>
          <p className="repayment-reference">Reference: {section.reference}</p>
        </details>
      ))}
    </section>
  );
}
