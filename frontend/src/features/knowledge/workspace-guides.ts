import type { Page } from "@/features/workspace/types";

export interface WorkspaceGuide {
  page: Page;
  title: string;
  summary: string;
  steps: string[];
  tip: string;
}

export const workspaceGuides: WorkspaceGuide[] = [
  {
    page: "Command Center",
    title: "Start with your workspace overview",
    summary: "Understand key metrics, review risk signals, and choose your next task.",
    steps: [
      "Review the headline metrics and trends to see where recorded activity has changed.",
      "Open a risk signal to investigate its evidence, or go to Risk Radar for the full list.",
      "Choose AI Analyst to explore a question. Use Manage customer data to open the Data Workspace.",
    ],
    tip: "Metrics describe the available historical data. They are not a live banking feed.",
  },
  {
    page: "AI Analyst",
    title: "Ask questions and follow the evidence",
    summary: "Choose a dataset, ask a question, or read a customer form.",
    steps: [
      "Open + beside the message box to attach a form or change the dataset. Questions use the dataset's available history.",
      "Choose a suggested question or type your own. Follow up to narrow a region or compare results.",
      "Review the answer's charts, tables, sources, and Query details. Select OCR in Tools, then use + → Attachment to upload a PDF or image.",
      "Open Tools and choose Research. The selected tool appears beside Tools, and its cross turns that tool off. You can also ask a research question. Export PDF on that answer includes its graphs and evidence.",
      "Use New chat in the toolbar for a separate conversation. Reopen saved conversations from Recent chats in the sidebar.",
    ],
    tip: "Analysts and Admins can run analyses and read forms. Viewers can browse available data and saved results.",
  },
  {
    page: "Risk Radar",
    title: "Find the signals that need attention",
    summary:
      "Run recorded detection rules, review their results, and investigate source-backed signals.",
    steps: [
      "Choose the dataset and source month. The detection method and preceding-month baseline stay visible.",
      "Choose Run detection to record matches, non-matches and insufficient-data checks. Refresh a stale run before investigating.",
      "Search or filter the queue by severity, transaction risk or credit risk. Review the recorded rule and source evidence before acting.",
      "Choose Investigate to open the same dataset/month scope. Dismiss reviewed signals; the Dismissed filter and Restore dismissed keep those decisions accessible.",
      "Open Source coverage & run receipt for the input hash, rule version, data limitations and execution time.",
    ],
    tip: "These are historical review rules with zero model calls, not live monitoring or trained predictions. Missing comparisons are not a clean bill of health; signals require human review.",
  },
  {
    page: "Investigations",
    title: "Build a case from recorded evidence",
    summary: "Find saved cases, review evidence, record a decision, and export the staff review.",
    steps: [
      "Search the saved-case inbox or filter by status and dataset. Open a case, or start one from a scoped Risk Radar signal.",
      "Use Overview for the saved findings and segments. Evidence & links shows the source references, current record pages, and observed relationship map where links exist.",
      "Check source changes before browsing current records. A case retains its original findings even if the database changes later.",
      "In Review, use Prepare review brief for evidence-linked observations, untested explanations, missing evidence and suggested checks. Use draft in my review fills an editable note; Save case update remains a separate staff action. Reopening the brief reuses its saved result.",
      "Open Review to set the reviewer and review status, then save a note explaining the evidence and conclusion. Resolving a case requires a resolution note. Activity shows the recorded review history.",
      "Save or discard draft changes before creating a report. The report freezes the case revision, staff notes, source receipt, and saved findings; later edits do not rewrite it.",
    ],
    tip: "Draft notes stay in this browser session until saved or discarded. Starting a fresh investigation creates a separate case; original cases and reports stay available. Review decisions do not execute banking actions.",
  },
  {
    page: "Card Campaigns",
    title: "Prepare card offers and an employee report",
    summary: "Screen linked synthetic customer data, match products, and review email drafts.",
    steps: [
      "Choose the dataset. The campaign uses its published source window. Check the cutoff, cohort, and data-readiness note.",
      "Select products or compare the active product catalog, then choose Prepare employee report. The saved run continues if you leave the page.",
      "Review prospects, missing-data reasons, contact suppressions, and email drafts. The completed report appears in Command Center, Reports, and your notifications.",
      "Admins can record Reviewed, Request changes, or Reject, and opt into a monthly schedule from Run history.",
    ],
    tip: "Potential prospects are not card approvals. Staff reports and review decisions do not send customer emails or issue cards.",
  },
  {
    page: "Reports",
    title: "Find and share saved findings",
    summary: "Review investigation findings and assigned employee card-campaign reports.",
    steps: [
      "Browse the saved report cards and review their findings and source references.",
      "Download a report when you need an HTML copy for review.",
      "Create investigation reports from an investigation, or prepare an employee report from Card Campaigns. Use the report tabs to find either type.",
    ],
    tip: "Saved reports preserve their original evidence. Create a new report to capture a later analysis.",
  },
  {
    page: "Data Workspace",
    title: "Browse and maintain customer data",
    summary: "Find customer records, inspect source data, and review imports or approval requests.",
    steps: [
      "Open Manage customer data from Command Center, then search or filter the customer directory.",
      "Open a customer to review accounts, loans, repayments, insurance, and declarations. Use Source records for the underlying data.",
      "Use Data quality & imports to review data or import CSV/Excel files with column mapping and validation.",
      "Admins can maintain banking records and review Approval requests. Analysts can correct extracted forms and submit them for admin review.",
    ],
    tip: "Approving a form creates a profile pending verification. It does not approve KYC or open an account.",
  },
  {
    page: "Knowledge",
    title: "Find a guide or policy",
    summary: "Search workspace help and reference documents in one library.",
    steps: [
      "Search for a page, task, policy, or topic. Choose Page guides or Policies & procedures to narrow the results.",
      "Filter by workspace page to find a guide, read its steps, and use Open page to go directly to that task.",
      "Read a policy's sections or ask the analyst about it. Authorized staff can add a policy document or a new version.",
    ],
    tip: "Page guides explain how to use the workspace. Policy documents provide separate versioned reference material.",
  },
  {
    page: "Settings",
    title: "Manage your workspace preferences",
    summary: "Choose a theme and review the AI connection and your staff permissions.",
    steps: [
      "Choose Light or Dark under Appearance. Your choice is saved on this device.",
      "Review AI & analytics for the connected provider, and Staff permissions for your current access.",
      "In a development workspace, Local test role lets you preview Viewer, Analyst, and Admin access. For verified access changes, contact your administrator.",
    ],
    tip: "Your assigned role controls which analysis and data maintenance actions are available.",
  },
];
