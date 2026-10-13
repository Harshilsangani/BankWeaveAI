export type Page =
  | "Command Center"
  | "AI Analyst"
  | "Data Workspace"
  | "Risk Radar"
  | "Investigations"
  | "Scenario Simulator"
  | "Reports"
  | "Knowledge"
  | "Settings";
export type Domain = "fraud" | "loans";
export type DatasetId = "meridian" | "bankshield";
export interface CustomerFields {
  fullName: string;
  dateOfBirth: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
}
export interface FormDraft {
  approval?: import("./approvals").ApprovalRequest | null;
  revision?: number;
  provenance?: Record<
    keyof CustomerFields,
    { page: number | null; method: string; status: string; reason: string }
  >;
  possibleDuplicates?: { customerId: string; name: string; reasons: string[] }[];
  customerId?: string;
  id: string;
  filename: string;
  markdown: string;
  fields: CustomerFields;
  status: string;
  provider: "local" | "vertex";
  externalTransmission?: boolean;
  warnings: string[];
  threadId: string;
  stages: string[];
}
export interface DatasetInfo {
  id: DatasetId;
  name: string;
  currency: "INR" | "USD";
  version: string;
  source: string;
  sourceUrl?: string | null;
  periods: string[];
  regions: string[];
  limitations: string[];
  coverage: {
    transactions: number;
    customers: number;
    accounts: number;
    alerts: number;
    missingDates: number;
    missingAccounts: number;
    missingAlertTransactions: number;
    completeCustomerChains: number;
  };
}
export interface AnalysisMetadata {
  datasetId: DatasetId;
  datasetName: string;
  period: string;
  baseline: string;
  currency: "INR" | "USD";
  provider: "local" | "vertex";
  model?: string;
  location?: string;
  datasetVersion: string;
  runId: string;
  stages: string[];
  externalTransmission: boolean;
  outboundFields: string[];
  limitations: string[];
  coverage: DatasetInfo["coverage"];
}
export interface AIProviderStatus {
  provider: "local" | "vertex";
  model?: string | null;
  location?: string | null;
}
export type Severity = "high" | "medium" | "low";
export interface Branch {
  id: string;
  name: string;
  region: string;
}
export interface Customer extends CustomerFields {
  id: string;
  branchId: string;
  ageGroup: string;
  occupation: string;
  creditScore: number;
}
export interface Account {
  id: string;
  customerId: string;
  type: string;
  balance: number;
}
export interface Transaction {
  id: string;
  accountId: string;
  customerId: string;
  branchId: string;
  month: string;
  timestamp: string;
  amount: number;
  channel: string;
  merchantCategory: string;
  deviceId: string;
  newDevice: boolean;
  flagged: boolean;
  riskScore: number;
}
export interface Loan {
  id: string;
  customerId: string;
  branchId: string;
  type: string;
  amount: number;
  defaultMonths: string[];
}
export interface FraudAlert {
  id: string;
  transactionId: string;
  reason: string;
  status: "Needs review";
}
export interface Metric {
  label: string;
  value: string;
  change: string;
  direction: "up" | "down" | "neutral";
  detail: string;
  sparkline?: number[];
}
export interface ChartPoint {
  name: string;
  value: number;
  baseline?: number;
}
export interface Evidence {
  id: string;
  title: string;
  source: string;
  detail: string;
  records: string[];
}
export interface RiskEvent {
  detection?: {
    runId: string;
    rulesVersion: string;
    inputHash: string;
    sourceVersion: string;
    sourceCounts: Record<string, number>;
    threshold: { name: string; minCount: number; minIncreasePct: number | null };
    currentCount: number;
    baselineCount: number;
    observedIncreasePct: number | null;
    executedAt: string;
    scope: QueryContext;
  };
  currency?: "INR" | "USD";
  id: string;
  title: string;
  category: Domain;
  severity: Severity;
  status: "Open" | "Investigating" | "Dismissed";
  metric: string;
  changePercentage: number;
  affectedRecords: number;
  estimatedExposure: number;
  detectedAt: string;
  confidence: number;
  summary: string;
  evidence: Evidence[];
}
export interface TableData {
  columns: string[];
  rows: (string | number)[][];
}
export type ResponseBlock =
  | { type: "FORM"; draft: FormDraft }
  | { type: "TEXT"; text: string }
  | { type: "KPI"; metrics: Metric[] }
  | {
      type: "CHART";
      title: string;
      subtitle: string;
      kind: "area" | "bar" | "column" | "donut";
      tone?: "research";
      points: ChartPoint[];
    }
  | { type: "TABLE"; title: string; data: TableData }
  | { type: "INSIGHT"; title: string; text: string }
  | { type: "EVIDENCE"; evidence: Evidence[] }
  | { type: "ACTION"; label: string; action: "investigate" | "simulate" | "report"; riskId: string }
  | { type: "REPORT"; report: Report }
  | { type: "COMPARISON"; result: ScenarioResult };
export interface QueryContext {
  view?: "customer_ranking" | "customer_summary";
  ranking?: "transaction_value" | "transaction_count" | "loan_principal";
  limit?: number;
  customerId?: string;
  research?: boolean;
  datasetId?: DatasetId;
  period?: string;
  domain: Domain;
  region?: string;
  comparison?: string;
  minAmount?: number;
  newDeviceOnly?: boolean;
  riskId?: string;
}
export interface AnalystResponse {
  analysis?: AnalysisMetadata;
  id: string;
  question: string;
  title: string;
  blocks: ResponseBlock[];
  suggestions: string[];
  research?: boolean;
  context: QueryContext;
  timestamp: string;
}
export interface Investigation {
  relationshipGraph?: import("./relationships").RelationshipGraph;
  analysis?: AnalysisMetadata;
  id: string;
  risk: RiskEvent;
  scope: QueryContext;
  title: string;
  createdAt: string;
  status: string;
  metrics: Metric[];
  trend: ChartPoint[];
  segments: TableData;
  evidence: Evidence[];
  findings: string[];
  actions: string[];
  timeline: { time: string; title: string; detail: string }[];
}
export interface ScenarioInput {
  riskId: string;
  coverage: number;
  effectiveness: number;
  friction: number;
  scope?: QueryContext;
}
export interface ScenarioResult {
  input: ScenarioInput;
  baseline: number;
  projected: number;
  reduction: number;
  affected: number;
  challenged: number;
  abandoned: number;
  assumptions: string[];
}
export interface Report {
  id: string;
  title: string;
  createdAt: string;
  investigation: Investigation;
  scenario?: ScenarioResult;
}
export interface Policy {
  id: string;
  title: string;
  category: string;
  version: string;
  summary: string;
  sections: string[];
}
export interface Dashboard {
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
