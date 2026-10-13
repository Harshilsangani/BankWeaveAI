import type { Page } from "@/types";

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
      "Choose Open AI Analyst to explore a question. Use Manage customer data to open the Data Workspace.",
    ],
    tip: "Metrics describe the available historical data. They are not a live banking feed.",
  },
  {
    page: "AI Analyst",
    title: "Ask questions and follow the evidence",
    summary: "Choose a dataset and month, ask a question, or read a customer form.",
    steps: [
      "Select Dataset and Month in the toolbar below the navigation. All months uses the dataset's full available history. Turn on Research for a scoped brief: one agent sets the scope, the database calculates the series, and a second agent chooses the charts. Export PDF on that answer.",
      "Choose a suggested question or type your own. Follow up to narrow a region or compare results.",
      "Review the answer's charts, tables, sources, and Query details. Use Tools → Read a document (OCR) to upload a PDF or image.",
      "Use New chat in the toolbar for a separate conversation. Reopen saved conversations from Recent chats in the sidebar.",
    ],
    tip: "Analysts and Admins can run analyses and read forms. Viewers can browse available data and saved results.",
  },
  {
    page: "Risk Radar",
    title: "Find the signals that need attention",
    summary: "Filter risk signals, inspect supporting evidence, and start an investigation.",
    steps: [
      "Review the available signals and use the filters to focus on the relevant severity or risk category.",
      "Open evidence to inspect the recorded activity behind a signal.",
      "Choose Investigate to explore the signal in detail. Dismiss reviewed signals and restore them when needed.",
    ],
    tip: "A signal is a reason to review evidence; it does not establish fraud or a final lending decision.",
  },
  {
    page: "Investigations",
    title: "Build a case from recorded evidence",
    summary: "Explore a risk, review relationships, save notes, and prepare a report.",
    steps: [
      "Choose a risk signal or reopen a saved investigation.",
      "Read the findings, supporting records, and relationship map before drawing conclusions.",
      "Save case notes, explore a scenario, or create a report with the investigation's findings and source references.",
    ],
    tip: "Check the investigation's dataset, period, and region. A saved result reflects its original scope.",
  },
  {
    page: "Scenario Simulator",
    title: "Compare an illustrative scenario",
    summary: "Explore how explicit assumptions could affect a selected risk.",
    steps: [
      "Select the risk you want to explore, or open a scenario from an investigation.",
      "Adjust the available assumptions and choose Run simulation.",
      "Compare the result with the baseline, review the assumptions, and create a report with the scenario if useful.",
    ],
    tip: "Scenario results are illustrative estimates based on your assumptions, not predictions or approved actions.",
  },
  {
    page: "Reports",
    title: "Find and share saved findings",
    summary: "Review reports created from investigations and optional scenarios.",
    steps: [
      "Browse the saved report cards and review their findings and source references.",
      "Download a report when you need an HTML copy for review.",
      "To create another report, open an investigation and choose Create report. A scenario can be included from the simulator.",
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
