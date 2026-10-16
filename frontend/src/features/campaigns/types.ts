export interface CampaignReadiness {
  ready: boolean;
  datasetId: string;
  period: string;
  cutoff: string;
  reason: string;
  batch: null | {
    id: string;
    cohortSize: number;
    windowStart: string;
    windowEnd: string;
    manifestHash: string;
    reusedPeriods: string[];
    generatedPeriods: string[];
    generatorVersion: string;
  };
  limitations?: string[];
}
export interface CardProduct {
  id: string;
  version: string;
  name: string;
  category: "travel" | "cashback" | "entry";
  annualFeeMinor: number;
  feeConditions: string;
  benefits: Record<string, string>;
  rules: {
    minScore: number | null;
    minIncomeMinor: number;
    maxDebtRatioBps: number;
    minCategoryShareBps: number;
    category: string;
    collateralMinor: number;
  };
  disclosure: string;
}
export interface CampaignCounts {
  selected: number;
  analyzed: number;
  insufficientData: number;
  prospects: number;
  noMatch: number;
  contactable: number;
  suppressed: number;
  drafts: number;
  emailsSent: number;
}
export interface CampaignRun {
  id: string;
  campaignId: string;
  campaignRevision: number;
  period: string;
  batchId: string;
  status:
    | "queued"
    | "validating"
    | "building_features"
    | "matching"
    | "drafting"
    | "reporting"
    | "ready"
    | "failed"
    | "cancelled";
  stage: string;
  attempt: number;
  counts?: CampaignCounts;
  modelCalls: number;
  warning?: string;
  error?: string;
  reportId?: string;
  cancelRequested: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface CardCampaign {
  id: string;
  title: string;
  revision: number;
  owner: string;
  recipients: string[];
  configuration: {
    datasetId: string;
    period: string;
    batchId: string;
    productIds: string[];
    sampleRewrites: number;
    scheduleStatus?: string;
  };
  createdAt: string;
  scheduleEnabled: boolean;
  scheduleTimezone: string;
  runs?: CampaignRun[];
}
export interface CampaignDraft {
  subject: string;
  body: string;
  provider: string;
  model?: string;
  templateVersion?: string;
}
export interface CampaignCandidate {
  customerId: string;
  name: string;
  email?: string;
  status: "prospect" | "no_match" | "insufficient_data";
  reasonCode: string;
  productId?: string;
  productVersion?: string;
  contactStatus: string;
  contactReason: string;
  currentContactStatus: string;
  currentContactReason: string;
  evidence: {
    reasons: string[];
    alternatives: string[];
    features: {
      averageIncomeMinor: number;
      debtRatioBps: number | null;
      score: number | null;
      cutoff: string;
      limitations: string[];
    };
  };
  draft?: CampaignDraft;
}
export interface CandidatePage {
  rows: CampaignCandidate[];
  total: number;
  offset: number;
  nextOffset: number | null;
}
export interface CampaignReport {
  id: string;
  kind: "card_campaign";
  runId: string;
  campaignId: string;
  title: string;
  period: string;
  cutoff: string;
  windowStart: string;
  campaignRevision: number;
  createdAt: string;
  counts: CampaignCounts;
  products: {
    id: string;
    name: string;
    version: string;
    prospects: number;
    drafts: number;
    annualFeeMinor: number;
    feeConditions: string;
  }[];
  exclusions: { reason: string; count: number }[];
  sampleDrafts?: (CampaignDraft & { customerId: string })[];
  providers: { provider: string; model?: string; count: number }[];
  modelCalls: number;
  warnings: string[];
  limitations: string[];
  source?: {
    batchId: string;
    batchHash: string;
    rulesVersion: string;
    templateVersion: string;
    reusedPeriods: string[];
    generatedPeriods: string[];
    productHashes: Record<string, string>;
  };
  contentHash: string;
  reviewStatus: "pending_review" | "reviewed" | "changes_requested" | "rejected";
  reviewRevision: number;
  canReview: boolean;
  canReadDetails?: boolean;
  reviewEvents?: { decision: string; note: string; actor_id: string; created_at: string }[];
}
export interface StaffNotification {
  id: string;
  reportId: string;
  title: string;
  readAt?: string;
  createdAt: string;
}
