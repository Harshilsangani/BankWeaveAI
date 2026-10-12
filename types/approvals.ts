import type { CustomerFields, FormDraft } from "@/types";

export interface ApprovalRequest {
  id: string;
  draftId: string;
  filename: string;
  customerName: string;
  requestedBy: string;
  status: "pending" | "approved" | "rejected";
  revision: number;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  decisionNote: string | null;
  customerId: string | null;
  customerDeleted: boolean;
  snapshotHash: string;
}
export interface ApprovalDetail extends ApprovalRequest {
  snapshot: {
    filename: string;
    markdown: string;
    fields: CustomerFields;
    provenance: FormDraft["provenance"];
    reviewRevision: number;
    duplicateDecision: "reuse" | "create_separate" | null;
    duplicateReason: string;
  };
  currentQuality: Pick<FormDraft, "revision" | "provenance" | "possibleDuplicates">;
  events: { id: string; kind: string; actor_id: string; note: string; created_at: string }[];
}
export interface ApprovalPage {
  rows: ApprovalRequest[];
  total: number;
  offset: number;
  nextOffset: number | null;
  canApprove: boolean;
}
