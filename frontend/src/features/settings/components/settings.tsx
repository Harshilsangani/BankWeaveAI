"use client";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { getStaffIdentity, setDevelopmentRole, type StaffIdentity } from "@/shared/api/client";
import { Badge, Button } from "@/shared/ui/primitives";
import { useAIProvider } from "@/shared/hooks/use-ai-provider";

export function Settings({ theme, onTheme }: { theme: string; onTheme: (theme: string) => void }) {
  const {
    provider,
    error: providerError,
    loading: providerLoading,
    reload: reloadProvider,
  } = useAIProvider();
  const [identity, setIdentity] = useState<StaffIdentity>();
  const [roleError, setRoleError] = useState("");
  const [identityError, setIdentityError] = useState("");
  const [identityAttempt, setIdentityAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setIdentityError("");
    void getStaffIdentity()
      .then((value) => {
        if (active) {
          setIdentity(value);
          if (identityAttempt > 0) window.location.reload();
        }
      })
      .catch(() => {
        if (active) setIdentityError("Staff permissions could not be loaded. Try again.");
      });
    return () => {
      active = false;
    };
  }, [identityAttempt]);
  const roleCopy = !identity
    ? identityError
      ? "Staff permissions unavailable."
      : "Loading staff permissions…"
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
        : providerError
          ? "AI connection unavailable."
          : "Checking the AI connection…";
  return (
    <div className="settings-page settings-panel animate-in">
      <header className="settings-intro">
        <h1>Settings</h1>
        <p>Appearance, access, and saved workspace data.</p>
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
          <Badge>
            {provider ? "Connected" : providerError ? "Unavailable" : "Checking connection"}
          </Badge>
        </div>
        {providerError && (
          <p className="settings-note" role="alert">
            {providerError}{" "}
            <Button disabled={providerLoading} variant="ghost" onClick={reloadProvider}>
              Retry AI connection
            </Button>
          </p>
        )}
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
        {identityError && (
          <p className="settings-note" role="alert">
            {identityError}{" "}
            <Button variant="ghost" onClick={() => setIdentityAttempt((value) => value + 1)}>
              Retry staff permissions
            </Button>
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
        <h2 id="settings-retention">Saved workspace data</h2>
        <p className="settings-note">
          Conversations, reviewed drafts, customer records and reports are stored on the application
          server. This browser keeps workspace recovery keys, theme preferences and unsaved review
          drafts. Clearing browser storage can remove your recovery keys; it does not delete server
          records.
        </p>
      </section>
    </div>
  );
}
