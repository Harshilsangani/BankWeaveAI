import type { QueryContext } from "@/shared/types/scope";

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
