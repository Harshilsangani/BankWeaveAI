import type { Dashboard } from "@/features/dashboard/types";
import type { DatasetScope } from "@/shared/types/scope";
import { request, scopedPath } from "@/shared/api/client";

export const getDashboard = (scope?: DatasetScope) =>
  request<Dashboard>(scopedPath("dashboard", scope));
