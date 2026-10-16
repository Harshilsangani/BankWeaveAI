export function caseTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Time unavailable"
    : date.toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }) + " IST";
}
export function reviewerName(value: string | null) {
  if (!value) return "Not assigned";
  if (value === "local-admin") return "Local admin";
  if (value === "local-analyst" || value === "local-customer_operator") return "Local analyst";
  return "Assigned staff reviewer";
}
