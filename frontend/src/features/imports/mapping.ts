import type { ImportField } from "@/features/imports/types";
const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");
const aliases: Record<string, string[]> = {
  id: ["record id"],
  fullName: ["customer name", "name", "applicant name"],
  dateOfBirth: ["dob", "birth date"],
  phone: ["mobile", "mobile number", "phone number"],
  postalCode: ["pin code", "pincode", "zip"],
  occurred_at: ["transaction date", "transaction time", "timestamp", "date"],
  amount: ["transaction amount"],
  customer_id: ["customer id"],
  account_id: ["account id"],
  opened_on: ["opening date", "account opened"],
  principal: ["loan amount", "principal amount"],
  branch_id: ["branch id"],
  loan_type: ["loan type"],
  flagged: ["fraud flag", "is fraud"],
  score: ["risk score"],
  new_device: ["is new device"],
};
export function suggestMapping(
  fields: ImportField[],
  headers: string[],
  entity: string
): Record<string, string> {
  const mapping: Record<string, string> = {};
  const used = new Set<string>();
  for (const field of fields) {
    const choices = [
      field.key,
      field.label,
      ...(aliases[field.key] ?? []),
      ...(field.key === "id" ? [`${entity.slice(0, -1)} id`] : []),
    ].map(normalize);
    const matches = headers.filter((h) => choices.includes(normalize(h)) && !used.has(h));
    if (matches.length === 1) {
      mapping[field.key] = matches[0];
      used.add(matches[0]);
    }
  }
  return mapping;
}
export function errorCsv(errors: { row: number; reasons: string[] }[]): string {
  const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
  return (
    "row,errors\r\n" + errors.map((e) => `${e.row},${quote(e.reasons.join(" "))}`).join("\r\n")
  );
}
