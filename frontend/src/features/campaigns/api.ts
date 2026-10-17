import { developmentRoleHeader } from "@/shared/lib/staff-role";
import { request, getStaffIdentity } from "@/shared/api/client";

// Campaigns are actor-assigned records; their backend endpoints do not bind a private chat.
export const getCampaignReadiness = (period = "2026-10", datasetId = "meridian") =>
  request<import("@/features/campaigns/types").CampaignReadiness>(
    `card-campaigns/readiness?period=${encodeURIComponent(period)}&datasetId=${encodeURIComponent(datasetId)}`
  );

export const getCardProducts = (period = "2026-10") =>
  request<import("@/features/campaigns/types").CardProduct[]>(
    `card-campaigns/products?period=${encodeURIComponent(period)}`
  );

export const getCardCampaigns = () =>
  request<import("@/features/campaigns/types").CardCampaign[]>("card-campaigns");

export const getCardCampaign = (id: string) =>
  request<import("@/features/campaigns/types").CardCampaign>(
    `card-campaigns/${encodeURIComponent(id)}`
  );

export const createCardCampaign = (input: {
  requestId: string;
  title: string;
  datasetId: string;
  period: string;
  batchId: string;
  productIds: string[];
  sampleRewrites?: number;
}) =>
  request<import("@/features/campaigns/types").CardCampaign>("card-campaigns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

export const startCampaignRun = (id: string, requestId: string) =>
  request<import("@/features/campaigns/types").CampaignRun>(
    `card-campaigns/${encodeURIComponent(id)}/runs`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId }),
    }
  );

export const getCampaignRun = (id: string, runId: string) =>
  request<import("@/features/campaigns/types").CampaignRun>(
    `card-campaigns/${encodeURIComponent(id)}/runs/${encodeURIComponent(runId)}`
  );

export const cancelCampaignRun = (id: string, runId: string) =>
  request<import("@/features/campaigns/types").CampaignRun>(
    `card-campaigns/${encodeURIComponent(id)}/runs/${encodeURIComponent(runId)}/cancel`,
    { method: "POST" }
  );

export const getCampaignCandidates = (id: string, runId: string, status = "all", offset = 0) =>
  request<import("@/features/campaigns/types").CandidatePage>(
    `card-campaigns/${encodeURIComponent(id)}/runs/${encodeURIComponent(runId)}/candidates?status=${encodeURIComponent(status)}&offset=${offset}`
  );

export const getCampaignReports = () =>
  request<import("@/features/campaigns/types").CampaignReport[]>("campaign-reports");

export const getCampaignReport = (id: string) =>
  request<import("@/features/campaigns/types").CampaignReport>(
    `campaign-reports/${encodeURIComponent(id)}`
  );

export const getCampaignEmailDeliveries = (id: string) =>
  request<import("@/features/campaigns/types").CampaignEmailState>(
    `campaign-reports/${encodeURIComponent(id)}/email-deliveries`
  );

export const getCampaignEmailPreview = (id: string, customerId: string) =>
  request<import("@/features/campaigns/types").CampaignEmailPreview>(
    `campaign-reports/${encodeURIComponent(id)}/email-preview?customerId=${encodeURIComponent(customerId)}`
  );

export const sendCampaignTestEmail = (
  id: string,
  input: {
    customerId: string;
    revision: number;
    contentHash: string;
    retry?: boolean;
    presentationHash?: string;
  }
) =>
  request<import("@/features/campaigns/types").CampaignEmailReceipt>(
    `campaign-reports/${encodeURIComponent(id)}/test-email`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  );

export const reviewCampaignReport = (
  id: string,
  input: { revision: number; contentHash: string; decision: string; note: string }
) =>
  request<import("@/features/campaigns/types").CampaignReport>(
    `campaign-reports/${encodeURIComponent(id)}/review`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }
  );

export const getStaffNotifications = () =>
  request<import("@/features/campaigns/types").StaffNotification[]>("staff-notifications");

export const readStaffNotification = (id: string) =>
  request<{ read: boolean }>(`staff-notifications/${encodeURIComponent(id)}`, { method: "PATCH" });

export const removeStaffNotification = (id: string) =>
  request<{ id: string; removed: boolean }>(`staff-notifications/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

export const clearStaffNotifications = () =>
  request<{ removed: number }>("staff-notifications", { method: "DELETE" });

export const setCampaignSchedule = (id: string, enabled: boolean, revision: number) =>
  request<import("@/features/campaigns/types").CardCampaign>(
    `card-campaigns/${encodeURIComponent(id)}/schedule`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled, revision }),
    }
  );

export async function downloadCampaignReport(id: string) {
  await getStaffIdentity();
  const response = await fetch(`/api/campaign-reports/${encodeURIComponent(id)}/download`, {
    headers: { "x-risklens-role": developmentRoleHeader() },
  });
  const { readBackendJson } = await import("@/shared/api/errors");
  if (!response.ok) await readBackendJson(response);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = `${id}-card-campaign.html`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const addCardProductVersion = (input: {
  id: string;
  version: string;
  name: string;
  category: string;
  effectiveOn: string;
  annualFeeMinor: number;
  feeConditions: string;
  benefits: Record<string, string>;
  rules: import("@/features/campaigns/types").CardProduct["rules"];
}) =>
  request<import("@/features/campaigns/types").CardProduct>("card-campaigns/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
