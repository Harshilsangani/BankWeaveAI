import { request, post } from "@/shared/api/client";

export const getSavedFormReview = (id: string) =>
  request<import("@/features/forms/types").SavedFormReview>(`forms?id=${encodeURIComponent(id)}`);

export const saveFormCorrection = (
  id: string,
  fields: import("@/features/customers/types").CustomerFields
) =>
  request<
    Pick<
      import("@/features/forms/types").FormDraft,
      "revision" | "provenance" | "possibleDuplicates"
    >
  >("forms", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, fields }),
  });

export const uploadForm = (file: File) => {
  const body = new FormData();
  body.set("file", file);
  return request<import("@/features/forms/types").FormDraft>("forms", { method: "POST", body });
};

export const submitCustomerApproval = (
  draft: import("@/features/forms/types").FormDraft,
  fields: import("@/features/customers/types").CustomerFields,
  review?: {
    reviewRevision?: number;
    duplicateDecision?: "reuse" | "create_separate";
    duplicateReason?: string;
  }
) =>
  post<import("@/features/forms/types/approvals").ApprovalRequest>("customers", {
    threadId: draft.threadId,
    draftId: draft.id,
    confirmed: true,
    fields,
    ...review,
  });

export const getApprovalRequests = (status = "pending", offset = 0) =>
  request<import("@/features/forms/types/approvals").ApprovalPage>(
    `approvals?status=${encodeURIComponent(status)}&offset=${offset}`
  );

export const getApprovalRequest = (id: string) =>
  request<import("@/features/forms/types/approvals").ApprovalDetail>(
    `approvals?id=${encodeURIComponent(id)}`
  );

export const decideApprovalRequest = (
  id: string,
  body: {
    decision: "approve" | "reject";
    revision: number;
    confirmed: boolean;
    note: string;
    duplicateDecision?: "reuse" | "create_separate";
    duplicateReason?: string;
  }
) => post<import("@/features/forms/types/approvals").ApprovalDetail>("approvals", { id, ...body });
