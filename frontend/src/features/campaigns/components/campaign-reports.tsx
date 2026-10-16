"use client";
import { FileText, ArrowUpRight } from "lucide-react";
import { Badge, Button, EmptyState } from "@/shared/ui/primitives";
import type { CampaignCounts, CampaignReport } from "@/features/campaigns/types";

export const campaignMoney = (minor: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(minor / 100);
export const campaignLabel = (value: string) =>
  value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
export function CampaignMetrics({ counts }: { counts: CampaignCounts }) {
  return (
    <div className="campaign-metrics">
      {[
        ["Customers screened", counts.selected],
        ["Potential prospects", counts.prospects],
        ["Contactable prospects", counts.contactable],
        ["Drafts prepared", counts.drafts],
      ].map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{Number(value).toLocaleString("en-IN")}</strong>
        </div>
      ))}
    </div>
  );
}
export function CampaignReports({
  reports,
  onOpen,
  compact = false,
  onCampaigns,
}: {
  reports: CampaignReport[];
  onOpen: (id: string) => void;
  compact?: boolean;
  onCampaigns?: () => void;
}) {
  if (!reports.length)
    return (
      <EmptyState
        icon={<FileText size={24} />}
        title="Your campaign reports will appear here"
        text="Prepare a Card Campaigns report to review product matches, consent, and email drafts."
      >
        {onCampaigns && (
          <Button onClick={onCampaigns}>
            Open Card Campaigns <ArrowUpRight size={14} />
          </Button>
        )}
      </EmptyState>
    );
  return (
    <div className={compact ? "campaign-report-list" : "report-grid"}>
      {(compact ? reports.slice(0, 3) : reports).map((report) => (
        <article className="panel campaign-report-card" key={report.id}>
          <div className="campaign-card-meta">
            <Badge>{report.period} campaign</Badge>
            <Badge tone={report.reviewStatus === "reviewed" ? "accent" : "muted"}>
              {campaignLabel(report.reviewStatus)}
            </Badge>
          </div>
          <h3>{report.title}</h3>
          <p>Data through {report.cutoff} · Synthetic demo</p>
          <div className="campaign-card-counts">
            <span>
              <strong>{report.counts.prospects.toLocaleString("en-IN")}</strong> prospects
            </span>
            <span>
              <strong>{report.counts.drafts.toLocaleString("en-IN")}</strong> drafts
            </span>
            <span>
              <strong>{report.counts.emailsSent}</strong> sent
            </span>
          </div>
          <Button onClick={() => onOpen(report.id)}>
            Open campaign report <ArrowUpRight size={14} />
          </Button>
        </article>
      ))}
    </div>
  );
}
