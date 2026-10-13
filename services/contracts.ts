import type {
  AnalystResponse,
  Dashboard,
  Investigation,
  Policy,
  QueryContext,
  Report,
  RiskEvent,
  ScenarioInput,
  ScenarioResult,
} from "@/types";
export type DatasetScope = Pick<QueryContext, "datasetId" | "period">;
export interface BankDataService {
  getDashboard(scope?: DatasetScope): Promise<Dashboard>;
  getPolicies(): Promise<Policy[]>;
}
export interface AnalyticsService {
  sendAnalystQuery(
    query: string,
    context?: QueryContext,
    scenario?: ScenarioResult
  ): Promise<AnalystResponse>;
}
export interface RiskService {
  getRiskRadar(scope?: DatasetScope): Promise<RiskEvent[]>;
  startInvestigation(riskId: string, scope?: QueryContext): Promise<Investigation>;
  runScenario(input: ScenarioInput): Promise<ScenarioResult>;
}
export interface ReportService {
  generateReport(investigation: Investigation, scenario?: ScenarioResult): Promise<Report>;
}
export type BankWeaveService = BankDataService & AnalyticsService & RiskService & ReportService;
