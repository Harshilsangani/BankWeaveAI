export interface FinancialHealth {
  asOf: string;
  version: string;
  snapshotHash: string;
  hasObservations: boolean;
  income: number;
  spending: number;
  paidPrincipal: number;
  duePrincipal: number;
  netFlow: number;
  recordedBalance: number;
  netFlowRate: number | null;
  trend: { name: string; value: number }[];
  categories: { name: string; value: number }[];
  limitations: string[];
}
