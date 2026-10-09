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
export function AnalyticsChart({
  points,
  kind = "area",
  compact = false,
}: {
  points: ChartPoint[];
  kind?: "area" | "bar";
  compact?: boolean;
}) {
  const id = useId().replaceAll(":", "");
  return (
    <div
      className={compact ? "chart chart-compact" : "chart"}
      role="img"
      aria-label={points.map((p) => `${p.name}: ${p.value}`).join(", ")}
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        {kind === "area" ? (
          <AreaChart data={points} margin={{ top: 15, right: 12, left: -24, bottom: 0 }}>
            <defs>
              <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.2} />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
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
              formatter={(value) => [value, "Flagged / defaulted"]}
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
              stroke="var(--accent)"
              strokeWidth={2.5}
              fill={`url(#${id})`}
              activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 3 }}
              animationDuration={650}
            />
          </AreaChart>
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
