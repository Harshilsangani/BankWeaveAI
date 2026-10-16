import type { Investigation } from "@/features/investigations/types";
import type { Report } from "@/features/reports/types";
import type { ScenarioResult } from "@/features/reports/legacy-types";
import { post } from "@/shared/api/client";

export const generateReport = (investigation: Investigation, scenario?: ScenarioResult) =>
  post<Report>("reports", { investigation, scenario });
