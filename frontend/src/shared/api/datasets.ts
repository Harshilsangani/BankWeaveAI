import type { DatasetInfo } from "@/shared/types/scope";
import { request } from "@/shared/api/client";

export const getDatasets = async () =>
  (await request<DatasetInfo[]>("datasets")).map((dataset) => ({
    ...dataset,
    name: dataset.id === "meridian" ? "Meridian" : dataset.name,
  }));
