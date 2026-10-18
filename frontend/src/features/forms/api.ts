import { request, post, getStaffIdentity, workspaceSessionId } from "@/shared/api/client";
import { developmentRoleHeader } from "@/shared/lib/staff-role";
import { readBackendJson } from "@/shared/api/errors";

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

export async function downloadFormSource(id: string, filename: string) {
  await getStaffIdentity();
  const response = await fetch(`/api/forms/source?id=${encodeURIComponent(id)}`, {
    headers: {
      "x-risklens-session": workspaceSessionId(),
      "x-risklens-role": developmentRoleHeader(),
    },
  });
  if (!response.ok) await readBackendJson(response);
  const bytes = await response.arrayBuffer();
  const type = response.headers.get("Content-Type")?.split(";")[0];
  if (!type || !["application/pdf", "image/png", "image/jpeg"].includes(type))
    throw new Error("The service did not return an uploaded document.");
  const expected = response.headers.get("X-Content-SHA256");
  if (expected && globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const actual = Array.from(new Uint8Array(digest), (value) =>
      value.toString(16).padStart(2, "0")
    ).join("");
    if (actual !== expected) throw new Error("The document changed during download. Try again.");
  }
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
