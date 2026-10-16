import { request, post } from "@/shared/api/client";

export const previewTransactionImport = (datasetId: string, csv: string) =>
  post<import("@/features/imports/types/quality").ImportPreview>("data-quality", {
    action: "preview",
    datasetId,
    csv,
  });

export const getImportSchema = (dataset: string) =>
  request<import("@/features/imports/types").ImportSchema>(
    `imports?resource=schema&dataset=${encodeURIComponent(dataset)}`
  );

export const getImportHistory = (dataset: string) =>
  request<import("@/features/imports/types").ImportHistory[]>(
    `imports?resource=history&dataset=${encodeURIComponent(dataset)}`
  );

export const uploadBankingFile = (datasetId: string, file: File) => {
  const form = new FormData();
  form.set("datasetId", datasetId);
  form.set("file", file);
  return request<import("@/features/imports/types").ImportUpload>("imports", {
    method: "POST",
    body: form,
  });
};

export const reviewBankingImport = (body: {
  uploadId: string;
  entity: import("@/features/imports/types").ImportEntity;
  sheet: string;
  mapping: Record<string, string>;
  timezone: "+05:30" | "+00:00";
}) =>
  post<import("@/features/imports/types").FileImportPreview>("imports", {
    action: "review",
    ...body,
  });

export const applyBankingImport = (preview: import("@/features/imports/types").FileImportPreview) =>
  post<{
    previewId: string;
    entity: import("@/features/imports/types").ImportEntity;
    importedRows: number;
    replayed: boolean;
  }>("imports", {
    action: "apply",
    previewId: preview.id,
    sourceHash: preview.sourceHash,
    confirmed: true,
  });

export const confirmTransactionImport = (
  preview: import("@/features/imports/types/quality").ImportPreview
) =>
  post<{ importedRows: number; replayed: boolean }>("data-quality", {
    action: "confirm",
    previewId: preview.id,
    sourceHash: preview.sourceHash,
    confirmed: true,
  });
