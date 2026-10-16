"use client";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { getStaffIdentity, setDevelopmentRole, type StaffIdentity } from "@/shared/api/client";
import { Badge } from "@/shared/ui/primitives";
import { useAIProvider } from "@/shared/hooks/use-ai-provider";

export function Settings({ theme, onTheme }: { theme: string; onTheme: (theme: string) => void }) {
  const provider = useAIProvider();
  const [identity, setIdentity] = useState<StaffIdentity>();
  const [roleError, setRoleError] = useState("");
  useEffect(() => {
    void getStaffIdentity()
      .then(setIdentity)
      .catch(() => {});
  }, []);
  const roleCopy = !identity
    ? "Loading staff permissions…"
    : identity.role === "admin"
      ? "Analyze data, manage banking records, and review approval requests."
      : identity.role === "analyst"
        ? "Analyze data, investigate risks, and submit customer forms for review."
        : "Browse banking records and saved results.";
  const providerCopy =
    provider?.provider === "vertex"
      ? `Gemini via Vertex AI${provider.model ? ` · ${provider.model}` : ""}`
      : provider?.provider === "local"
        ? "Local analysis and document reading"
        : "Checking the AI connection…";
  return (
    <div className="settings-page settings-panel animate-in">
      <header className="settings-intro">
        <h1>Settings</h1>
        <p>Appearance, access, and what this workspace keeps on this device.</p>
      </header>
      <section className="settings-group" aria-labelledby="settings-appearance">
        <h2 id="settings-appearance">Appearance</h2>
        <p>Saved on this device.</p>
        <div className="theme-choices" role="group" aria-label="Workspace theme">
          <button
            type="button"
            className="theme-choice"
            aria-pressed={theme === "dark"}
            onClick={() => onTheme("dark")}
          >
            <span className="theme-swatch is-dark" aria-hidden="true" />
            <span>
              <Moon size={14} /> Dark
            </span>
          </button>
          <button
            type="button"
            className="theme-choice"
            aria-pressed={theme === "light"}
            onClick={() => onTheme("light")}
          >
            <span className="theme-swatch is-light" aria-hidden="true" />
            <span>
              <Sun size={14} /> Light
            </span>
          </button>
        </div>
      </section>
      <section className="settings-group" aria-labelledby="settings-workspace">
        <h2 id="settings-workspace">Workspace</h2>
        <div className="setting-row">
          <div>
            <h3>Data</h3>
            <p>Meridian Bank · Synthetic dataset · April–September 2026</p>
          </div>
          <Badge>Synthetic data</Badge>
        </div>
        <div className="setting-row">
          <div>
            <h3>AI</h3>
            <p>{providerCopy}</p>
          </div>
          <Badge>{provider ? "Connected" : "Checking connection"}</Badge>
        </div>
      </section>
      <section className="settings-group" aria-labelledby="settings-access">
        <h2 id="settings-access">Access</h2>
        <div className="setting-row">
          <div>
            <h3>Staff permissions</h3>
            <p>{roleCopy}</p>
          </div>
          {identity?.environment === "development" && identity.adapter === "development" ? (
            <label className="setting-field">
              Local test role
              <select
                aria-label="Local staff role"
                value={identity.role}
                onChange={(e) => {
                  try {
                    setDevelopmentRole(e.target.value as StaffIdentity["role"]);
                  } catch {
                    setRoleError(
                      "This browser cannot save a local staff role. Enable browser storage to use role switching."
                    );
                  }
                }}
              >
                <option value="viewer">Viewer</option>
                <option value="analyst">Analyst</option>
                <option value="admin">Admin</option>
              </select>
            </label>
          ) : (
            <Badge>
              {identity && identity.adapter !== "development"
                ? `${identity.role} · Verified identity`
                : "Verified staff identity required"}
            </Badge>
          )}
        </div>
        {roleError && (
          <p className="settings-note" role="alert">
            {roleError}
          </p>
        )}
        <p className="settings-note">
          Only admins can change banking records or approve submitted OCR customers. Analysts can
          review forms and submit requests. Viewers can browse records and available results.
          {identity?.adapter === "development" && " Switch local roles here to test the workflow."}
        </p>
        <p className="settings-note">
          {!identity
            ? "Staff permissions are unavailable. Reload or contact your administrator before starting a task."
            : identity.adapter === "development"
              ? "Role switching is enabled for this private workspace. Verified staff sign-in is required before public access."
              : "Staff permissions come from your verified sign-in and assigned banking role. Contact your administrator to change access."}{" "}
          No transactions are authorized and no lending decisions are made here.
        </p>
      </section>
      <section className="settings-group" aria-labelledby="settings-retention">
        <h2 id="settings-retention">Kept on this device</h2>
        <p className="settings-note">
          Conversations, reviewed drafts, customer records and reports are stored in the local
          database. This browser retains a session recovery key, theme and dismissed alerts.
        </p>
      </section>
    </div>
  );
}
