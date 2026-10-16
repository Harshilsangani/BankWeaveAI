"use client";
import { useState } from "react";
import { useHorizontalOverflow } from "@/shared/hooks/use-horizontal-overflow";
import {
  Activity,
  ArrowLeftRight,
  ChevronDown,
  Fingerprint,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import type { Evidence, Metric, TableData } from "@/shared/types/analysis";
import { Badge } from "@/shared/ui/primitives";
import { AnalyticsChart, Sparkline } from "@/shared/analytics/charts";

export function KpiCard({ metric }: { metric: Metric }) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">
        {metric.label}
        <span className="tiny-icon">
          <Activity size={13} />
        </span>
      </div>
      <div className="kpi-value-row">
        <strong>{metric.value}</strong>
        {metric.sparkline && (
          <Sparkline values={metric.sparkline} warning={metric.direction === "up"} />
        )}
      </div>
      <div className="kpi-meta">
        <span className={`metric-change ${metric.direction}`}>
          {metric.direction === "up" && <TrendingUp size={12} />}
          {metric.change}
        </span>
        <span>{metric.detail}</span>
      </div>
    </div>
  );
}

export function InsightCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="insight-card">
      <Sparkles size={18} />
      <div>
        <h3>
          {title}
          <Badge tone="accent">Analytical interpretation</Badge>
        </h3>
        <p>{text}</p>
      </div>
    </div>
  );
}

export function ChartCard({
  title,
  subtitle,
  points,
  kind = "area",
  tone,
  children,
}: {
  title: string;
  subtitle?: string;
  points: { name: string; value: number; baseline?: number }[];
  kind?: "area" | "bar" | "column" | "donut";
  tone?: "research";
  children?: React.ReactNode;
}) {
  return (
    <section className={`panel chart-card${tone === "research" ? " chart-card-research" : ""}`}>
      <div className="chart-heading">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
        {children ?? (
          <span className="chart-legend">
            <i />
            {kind === "donut"
              ? "Share"
              : kind === "column"
                ? "Compared values"
                : kind === "area"
                  ? "Monthly count"
                  : "Selected period"}
          </span>
        )}
      </div>
      <AnalyticsChart points={points} kind={kind} tone={tone} valueLabel={subtitle || "Value"} />
    </section>
  );
}

export function DataTable({ data, title }: { data: TableData; title?: string }) {
  const { ref, overflow } = useHorizontalOverflow();
  const [sort, setSort] = useState<{ col: number; asc: boolean } | null>(null);
  const rows = sort
    ? [...data.rows].sort((a, b) => {
        const aa = a[sort.col],
          bb = b[sort.col];
        const numericA = Number(String(aa).replace(/[^\d.-]/g, "")),
          numericB = Number(String(bb).replace(/[^\d.-]/g, ""));
        const numeric = /\d/.test(String(aa)) && /\d/.test(String(bb));
        return (
          (numeric ? numericA - numericB : String(aa).localeCompare(String(bb))) *
          (sort.asc ? 1 : -1)
        );
      })
    : data.rows;
  return (
    <section className="data-section">
      {title && <h3>{title}</h3>}
      {overflow && (
        <p className="table-scroll-hint">
          <ArrowLeftRight size={13} /> Scroll to see all columns
        </p>
      )}
      <div
        ref={ref}
        className="table-scroll"
        tabIndex={0}
        role="region"
        aria-label={title ? `${title} table` : "Banking records table"}
      >
        <table>
          <thead>
            <tr>
              {data.columns.map((col, i) => (
                <th
                  key={col}
                  aria-sort={sort?.col === i ? (sort.asc ? "ascending" : "descending") : "none"}
                >
                  <button
                    onClick={() => setSort({ col: i, asc: sort?.col === i ? !sort.asc : true })}
                  >
                    {col}
                    {sort?.col === i && <span>{sort.asc ? " ↑" : " ↓"}</span>}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j} className={j > 0 ? "tabular" : ""}>
                    {String(cell).startsWith("+") ? (
                      <span className="text-amber">{cell}</span>
                    ) : (
                      cell
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <p className="table-empty">No records match this scope. Try removing a filter.</p>
        )}
      </div>
    </section>
  );
}

export function EvidenceCard({ item }: { item: Evidence }) {
  return (
    <details className="evidence-card">
      <summary>
        <span className="evidence-icon">
          <Fingerprint size={17} />
        </span>
        <span>
          <strong>{item.title}</strong>
          <small>{item.source}</small>
        </span>
        <Badge>Source</Badge>
        <ChevronDown size={15} className="evidence-chevron" />
      </summary>
      <div className="evidence-content">
        <p>{item.detail}</p>
        <ul>
          {item.records.map((record) => (
            <li key={record}>{record}</li>
          ))}
        </ul>
        <span className="mono muted">Reference: {item.id}</span>
      </div>
    </details>
  );
}
