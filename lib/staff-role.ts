export type StaffRole = "viewer" | "analyst" | "admin";
export const roleLabels: Record<StaffRole, string> = {
  viewer: "Viewer",
  analyst: "Analyst",
  admin: "Admin",
};

const analystIdentityKey = "bankweave-analyst-identity-v1";
export function developmentRoleHeader(): string {
  if (typeof window === "undefined") return "customer_operator";
  const raw = localStorage.getItem("risklens-role") ?? "customer_operator";
  if (raw === "analyst" || raw === "customer_operator") {
    localStorage.setItem(analystIdentityKey, raw);
  }
  return raw;
}

export function selectDevelopmentRole(role: StaffRole) {
  const current = developmentRoleHeader();
  const previous = localStorage.getItem(analystIdentityKey);
  // Re-enter the same historical analyst identity after viewing another role.
  // Preserve both the original default workspace and existing analyst sessions.
  const analyst =
    current === "analyst" || current === "customer_operator"
      ? current
      : previous === "analyst"
        ? "analyst"
        : "customer_operator";
  localStorage.setItem("risklens-role", role === "analyst" ? analyst : role);
}
