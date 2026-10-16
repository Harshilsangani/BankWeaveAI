import type { CustomerFields } from "@/features/customers/types";
export interface CustomerProfile {
  id: string;
  fields: CustomerFields;
  status: string;
  source: string;
  createdAt: string;
  revision: string;
  master?: {
    branchId: string;
    branchName: string;
    region: string;
    occupation: string;
    creditScore: number;
    ageGroup: string;
  };
  links?: {
    accounts: number;
    loans: number;
    transactions: number;
    flagged: number;
    insurance?: number;
  };
}
export interface CustomerDetails extends CustomerProfile {
  accounts: { id: string; customer_id: string }[];
  loans: { id: string; customerId: string; type: string; principal: number }[];
  transactions: { id: string; accountId: string; amount: number; date: string; flagged: boolean }[];
}
export interface DirectoryPage {
  filters: { branches: { id: string; name: string }[] };
  rows: CustomerProfile[];
  total: number;
  offset: number;
  nextOffset: number | null;
  stats: { customers: number; synthetic: number; uploaded: number; manual: number };
}
export interface SourcePage {
  columns: string[];
  rows: (string | number)[][];
  total: number;
  offset: number;
  nextOffset: number | null;
  datasetName: string;
  currency: string;
  limitations: string[];
}
