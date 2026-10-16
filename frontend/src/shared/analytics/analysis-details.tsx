import { ShieldCheck } from "lucide-react";
import type { AnalysisMetadata } from "@/shared/types/analysis";

export function AnalysisDetails({ analysis }: { analysis: AnalysisMetadata }) {
  return (
    <details className="analysis-details">
      <summary>
        <ShieldCheck size={15} />
        <span>Query details</span>
      </summary>
      <div>
        <div className="scope-item">
          <span>Dataset</span>
          <strong>{analysis.datasetName}</strong>
        </div>
        <div className="scope-item">
          <span>Period</span>
          <strong>{analysis.period}</strong>
        </div>
        <div className="scope-item">
          <span>Currency</span>
          <strong>{analysis.currency}</strong>
        </div>
      </div>
    </details>
  );
}
