import { randomId } from "@/shared/lib/random-id";
import type { DatasetId } from "@/shared/types/scope";

function istStamp(now: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map(({ type, value }) => [type, value])
  );
  return `${parts.year}-${parts.month}-${parts.day}_${parts.hour}-${parts.minute}-${parts.second}_IST`;
}

function safeToken(value: string, fallback: string) {
  return (
    value
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80) || fallback
  );
}

function bankToken(datasetId: DatasetId | undefined) {
  return datasetId === "bankshield" ? "BankShield" : "Meridian";
}

export function researchPdfFilename(
  bankName: string | undefined,
  datasetId: DatasetId | undefined,
  now = new Date()
) {
  const bank = safeToken(bankName ?? "", "") || bankToken(datasetId);
  return `${bank}_${istStamp(now)}.pdf`;
}

export function reportFilename(
  datasetId: DatasetId | undefined,
  purpose: string,
  extension: "pdf" | "html",
  now = new Date()
) {
  const bank = bankToken(datasetId);
  const safePurpose = safeToken(purpose, "Report");
  return `BankWeave_${bank}_${safePurpose}_${istStamp(now)}_${randomId().slice(0, 8)}.${extension}`;
}
