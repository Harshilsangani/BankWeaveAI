import { randomId } from "@/shared/lib/random-id";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { QueryContext } from "@/shared/types/scope";
export const cn = (...values: ClassValue[]) => twMerge(clsx(values));
export const number = (value: number) => new Intl.NumberFormat("en-IN").format(value);
export const money = (value: number) =>
  value >= 10000000
    ? `₹${(value / 10000000).toFixed(2)} Cr`
    : value >= 100000
      ? `₹${(value / 100000).toFixed(2)} L`
      : `₹${number(Math.round(value))}`;
export const percent = (value: number) => `${value.toFixed(1)}%`;
export const formatMoney = (value: number, unit?: "USD" | "INR") =>
  unit === "USD"
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value)
    : money(value);
export const change = (current: number, previous: number) =>
  previous ? ((current - previous) / previous) * 100 : 0;
export const uid = (prefix: string) => `${prefix}-${randomId().slice(0, 8)}`;
export const scopeLabel = (scope?: QueryContext) =>
  [
    scope?.region
      ? `${scope.region}${scope.comparison ? ` + ${scope.comparison}` : ""}`
      : scope?.datasetId === "bankshield"
        ? "All countries"
        : "All regions",
    scope?.newDeviceOnly ? "new devices only" : "",
    scope?.customerId ? `Customer ${scope.customerId}` : "",
    scope?.minAmount
      ? `above ${formatMoney(scope.minAmount, scope.datasetId === "bankshield" ? "USD" : "INR")}`
      : "",
  ]
    .filter(Boolean)
    .join(" · ");
