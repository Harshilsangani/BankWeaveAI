import { request } from "@/shared/api/client";

export const getCustomerRepayments = (id: string) =>
  request<import("@/features/products/types/repayments").RepaymentLedger>(
    `repayments?id=${encodeURIComponent(id)}`
  );

export const getCustomerInsurance = (id: string) =>
  request<import("@/features/products/types/insurance").InsuranceOverview>(
    `insurance?id=${encodeURIComponent(id)}`
  );

export const getCustomerRecommendations = (id: string) =>
  request<import("@/features/products/types/recommendations").Recommendations>(
    `recommendations?id=${encodeURIComponent(id)}`
  );

export const getCustomerFinancialHealth = (id: string) =>
  request<import("@/features/products/types/cashflow").FinancialHealth>(
    `financial-health?id=${encodeURIComponent(id)}`
  );

export const updateCustomerNeeds = (
  id: string,
  body: {
    revision: number;
    consent: boolean;
    needs: import("@/features/products/types/recommendations").CustomerNeed[];
    minimumCover: number;
    reason: string;
  }
) =>
  request<import("@/features/products/types/recommendations").Recommendations>("recommendations", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, action: "preferences", ...body }),
  });

export const reviewCustomerRecommendation = (
  id: string,
  recommendationId: string,
  body: { revision: number; status: string; note: string }
) =>
  request<import("@/features/products/types/recommendations").Recommendations>("recommendations", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, action: "review", recommendationId, ...body }),
  });
