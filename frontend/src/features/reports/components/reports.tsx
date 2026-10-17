"use client";
import { useState } from "react";
import { FileText } from "lucide-react";
import type { Report } from "@/features/reports/types";
import { ReportPreview } from "@/features/reports/components/report-preview";
import { Badge, Button, EmptyState } from "@/shared/ui/primitives";
import { CampaignReports } from "@/features/campaigns/components/campaign-reports";
import type { CampaignReport } from "@/features/campaigns/types";

export function Reports({
  reports,
  onStart,
  campaignReports = [],
  onCampaignReport,
  onCampaigns,
}: {
  reports: Report[];
  onStart: () => void;
  campaignReports?: CampaignReport[];
  onCampaignReport: (id: string) => void;
  onCampaigns: () => void;
}) {
  const [tab, setTab] = useState("all");
  return (
    <div className="animate-in">
      <div className="page-heading">
        <div>
          <h1>Reports</h1>
          <p>Evidence-backed findings, prepared for your risk team.</p>
        </div>
        <Badge>{reports.length + campaignReports.length} saved locally</Badge>
      </div>
      <div className="filter-tabs campaign-tabs" role="group" aria-label="Report type">
        {[
          ["all", "All reports"],
          ["investigations", "Investigation reports"],
          ["campaigns", "Card campaigns"],
        ].map(([value, label]) => (
          <button
            key={value}
            className={tab === value ? "active" : ""}
            aria-pressed={tab === value}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab !== "investigations" && (campaignReports.length > 0 || tab === "campaigns") && (
        <CampaignReports
          reports={campaignReports}
          onOpen={onCampaignReport}
          onCampaigns={onCampaigns}
        />
      )}
      {tab !== "campaigns" &&
        (reports.length ? (
          <div className="report-grid">
            {reports.map((r) => (
              <ReportPreview report={r} key={r.id} />
            ))}
          </div>
        ) : tab === "investigations" || !campaignReports.length ? (
          <EmptyState
            icon={<FileText size={28} />}
            title="Your next insight deserves a report."
            text="Open a risk investigation and create a report with findings and source references. Card campaign reports are available in the Card campaigns tab."
          >
            <Button variant="primary" onClick={onStart}>
              <FileText size={15} />
              Explore investigations
            </Button>
          </EmptyState>
        ) : null)}
    </div>
  );
}
