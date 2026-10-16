/** Synthetic seed shapes; live record DTOs belong to their frontend feature. */
import type { CustomerFields } from "@/features/customers/types";

export interface Branch {
  id: string;
  name: string;
  region: string;
}

export interface Customer extends CustomerFields {
  id: string;
  branchId: string;
  ageGroup: string;
  occupation: string;
  creditScore: number;
}

export interface Account {
  id: string;
  customerId: string;
  type: string;
  balance: number;
}

export interface Transaction {
  id: string;
  accountId: string;
  customerId: string;
  branchId: string;
  month: string;
  timestamp: string;
  amount: number;
  channel: string;
  merchantCategory: string;
  deviceId: string;
  newDevice: boolean;
  flagged: boolean;
  riskScore: number;
}

export interface FraudAlert {
  id: string;
  transactionId: string;
  reason: string;
  status: "Needs review";
}

export interface Loan {
  id: string;
  customerId: string;
  branchId: string;
  type: string;
  amount: number;
  defaultMonths: string[];
}
