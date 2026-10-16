"use client";
import { useState } from "react";
import { Download, FileText } from "lucide-react";
import type { Report } from "@/features/reports/types";
import { Badge, Button } from "@/shared/ui/primitives";
import { downloadReport } from "@/features/reports/download";

export function ReportPreview({ report }: { report: Report }) {
  const [downloadError, setDownloadError] = useState("");
  const [downloading, setDownloading] = useState(false);
  return (
    <article className="report-preview">
      <div className="report-preview-top">
        <span className="report-icon">
          <FileText size={22} />
        </span>
        <div>
          <Badge tone="accent">Prepared for review</Badge>
          <h3>{report.title}</h3>
          <p>
            {report.id} ·{" "}
            {new Date(report.createdAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })} ·
            Synthetic data
          </p>
        </div>
      </div>
      <div className="report-outline">
        <span>01 Executive summary</span>
        <span>02 Evidence & findings</span>
        <span>03 Risk assessment</span>
        <span>04 Recommended actions</span>
        {report.scenario && <span>05 Scenario analysis</span>}
      </div>
      <p>{report.investigation.findings[0]}</p>
      {downloadError && <p role="alert">{downloadError}</p>}
      <Button
        disabled={downloading}
        onClick={() => {
          setDownloadError("");
          setDownloading(true);
          void downloadReport(report)
            .catch((e) => setDownloadError(e.message))
            .finally(() => setDownloading(false));
        }}
      >
        <Download size={15} />
        Download report
      </Button>
    </article>
  );
}
