export interface InsuranceOverview {
  asOf: string;
  version: string;
  snapshotHash: string;
  activeCustomers: number;
  withoutActiveCoverage: number;
  expiringSoon: number;
  missingNominee: number;
  limitations: string[];
  rows: {
    id: string;
    customer_id: string;
    product: string;
    cover_minor: number;
    premium_minor: number;
    start_on: string;
    end_on: string;
    effectiveStatus: string;
    nominee_complete: number;
    revision: number;
  }[];
}
