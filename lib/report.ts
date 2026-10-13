import type { Report } from "@/types";
import { developmentRoleHeader } from "./staff-role";
import { readBackendJson } from "@/services/backend-response";

export async function downloadResearchPdf(messageId: string) {
  const { getStaffIdentity, workspaceSessionId } = await import("@/services");
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
  const url = URL.createObjectURL(await response.blob()),
    link = document.createElement("a");
  link.href = url;
  link.download = `${messageId}-research-brief.pdf`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadReport(report: Report) {
  const { getStaffIdentity, workspaceSessionId } = await import("@/services");
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
  link.download = `${report.id}-bankweave.html`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
