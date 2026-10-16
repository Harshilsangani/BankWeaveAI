export interface Maintenance {
  customerId: string;
  policies: {
    id: string;
    product: string;
    revision: number;
    status: string;
    nominee_complete: number;
  }[];
  installments: { id: string; loan_id: string; due_on: string; remaining_minor: number }[];
  operations: {
    id: string;
    kind: string;
    entityId: string;
    status: string;
    createdAt: string;
    events: { action: string; actor: string; reason: string; created_at: string }[];
  }[];
  limitations: string[];
}
