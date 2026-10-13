"use client";
import { useId } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartPoint } from "@/types";
const researchPalette = [
  "var(--research-1)",
  "var(--research-2)",
  "var(--research-3)",
  "var(--research-4)",
  "var(--research-5)",
  "var(--research-6)",
];

function DonutChart({ points }: { points: ChartPoint[] }) {
  const total = points.reduce((sum, point) => sum + point.value, 0) || 1;
  let angle = -90;
  const arcs = points.map((point, index) => {
    const sweep = (point.value / total) * 360;
    const start = angle;
    angle += sweep;
    return { point, index, start, end: angle };
  });
  return (
    <div className="research-donut">
      <svg viewBox="0 0 160 160" role="img" aria-label={points.map((point) => `${point.name}: ${point.value}`).join(", ")}>
        {arcs.map((arc) =>
          arc.end - arc.start >= 359.9 ? (
            <circle key={arc.point.name} cx="80" cy="80" r="54" fill="none" stroke={researchPalette[arc.index % researchPalette.length]} strokeWidth="18" />
          ) : (
            <path
              key={arc.point.name}
              d={donutArc(80, 80, 54, arc.start, arc.end)}
              fill="none"
              stroke={researchPalette[arc.index % researchPalette.length]}
              strokeWidth="18"
            />
          )
        )}
        <circle cx="80" cy="80" r="40" fill="var(--surface)" />
      </svg>
      <ul>
        {points.map((point, index) => (
          <li key={point.name}>
            <i style={{ background: researchPalette[index % researchPalette.length] }} />
            <span>{point.name}</span>
            <strong>{point.value.toLocaleString("en-IN")}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

function donutArc(cx: number, cy: number, radius: number, start: number, end: number) {
  const polar = (degrees: number) => {
    const radians = (Math.PI / 180) * degrees;
    return [cx + radius * Math.cos(radians), cy + radius * Math.sin(radians)];
  };
  const [x1, y1] = polar(start);
  const [x2, y2] = polar(end);
  const large = end - start > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2}`;
}

export function AnalyticsChart({
  points,
  kind = "area",
  compact = false,
  tone,
  valueLabel = "Value",
}: {
  points: ChartPoint[];
  kind?: "area" | "bar" | "column" | "donut";
  compact?: boolean;
  tone?: "research";
  valueLabel?: string;
}) {
  const id = useId().replaceAll(":", "");
  const stroke = tone === "research" ? "var(--research-1)" : "var(--accent)";
  if (kind === "donut") return <DonutChart points={points} />;
  return (
    <div
      className={`${compact ? "chart chart-compact" : "chart"}${tone === "research" ? " chart-research" : ""}`}
      role="img"
      aria-label={points.map((p) => `${p.name}: ${p.value}`).join(", ")}
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        {kind === "area" ? (
          <AreaChart data={points} margin={{ top: 15, right: 12, left: -24, bottom: 0 }}>
            <defs>
              <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
                <stop offset="100%" stopColor={stroke} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--chart-grid)" vertical={false} strokeDasharray="3 5" />
            <XAxis
              dataKey="name"
              tick={{ fill: "var(--muted)", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              dy={8}
            />
            <YAxis
              tick={{ fill: "var(--muted)", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                background: "var(--surface-raised)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                color: "var(--text)",
                fontSize: 13,
              }}
              labelStyle={{ color: "var(--muted)" }}
              formatter={(value) => [value, valueLabel]}
              cursor={{ stroke: "var(--border-strong)" }}
            />
            {points[0]?.baseline !== undefined && (
              <ReferenceLine
                y={points[0].baseline}
                stroke="var(--muted)"
                strokeDasharray="4 5"
                strokeOpacity={0.4}
              />
            )}
            <Area
              type="monotone"
              dataKey="value"
              stroke={stroke}
              strokeWidth={2.5}
              fill={`url(#${id})`}
              activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 3 }}
              animationDuration={650}
            />
          </AreaChart>
        ) : kind === "column" ? (
          <BarChart data={points} margin={{ top: 12, right: 8, left: -18, bottom: 0 }} barSize={22}>
            <CartesianGrid stroke="var(--chart-grid)" vertical={false} strokeDasharray="3 5" />
            <XAxis dataKey="name" tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} axisLine={false} interval={0} />
            <YAxis tick={{ fill: "var(--muted)", fontSize: 12 }} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: "var(--surface-raised)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--text)", fontSize: 13 }}
              formatter={(value) => [value, valueLabel]}
              cursor={{ fill: "var(--hover)" }}
            />
            <Bar dataKey="value" fill={stroke} radius={[7, 7, 0, 0]} animationDuration={650} />
          </BarChart>
        ) : (
          <BarChart
            data={points}
            layout="vertical"
            margin={{ left: -6, right: 22, top: 5, bottom: 0 }}
            barSize={12}
          >
            <CartesianGrid stroke="var(--chart-grid)" horizontal={false} strokeDasharray="3 5" />
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fill: "var(--muted)", fontSize: 12 }}
              width={88}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: "var(--surface-raised)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                color: "var(--text)",
              }}
              cursor={{ fill: "var(--hover)" }}
            />
            <Bar
              dataKey="value"
              fill="var(--accent)"
              radius={[0, 6, 6, 0]}
              background={{ fill: "var(--hover)", radius: 6 }}
              label={{ position: "right", fill: "var(--text)", fontSize: 12 }}
              animationDuration={650}
            />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
export function Sparkline({ values, warning = false }: { values: number[]; warning?: boolean }) {
  const max = Math.max(...values),
    min = Math.min(...values);
  const points = values
    .map((v, i) => `${i * 13},${30 - ((v - min) / (max - min || 1)) * 24}`)
    .join(" ");
  return (
    <svg
      className={warning ? "sparkline warning" : "sparkline"}
      viewBox="0 0 68 36"
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}
