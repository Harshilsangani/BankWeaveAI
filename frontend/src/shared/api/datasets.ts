import type { DatasetInfo } from "@/shared/types/scope";
import { request } from "@/shared/api/client";

export const getDatasets = () => request<DatasetInfo[]>("datasets");
