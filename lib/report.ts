import type { Report } from "@/types";

export async function downloadReport(report: Report) {
  const { workspaceSessionId } = await import("@/services");
  const response = await fetch(`/api/reports/download?id=${encodeURIComponent(report.id)}`, {
    headers: {
      "x-risklens-session": workspaceSessionId(),
      "x-risklens-role": localStorage.getItem("risklens-role") ?? "customer_operator",
    },
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error ?? "Report download failed.");
  }
  const url = URL.createObjectURL(await response.blob()),
    link = document.createElement("a");
  link.href = url;
  link.download = `${report.id}-bankweave.html`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
