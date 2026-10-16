import type { Report } from "@/features/reports/types";
import { developmentRoleHeader } from "@/shared/lib/staff-role";
import { readBackendJson } from "@/shared/api/errors";
import { reportFilename, researchPdfFilename } from "@/features/reports/filename";
import type { QueryContext } from "@/shared/types/scope";

export async function downloadResearchPdf(
  messageId: string,
  context?: QueryContext,
  bankName?: string
) {
  const { getStaffIdentity, workspaceSessionId } = await import("@/shared/api/client");
  await getStaffIdentity();
  const response = await fetch(`/api/analyst/export?id=${encodeURIComponent(messageId)}`, {
    headers: {
      "x-risklens-session": workspaceSessionId(),
      "x-risklens-role": developmentRoleHeader(),
    },
  });
  if (!response.ok) {
    await readBackendJson(response);
  }
  const bytes = await response.arrayBuffer();
  if (
    !response.headers.get("Content-Type")?.includes("application/pdf") ||
    new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-"
  )
    throw new Error("The service returned a damaged PDF. Please export again.");
  const expected = response.headers.get("X-Content-SHA256");
  if (expected && globalThis.crypto?.subtle) {
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    const actual = Array.from(new Uint8Array(hash), (value) =>
      value.toString(16).padStart(2, "0")
    ).join("");
    if (actual !== expected)
      throw new Error("The PDF changed during download. Please export again.");
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })),
    link = document.createElement("a");
  link.href = url;
  link.download = researchPdfFilename(bankName, context?.datasetId);
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadReport(report: Report) {
  const { getStaffIdentity, workspaceSessionId } = await import("@/shared/api/client");
  await getStaffIdentity();
  const response = await fetch(`/api/reports/download?id=${encodeURIComponent(report.id)}`, {
    headers: {
      "x-risklens-session": workspaceSessionId(),
      "x-risklens-role": developmentRoleHeader(),
    },
  });
  if (!response.ok) {
    await readBackendJson(response);
  }
  const url = URL.createObjectURL(await response.blob()),
    link = document.createElement("a");
  link.href = url;
  link.download = reportFilename(report.investigation.scope.datasetId, report.title, "html");
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
