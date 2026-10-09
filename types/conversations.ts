import type { DatasetId } from "./index";

export interface ConversationSummary {
  id: string;
  title: string;
  datasetId: DatasetId;
  period: string | null;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}
