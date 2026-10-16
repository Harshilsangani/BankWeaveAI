export type Domain = "fraud" | "loans";

export type DatasetId = "meridian" | "bankshield";

export interface DatasetInfo {
  id: DatasetId;
  name: string;
  currency: "INR" | "USD";
  version: string;
  source: string;
  sourceUrl?: string | null;
  periods: string[];
  regions: string[];
  limitations: string[];
  coverage: {
    transactions: number;
    customers: number;
    accounts: number;
    alerts: number;
    missingDates: number;
    missingAccounts: number;
    missingAlertTransactions: number;
    completeCustomerChains: number;
  };
}

export interface QueryContext {
  view?: "customer_ranking" | "customer_summary";
  ranking?: "transaction_value" | "transaction_count" | "loan_principal";
  limit?: number;
  customerId?: string;
  research?: boolean;
  datasetId?: DatasetId;
  period?: string;
  domain: Domain;
  region?: string;
  comparison?: string;
  minAmount?: number;
  newDeviceOnly?: boolean;
  riskId?: string;
}
export type DatasetScope = Pick<QueryContext, "datasetId" | "period">;
