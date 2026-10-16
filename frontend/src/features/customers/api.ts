import { request, post } from "@/shared/api/client";

export const getDataQuality = (dataset: string) =>
  request<import("@/features/imports/types/quality").DataQuality>(
    `data-quality?dataset=${encodeURIComponent(dataset)}`
  );

export const getCustomerKyc = (id: string) =>
  request<import("@/features/customers/types/kyc").KycCase[]>(`kyc?id=${encodeURIComponent(id)}`);

export const getRecordMaintenance = (id: string) =>
  request<import("@/features/customers/types/maintenance").Maintenance>(
    `maintenance?id=${encodeURIComponent(id)}`
  );

export const maintainRecord = (id: string, action: string, body: Record<string, unknown>) =>
  post<{ operationId: string; entityId?: string; status: string; replayed: boolean }>(
    "maintenance",
    { id, action, ...body }
  );

export const openCustomerKyc = (id: string, reason: string) =>
  post<import("@/features/customers/types/kyc").KycCase>("kyc", { id, reason });

export const reviewKyc = (
  id: string,
  body: { revision: number; status: string; kind: string; reference: string; note: string }
) =>
  request<import("@/features/customers/types/kyc").KycCase>("kyc", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...body }),
  });

export const getCustomerDetails = (id: string) =>
  request<import("@/features/customers/types/workspace").CustomerDetails>(
    `data?${new URLSearchParams({ resource: "customer", id })}`
  );

export const getCustomerDirectory = (
  q = "",
  offset = 0,
  filters: { branch?: string; source?: string; status?: string; product?: string } = {}
) =>
  request<import("@/features/customers/types/workspace").DirectoryPage>(
    `data?${new URLSearchParams({ resource: "customers", q, offset: String(offset), ...filters })}`
  );

export const getSourceRecords = (dataset: string, table: string, q = "", offset = 0) =>
  request<import("@/features/customers/types/workspace").SourcePage>(
    `data?${new URLSearchParams({ resource: "records", dataset, table, q, offset: String(offset) })}`
  );

export const saveCustomerProfile = (
  fields: import("@/features/customers/types").CustomerFields,
  profile?: import("@/features/customers/types/workspace").CustomerProfile
) =>
  request<import("@/features/customers/types/workspace").CustomerProfile>("data", {
    method: profile ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fields,
      ...(profile ? { id: profile.id, revision: profile.revision } : {}),
    }),
  });

export const deleteCustomerProfile = (
  profile: import("@/features/customers/types/workspace").CustomerProfile
) =>
  request<{ deleted: boolean }>("data", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: profile.id, revision: profile.revision }),
  });
