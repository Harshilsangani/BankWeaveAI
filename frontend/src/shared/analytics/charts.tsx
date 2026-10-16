"use client";
import { useEffect, useRef } from "react";
import type { ECharts, EChartsCoreOption } from "echarts/core";
import type { ChartPoint } from "@/shared/types/analysis";

const researchFallback = ["#1a73e8", "#129e8e", "#e8a317", "#7b4ddb", "#e06a12", "#1f8a4c"];

type EChartsModule = typeof import("echarts/core");

let loader: Promise<EChartsModule> | null = null;

function loadEcharts() {
  loader ??= (async () => {
    const echarts = await import("echarts/core");
    const { BarChart, LineChart, PieChart } = await import("echarts/charts");
    const { GridComponent, LegendComponent, MarkLineComponent, TooltipComponent } =
      await import("echarts/components");
    const { SVGRenderer } = await import("echarts/renderers");
    echarts.use([
      BarChart,
      LineChart,
      PieChart,
      GridComponent,
      LegendComponent,
      MarkLineComponent,
      TooltipComponent,
      SVGRenderer,
    ]);
    return echarts;
  })();
  return loader;
}

function readColor(host: HTMLElement, variable: string, fallback: string) {
  const raw = getComputedStyle(host).getPropertyValue(variable).trim();
  if (!raw) return fallback;
  const probe = document.createElement("span");
  probe.style.color = raw;
  host.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return resolved || fallback;
}

function withAlpha(color: string, alpha: number) {
  const parts = color.match(/[\d.]+/g);
  if (!parts || parts.length < 3) return color;
  return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
}

function formatCount(value: number) {
  return value.toLocaleString("en-IN", { maximumFractionDigits: Number.isInteger(value) ? 0 : 2 });
}

function chartOption(
  host: HTMLElement,
  echarts: EChartsModule,
  points: ChartPoint[],
  kind: "area" | "bar" | "column" | "donut",
  tone: "research" | undefined,
  valueLabel: string
): EChartsCoreOption {
  const text = readColor(host, "--text", "#f4f4f5");
  const muted = readColor(host, "--muted", "#b6b6bd");
  const grid = readColor(host, "--chart-grid", "#38383b");
  const surface = readColor(host, "--surface-raised", "#2a2a2d");
  const border = readColor(host, "--border", "#38383b");
  const hover = readColor(host, "--hover", "rgba(255, 255, 255, 0.05)");
  const accent = readColor(host, "--accent", "#eeeeef");
  const font = getComputedStyle(host).fontFamily;
  const research = researchFallback.map((fallback, index) =>
    readColor(host, `--research-${index + 1}`, fallback)
  );
  const stroke = tone === "research" ? research[0] : accent;
  const integers = points.every((point) => Number.isInteger(point.value));
  const tooltip = {
    backgroundColor: surface,
    borderColor: border,
    borderWidth: 1,
    padding: [8, 10],
    textStyle: { color: text, fontSize: 13, fontFamily: font },
    extraCssText: "border-radius: 12px;",
    formatter: (
      params:
        | { name?: string; value?: number; marker?: string }
        | { name?: string; value?: number; marker?: string }[]
    ) => {
      const item = Array.isArray(params) ? params[0] : params;
      if (!item) return "";
      return `${item.marker ?? ""}${item.name ?? ""}<br/>${valueLabel}: ${formatCount(Number(item.value ?? 0))}`;
    },
  };
  const categoryAxis = {
    type: "category" as const,
    data: points.map((point) => point.name),
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: muted, fontSize: 12, fontFamily: font, hideOverlap: true },
  };
  const valueAxis = {
    type: "value" as const,
    minInterval: integers ? 1 : undefined,
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: muted, fontSize: 12, fontFamily: font },
    splitLine: { lineStyle: { color: grid, type: "dashed" as const } },
  };
  if (kind === "donut") {
    return {
      animationDuration: 650,
      textStyle: { fontFamily: font },
      aria: { enabled: false },
      color: research,
      tooltip: { ...tooltip, trigger: "item" },
      legend: {
        type: "scroll",
        orient: "vertical",
        right: 0,
        top: "middle",
        icon: "circle",
        itemWidth: 8,
        itemHeight: 8,
        textStyle: { color: muted, fontSize: 12, fontFamily: font },
        formatter: (name: string) => {
          const point = points.find((item) => item.name === name);
          return point ? `${name}   ${formatCount(point.value)}` : name;
        },
      },
      series: [
        {
          type: "pie",
          radius: ["56%", "78%"],
          center: ["32%", "50%"],
          padAngle: points.length > 1 ? 2 : 0,
          itemStyle: { borderRadius: 6 },
          label: { show: false },
          data: points.map((point, index) => ({
            name: point.name,
            value: point.value,
            itemStyle: { color: research[index % research.length] },
          })),
        },
      ],
      media: [
        {
          query: { maxWidth: 460 },
          option: {
            legend: { orient: "horizontal", left: 0, right: 0, top: "auto", bottom: 0 },
            series: [{ center: ["50%", "42%"], radius: ["48%", "70%"] }],
          },
        },
      ],
    };
  }
  const baseline = points[0]?.baseline;
  if (kind === "bar") {
    return {
      animationDuration: 650,
      textStyle: { fontFamily: font },
      aria: { enabled: false },
      grid: { left: 8, right: 36, top: 8, bottom: 4, containLabel: true },
      tooltip: {
        ...tooltip,
        trigger: "axis",
        axisPointer: { type: "shadow", shadowStyle: { color: hover } },
      },
      xAxis: { ...valueAxis, axisLabel: { show: false }, splitLine: { show: false } },
      yAxis: {
        ...categoryAxis,
        axisLabel: { ...categoryAxis.axisLabel, width: 108, overflow: "truncate" },
      },
      series: [
        {
          type: "bar",
          name: valueLabel,
          data: points.map((point) => point.value),
          barMaxWidth: 12,
          showBackground: true,
          backgroundStyle: { color: hover, borderRadius: 6 },
          itemStyle: { color: accent, borderRadius: [0, 6, 6, 0] },
          label: {
            show: true,
            position: "right",
            color: text,
            fontSize: 12,
            fontFamily: font,
            formatter: ({ value }: { value: number }) => formatCount(Number(value)),
          },
        },
      ],
    };
  }
  const vertical = kind === "column";
  return {
    animationDuration: 650,
    textStyle: { fontFamily: font },
    aria: { enabled: false },
    grid: { left: 8, right: 12, top: 16, bottom: 4, containLabel: true },
    tooltip: {
      ...tooltip,
      trigger: "axis",
      axisPointer: vertical
        ? { type: "shadow", shadowStyle: { color: hover } }
        : { type: "line", lineStyle: { color: border } },
    },
    xAxis: {
      ...categoryAxis,
      axisLabel: {
        ...categoryAxis.axisLabel,
        fontSize: vertical ? 11 : 12,
        interval: vertical ? 0 : "auto",
        width: vertical ? 72 : undefined,
        overflow: vertical ? "truncate" : "none",
      },
    },
    yAxis: {
      ...valueAxis,
      splitLine: { show: true, lineStyle: { color: grid, type: "dashed" as const } },
    },
    series: [
      vertical
        ? {
            type: "bar",
            name: valueLabel,
            data: points.map((point) => point.value),
            barMaxWidth: 22,
            itemStyle: { color: stroke, borderRadius: [7, 7, 0, 0] },
          }
        : {
            type: "line",
            name: valueLabel,
            data: points.map((point) => point.value),
            smooth: true,
            showSymbol: false,
            symbol: "circle",
            symbolSize: 8,
            lineStyle: { width: 2.5, color: stroke },
            itemStyle: { color: stroke, borderColor: surface, borderWidth: 2 },
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: withAlpha(stroke, 0.28) },
                { offset: 1, color: withAlpha(stroke, 0) },
              ]),
            },
            markLine:
              baseline === undefined
                ? undefined
                : {
                    silent: true,
                    symbol: "none",
                    label: { show: false },
                    lineStyle: { color: muted, type: "dashed", opacity: 0.45 },
                    data: [{ yAxis: baseline }],
                  },
          },
    ],
  };
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
  const host = useRef<HTMLDivElement>(null);
  const label = points.map((point) => `${point.name}: ${point.value}`).join(", ");
  const signature = JSON.stringify({ points, kind, compact, tone, valueLabel });

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    let chart: ECharts | null = null;
    let disposed = false;
    const cleanups: Array<() => void> = [];
    loadEcharts().then((echarts) => {
      if (disposed || !host.current) return;
      chart = echarts.init(host.current, undefined, { renderer: "svg" });
      const apply = () => {
        const current = host.current;
        if (!chart || disposed || !current) return;
        chart.setOption(chartOption(current, echarts, points, kind, tone, valueLabel), {
          notMerge: true,
        });
        chart.resize();
      };
      apply();
      const resize = new ResizeObserver(() => chart?.resize());
      resize.observe(host.current);
      const theme = new MutationObserver(() => requestAnimationFrame(apply));
      theme.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme", "class", "style"],
      });
      cleanups.push(() => {
        resize.disconnect();
        theme.disconnect();
      });
    });
    return () => {
      disposed = true;
      cleanups.forEach((cleanup) => cleanup());
      chart?.dispose();
    };
  }, [signature, points, kind, tone, valueLabel]);

  return (
    <div
      className={`${compact ? "chart chart-compact" : "chart"}${kind === "donut" ? " chart-donut research-donut" : ""}${tone === "research" ? " chart-research" : ""}`}
      role="img"
      aria-label={label}
    >
      <div ref={host} className="chart-canvas" />
    </div>
  );
}

export function Sparkline({ values, warning = false }: { values: number[]; warning?: boolean }) {
  const max = Math.max(...values),
    min = Math.min(...values);
  const points = values
    .map((value, index) => `${index * 13},${30 - ((value - min) / (max - min || 1)) * 24}`)
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
