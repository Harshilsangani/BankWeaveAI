"use client";
import { useEffect, useState } from "react";
import { BookOpen, FileText, Moon, Search, Sun } from "lucide-react";
import type { Policy, Report } from "@/types";
import {
  getPolicies,
  ingestPolicy,
  getStaffIdentity,
  setDevelopmentRole,
  type StaffIdentity,
} from "@/services";
import { ReportPreview } from "@/components/blocks";
import { Badge, Button, EmptyState } from "@/components/ui";
import { Dialog } from "@/components/dialog";
export function Reports({ reports, onStart }: { reports: Report[]; onStart: () => void }) {
  return (
    <div className="animate-in">
      <div className="page-heading">
        <div>
          <div className="eyebrow">INTELLIGENCE, READY TO SHARE</div>
          <h1>Reports</h1>
          <p>Evidence-backed findings, prepared for your risk team.</p>
        </div>
        <Badge>{reports.length} saved locally</Badge>
      </div>
      {reports.length ? (
        <div className="report-grid">
          {reports.map((r) => (
            <ReportPreview report={r} key={r.id} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<FileText size={28} />}
          title="Your next insight deserves a report."
          text="Open a risk investigation and create a report with findings, source references, and optional scenario analysis."
        >
          <Button variant="primary" onClick={onStart}>
            <FileText size={15} />
            Explore investigations
          </Button>
        </EmptyState>
      )}
    </div>
  );
}
export function Knowledge({ onAsk }: { onAsk: (q: string) => void }) {
  const [identity, setIdentity] = useState<StaffIdentity>();
  const [adding, setAdding] = useState(false),
    [saving, setSaving] = useState(false);
  const [document, setDocument] = useState({
    id: "POL-LOCAL-01",
    version: "v1",
    title: "",
    category: "Staff procedure",
    markdown: "",
  });
  const [policies, setPolicies] = useState<Policy[]>([]),
    [selected, setSelected] = useState<Policy>(),
    [query, setQuery] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    void getStaffIdentity()
      .then(setIdentity)
      .catch(() => {});
    getPolicies()
      .then(setPolicies)
      .catch(() =>
        setError("Unable to load the policy library. Please reopen Knowledge to retry.")
      );
  }, []);
  const filtered = policies.filter((p) =>
    `${p.title} ${p.category} ${p.summary}`.toLowerCase().includes(query.toLowerCase())
  );
  return (
    <div className="animate-in">
      <div className="page-heading">
        <div>
          <div className="eyebrow">THE KNOWLEDGE BEHIND THE DECISION</div>
          <h1>Knowledge library</h1>
          <p>Reference policies and procedures, connected to your analysis.</p>
        </div>
        <div className="page-actions">
          <Badge tone="amber">Versioned local library</Badge>
          {identity?.permissions.includes("analyze") && (
            <Button onClick={() => setAdding(true)}>Add policy document</Button>
          )}
        </div>
      </div>
      <label className="command-input">
        <Search size={18} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search policies"
          placeholder="Search policies, procedures, or topics…"
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <div className="knowledge-grid">
        {filtered.map((policy) => (
          <article className="panel policy-card" key={policy.id}>
            <BookOpen size={24} />
            <Badge>{policy.category}</Badge>
            <h3>{policy.title}</h3>
            <p>{policy.summary}</p>
            <small>
              {policy.id} · {policy.version}
            </small>
            <Button onClick={() => setSelected(policy)}>Read policy</Button>
          </article>
        ))}
      </div>
      {policies.length > 0 && !filtered.length && (
        <EmptyState title="No matching policies" text="Try fraud, KYC, or credit risk." />
      )}
      <p className="risk-footnote">
        Local retrieval cites immutable document versions and sections. Seed policies are fictional
        demonstration guidance. Uploaded policies require staff validation; no external source is
        consulted.
      </p>
      <Dialog
        open={adding}
        onOpenChange={setAdding}
        title="Add a policy version"
        description="Upload Markdown/plain text or paste sections. Reuse a document ID with a new version to update it. Earlier citations remain unchanged."
      >
        <form
          className="customer-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setSaving(true);
            setError("");
            try {
              await ingestPolicy(document);
              setPolicies(await getPolicies());
              setAdding(false);
            } catch (error) {
              setError(error instanceof Error ? error.message : "Policy import failed.");
            } finally {
              setSaving(false);
            }
          }}
        >
          {(["id", "version", "title", "category"] as const).map((key) => (
            <label key={key}>
              {key}
              <input
                required
                value={document[key]}
                onChange={(event) =>
                  setDocument((current) => ({ ...current, [key]: event.target.value }))
                }
              />
            </label>
          ))}
          <label>
            Markdown document
            <input
              type="file"
              accept=".md,.txt,text/plain,text/markdown"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                if (file.size > 100000) {
                  setError("Use a document up to 100 KB.");
                  return;
                }
                setDocument((current) => ({ ...current, markdown: "" }));
                const markdown = await file.text();
                setDocument((current) => ({ ...current, markdown }));
              }}
            />
          </label>
          <label>
            Policy sections
            <textarea
              aria-label="Policy Markdown"
              rows={8}
              required
              value={document.markdown}
              onChange={(event) =>
                setDocument((current) => ({ ...current, markdown: event.target.value }))
              }
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <Button type="submit" disabled={saving}>
            {saving ? "Saving version…" : "Save policy version"}
          </Button>
        </form>
      </Dialog>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(undefined);
        }}
        title={selected?.title ?? "Policy"}
        description={`${selected?.id} · ${selected?.version} · Synthetic demonstration document`}
      >
        <ol className="policy-sections">
          {selected?.sections.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <Button
          variant="primary"
          onClick={() => {
            if (selected) onAsk(`What is the policy for ${selected.title}?`);
            setSelected(undefined);
          }}
        >
          Ask the analyst about this policy
        </Button>
      </Dialog>
    </div>
  );
}
export function Settings({ theme, onTheme }: { theme: string; onTheme: (theme: string) => void }) {
  const [identity, setIdentity] = useState<StaffIdentity>();
  useEffect(() => {
    void getStaffIdentity()
      .then(setIdentity)
      .catch(() => {});
  }, []);
  return (
    <div className="animate-in">
      <div className="page-heading">
        <div>
          <div className="eyebrow">MAKE THIS WORKSPACE YOURS</div>
          <h1>Settings</h1>
          <p>Workspace preferences and environment details.</p>
        </div>
      </div>
      <section className="panel settings-panel">
        <div className="setting-row">
          <div>
            <h3>Appearance</h3>
            <p>Choose the workspace theme. Saved on this device.</p>
          </div>
          <div className="filter-tabs">
            <button
              className={theme === "dark" ? "active" : ""}
              onClick={() => onTheme("dark")}
              aria-pressed={theme === "dark"}
            >
              <Moon size={13} className="inline mr-2" />
              Dark
            </button>
            <button
              className={theme === "light" ? "active" : ""}
              onClick={() => onTheme("light")}
              aria-pressed={theme === "light"}
            >
              <Sun size={13} className="inline mr-2" />
              Light
            </button>
          </div>
        </div>
        <div className="setting-row">
          <div>
            <h3>Data environment</h3>
            <p>Meridian Bank · Synthetic dataset · April–September 2026</p>
          </div>
          <Badge tone="accent">Local demo</Badge>
        </div>
        <div className="setting-row">
          <div>
            <h3>AI & analytics</h3>
            <p>SQLite analytical tools · LangGraph workflows · Local AI provider</p>
          </div>
          <Badge>Backend connected</Badge>
        </div>
        <div className="setting-row">
          <div>
            <h3>Staff permissions</h3>
            <p>
              {identity?.actorId ?? "Loading identity"} · {identity?.permissions.join(", ")}
            </p>
          </div>
          {identity?.environment === "development" ? (
            <label className="setting-field">
              Local test role{" "}
              <select
                aria-label="Local staff role"
                value={identity.role}
                onChange={(e) => setDevelopmentRole(e.target.value as StaffIdentity["role"])}
              >
                <option value="viewer">Viewer</option>
                <option value="analyst">Analyst</option>
                <option value="admin">Admin</option>
              </select>
            </label>
          ) : (
            <Badge>Verified staff identity required</Badge>
          )}
        </div>
        <div className="setting-row">
          <div>
            <h3>Data retention</h3>
            <p>
              Conversations, reviewed drafts, customer records and reports are stored in the local
              database. This browser retains a session recovery key, theme and dismissed alerts.
            </p>
          </div>
        </div>
        <p className="settings-note">
          Only admins can change banking records or approve submitted OCR customers. Analysts can
          review forms and submit requests. Viewers can browse records and available results. Switch
          local roles here to test the workflow.
        </p>
        <p className="settings-note">
          Local roles enforce backend permissions; the development identity is rejected in
          production. Verified cloud authentication, Gemini and Google Cloud remain deployment
          tasks. No transactions are authorized and no lending decisions are made here.
        </p>
      </section>
    </div>
  );
}
