import type { DatasetId } from "@/shared/types/scope";
import type { Metric, ChartPoint } from "@/shared/types/analysis";
import type { RiskEvent } from "@/features/risk/types";

export interface Dashboard {
  datasetId: DatasetId;
  period: string;
  customerCount?: number;
  metrics: Metric[];
  trend: ChartPoint[];
  regions: ChartPoint[];
  risks: RiskEvent[];
  recent: {
    id: string;
    investigationId?: string;
    title: string;
    category: string;
    status: string;
    time: string;
  }[];
  snapshot: string;
}
