"use client";

import { useEffect, useState } from "react";
import "./sample.css";

const signals = [
  {
    severity: "High",
    title: "Card-not-present spike",
    detail: "214 flagged transactions · West and North",
    meta: "Fraud",
  },
  {
    severity: "High",
    title: "Personal-loan default markers",
    detail: "188 markers added since April",
    meta: "Credit",
  },
  {
    severity: "Watch",
    title: "Gujarat branch cluster",
    detail: "Three branches share one merchant pattern",
    meta: "Branch",
  },
  {
    severity: "Watch",
    title: "Night ATM withdrawals",
    detail: "46 events above the six-month pace",
    meta: "Channel",
  },
  {
    severity: "Note",
    title: "September campaign report",
    detail: "Employee report is ready for review",
    meta: "Campaign",
  },
];

const regions = [
  { name: "West", value: 86 },
  { name: "North", value: 71 },
  { name: "South", value: 54 },
  { name: "East", value: 33 },
];

const recent = [
  { title: "Card-not-present spike", status: "Open", when: "Today, 09:40" },
  { title: "Gujarat branch cluster", status: "Notes saved", when: "Yesterday" },
  { title: "Personal-loan markers", status: "Open", when: "28 Sep" },
];

export default function CommandCenterSample() {
  const [layout, setLayout] = useState<"brief" | "queue">("brief");
  const [active, setActive] = useState(0);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("risklens-workspace-v1");
      const theme = saved ? (JSON.parse(saved) as { theme?: string }).theme : undefined;
      document.documentElement.dataset.theme = theme === "light" ? "light" : "dark";
    } catch {
      document.documentElement.dataset.theme = "dark";
    }
  }, []);
  const selected = signals[active];
  return (
    <div className="explore">
      <div className="explore-bar">
        <p>Layout sample. Static figures only. The live Command Center is unchanged.</p>
        <div className="explore-switch" role="group" aria-label="Sample layout">
          <button
            type="button"
            aria-pressed={layout === "brief"}
            onClick={() => setLayout("brief")}
          >
            Brief
          </button>
          <button
            type="button"
            aria-pressed={layout === "queue"}
            onClick={() => setLayout("queue")}
          >
            Queue
          </button>
        </div>
        <a href="/#command-center">Live Command Center</a>
      </div>
      {layout === "brief" ? (
        <Brief />
      ) : (
        <Queue selected={selected} active={active} onSelect={setActive} />
      )}
    </div>
  );
}

function Brief() {
  return (
    <main className="sheet">
      <header className="mast">
        <p className="kicker">Meridian Bank · September 2026</p>
        <div className="mast-row">
          <h1>Fraud flags are 1,091. Loan default markers are 765.</h1>
          <a className="text-action" href="/#ai-analyst">
            Ask about this month
          </a>
        </div>
        <p className="lede">
          Exposure here is flagged value divided by principal, not confirmed loss. The six-month
          window runs April through September.
        </p>
      </header>
      <dl className="rail">
        <div>
          <dt>Flagged transactions</dt>
          <dd>1,091</dd>
        </div>
        <div>
          <dt>Default markers</dt>
          <dd>765</dd>
        </div>
        <div>
          <dt>Customers</dt>
          <dd>10,000</dd>
        </div>
        <div>
          <dt>Months in view</dt>
          <dd>6</dd>
        </div>
      </dl>
      <div className="split">
        <section>
          <h2>Needs a look</h2>
          <ol className="lines">
            {signals.map((item) => (
              <li key={item.title}>
                <span className={item.severity === "High" ? "sev high" : "sev"}>
                  {item.severity}
                </span>
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.detail}</small>
                </span>
                <em>{item.meta}</em>
              </li>
            ))}
          </ol>
        </section>
        <section className="regions">
          <h2>Where the flags sit</h2>
          <p>Share of flagged transactions by branch region. Not a loss amount.</p>
          <ul>
            {regions.map((region) => (
              <li key={region.name}>
                <span>{region.name}</span>
                <i style={{ width: `${region.value}%` }} />
                <b>{region.value}</b>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <section className="recent">
        <h2>Recent investigations</h2>
        <ul>
          {recent.map((item) => (
            <li key={item.title}>
              <strong>{item.title}</strong>
              <span>{item.status}</span>
              <time>{item.when}</time>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function Queue({
  selected,
  active,
  onSelect,
}: {
  selected: (typeof signals)[number];
  active: number;
  onSelect: (index: number) => void;
}) {
  return (
    <main className="desk">
      <aside>
        <p className="kicker">Today · 5 items</p>
        <h1>Start with the next signal.</h1>
        <ol>
          {signals.map((item, index) => (
            <li key={item.title}>
              <button
                type="button"
                aria-current={index === active ? "true" : undefined}
                onClick={() => onSelect(index)}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.meta}</small>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </aside>
      <article>
        <p className="kicker">September 2026 · {selected.meta}</p>
        <h2>{selected.title}</h2>
        <p className="lede">
          {selected.detail}. These figures are a layout sample, not a live query.
        </p>
        <dl className="rail compact">
          <div>
            <dt>Flagged transactions</dt>
            <dd>1,091</dd>
          </div>
          <div>
            <dt>Default markers</dt>
            <dd>765</dd>
          </div>
          <div>
            <dt>Customers on file</dt>
            <dd>10,000</dd>
          </div>
        </dl>
        <h3>Region mix</h3>
        <ul className="bars">
          {regions.map((region) => (
            <li key={region.name}>
              <span>{region.name}</span>
              <i style={{ width: `${region.value}%` }} />
            </li>
          ))}
        </ul>
        <p className="actions">
          <a href="/#ai-analyst">Ask the analyst about this signal</a>
          <a href="/#risk-radar">Open the full radar</a>
        </p>
      </article>
    </main>
  );
}
