import type { CustomerFields } from "@/features/customers/types";

export type SavedFormReview = Pick<
  FormDraft,
  | "id"
  | "fields"
  | "status"
  | "customerId"
  | "approval"
  | "revision"
  | "provenance"
  | "possibleDuplicates"
>;

export interface FormDraft {
  approval?: import("@/features/forms/types/approvals").ApprovalRequest | null;
  revision?: number;
  provenance?: Record<
    keyof CustomerFields,
    { page: number | null; method: string; status: string; reason: string }
  >;
  possibleDuplicates?: { customerId: string; name: string; reasons: string[] }[];
  customerId?: string;
  id: string;
  filename: string;
  sourceAvailable?: boolean;
  markdown: string;
  fields: CustomerFields;
  status: string;
  provider: "local" | "vertex";
  externalTransmission?: boolean;
  warnings: string[];
  threadId: string;
  stages: string[];
}
