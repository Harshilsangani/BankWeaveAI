"use client";
import { useEffect, useState } from "react";
import { BookOpen, Compass, Search } from "lucide-react";
import type { Page } from "@/features/workspace/types";
import type { Policy } from "@/features/knowledge/types";
import { getPolicies, ingestPolicy } from "@/features/knowledge/api";
import { getStaffIdentity, type StaffIdentity } from "@/shared/api/client";
import { Badge, Button, EmptyState } from "@/shared/ui/primitives";
import { Dialog } from "@/shared/ui/dialog";
import { workspaceGuides, type WorkspaceGuide } from "@/features/knowledge/workspace-guides";

export function Knowledge({
  onAsk,
  onNavigate,
}: {
  onAsk: (q: string) => void;
  onNavigate: (page: Page) => void;
}) {
  const [identity, setIdentity] = useState<StaffIdentity>();
  const [resourceType, setResourceType] = useState("all");
  const [guidePage, setGuidePage] = useState("all");
  const [selectedGuide, setSelectedGuide] = useState<WorkspaceGuide>();
  const [loading, setLoading] = useState(true);
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
  function loadPolicies() {
    setLoading(true);
    setError("");
    return getPolicies()
      .then(setPolicies)
      .catch(() => setError("Unable to load policies. Try again to see reference documents."))
      .finally(() => setLoading(false));
  }
  useEffect(() => {
    void getStaffIdentity()
      .then(setIdentity)
      .catch(() => {});
    void loadPolicies();
  }, []);
  const search = query.trim().toLowerCase();
  const showGuides = resourceType !== "policies";
  const showPolicies = resourceType !== "guides" && guidePage === "all";
  const filteredGuides = workspaceGuides.filter(
    (guide) =>
      (guidePage === "all" || guide.page === guidePage) &&
      `${guide.page} ${guide.title} ${guide.summary} ${guide.steps.join(" ")} ${guide.tip}`
        .toLowerCase()
        .includes(search)
  );
  const filtered = policies.filter((policy) =>
    `${policy.title} ${policy.category} ${policy.summary} ${policy.sections.join(" ")}`
      .toLowerCase()
      .includes(search)
  );
  const resultCount =
    (showGuides ? filteredGuides.length : 0) + (showPolicies ? filtered.length : 0);
  return (
    <div className="animate-in">
      <div className="page-heading">
        <div>
          <h1>Knowledge library</h1>
          <p>Find help for every workspace page, plus reference policies and procedures.</p>
        </div>
        <div className="page-actions">
          {identity?.permissions.includes("analyze") && (
            <Button onClick={() => setAdding(true)}>Add policy document</Button>
          )}
        </div>
      </div>
      <label className="command-input knowledge-search">
        <Search size={18} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search knowledge library"
          placeholder="Search pages, tasks, policies, or topics…"
        />
      </label>
      <div className="knowledge-filters">
        <div className="filter-tabs" role="group" aria-label="Knowledge resource type">
          {[
            ["all", "All resources"],
            ["guides", "Page guides"],
            ["policies", "Policies & procedures"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={resourceType === value ? "active" : ""}
              aria-pressed={resourceType === value}
              onClick={() => {
                setResourceType(value);
                setGuidePage("all");
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {showGuides && (
          <label className="knowledge-page-filter">
            Workspace page
            <select
              aria-label="Filter guides by page"
              value={guidePage}
              onChange={(event) => setGuidePage(event.target.value)}
            >
              <option value="all">All pages</option>
              {workspaceGuides.map((guide) => (
                <option key={guide.page} value={guide.page}>
                  {guide.page === "Knowledge" ? "Knowledge Library" : guide.page}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p className="knowledge-result-count" role="status">
        {resultCount} {resultCount === 1 ? "resource" : "resources"} found
        {showPolicies && loading ? " · Loading policies…" : ""}
      </p>
      {showGuides && filteredGuides.length > 0 && (
        <section className="knowledge-section" aria-labelledby="page-guides-heading">
          <h2 id="page-guides-heading">Workspace page guides</h2>
          <p>Choose a page to learn what you can do and how to get started.</p>
          <div className="knowledge-grid">
            {filteredGuides.map((guide) => (
              <article className="panel policy-card" key={guide.page}>
                <Compass size={24} aria-hidden="true" />
                <Badge>{guide.page === "Knowledge" ? "Knowledge Library" : guide.page}</Badge>
                <h3>{guide.title}</h3>
                <p>{guide.summary}</p>
                <Button
                  aria-label={`Read guide for ${guide.page}`}
                  onClick={() => setSelectedGuide(guide)}
                >
                  Read guide
                </Button>
              </article>
            ))}
          </div>
        </section>
      )}
      {showPolicies && (
        <section className="knowledge-section" aria-labelledby="policy-library-heading">
          <h2 id="policy-library-heading">Policies & procedures</h2>
          <p>Read versioned reference documents or ask the analyst about a policy.</p>
          {error && (
            <div className="knowledge-load-error">
              <p role="alert">{error}</p>
              <Button disabled={loading} onClick={() => void loadPolicies()}>
                Retry policies
              </Button>
            </div>
          )}
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
          {!loading && !error && !policies.length && (
            <EmptyState
              title="No policy documents yet"
              text="Added policy documents will appear here. Page guides are available above."
            />
          )}
          <p className="risk-footnote">
            Policy answers cite document versions and sections. Seed policies are fictional
            demonstration guidance. Uploaded policies require staff validation.
          </p>
        </section>
      )}
      {!resultCount && (!showPolicies || (!loading && !error)) && (
        <EmptyState
          title="No matching resources"
          text="Try another page, task, or topic, or clear the filters to browse the library."
        >
          <Button
            onClick={() => {
              setQuery("");
              setGuidePage("all");
              setResourceType("all");
            }}
          >
            Clear filters
          </Button>
        </EmptyState>
      )}
      <Dialog
        open={!!selectedGuide}
        onOpenChange={(open) => {
          if (!open) setSelectedGuide(undefined);
        }}
        title={selectedGuide?.title ?? "Page guide"}
        description={selectedGuide?.summary ?? "Learn how to use this workspace page."}
      >
        <ol className="policy-sections">
          {selectedGuide?.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="knowledge-guide-tip">{selectedGuide?.tip}</p>
        <Button
          variant="primary"
          onClick={() => {
            if (selectedGuide) onNavigate(selectedGuide.page);
            setSelectedGuide(undefined);
          }}
        >
          Open {selectedGuide?.page === "Knowledge" ? "Knowledge Library" : selectedGuide?.page}
        </Button>
      </Dialog>
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
