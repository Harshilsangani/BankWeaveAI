import type { Report } from "@/features/reports/types";
import { money, formatMoney, scopeLabel } from "@/shared/lib/utils";
const reportStyles = `body{font:15px/1.7 "Segoe UI",system-ui,sans-serif;color:#1f1f1f;background:#fff;max-width:900px;margin:40px auto;padding:30px;overflow-wrap:anywhere}h1{font-size:32px;font-weight:550;line-height:1.25;letter-spacing:-.7px}h2{border-bottom:1px solid #e0e3e7;padding-bottom:10px;font-size:20px;font-weight:550;margin-top:32px}h3{font-size:16px}.label{color:#0b57d0;letter-spacing:1.5px;font-size:12px}small{color:#525963}.metrics{display:flex;flex-wrap:wrap;gap:24px;padding:24px;background:#f0f4f9;border-radius:20px}.metrics div{flex:1;min-width:160px;color:#525963}.metrics b{display:block;font-size:26px;font-weight:550;color:#0b57d0}li{margin:8px 0}pre{white-space:pre-wrap;background:#f0f4f9;border-radius:16px;padding:20px;font-size:13px}footer{border-top:1px solid #e0e3e7;margin-top:32px;padding-top:20px}@media(max-width:600px){body{margin:0;padding:24px}h1{font-size:26px}.metrics{gap:16px}}@media print{body{margin:0;padding:0}.metrics{break-inside:avoid}h2{break-after:avoid}}`;
const escape = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
export function reportHtml(report: Report) {
  const inv = report.investigation;
  const analysis = inv.analysis;
  const amount = (value: number) =>
    analysis ? formatMoney(value, analysis.currency) : money(value);
  const limitations = analysis
    ? `${analysis.datasetName}. ${analysis.period} compared with ${analysis.baseline}. Source version ${analysis.datasetVersion}. ${analysis.limitations.join(" ")} Run ${analysis.runId}.`
    : "September 2026 compared with August 2026. All banking records and policies are synthetic.";
  const list = (items: string[]) =>
    `<ul>${items.map((i) => `<li>${escape(i)}</li>`).join("")}</ul>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(report.title)}</title><style>${reportStyles}</style></head><body><p class="label">BANKWEAVE AI / INVESTIGATION REPORT</p><h1>${escape(report.title)}</h1><small>${escape(report.id)} · ${escape(report.createdAt)} · DEMO / SYNTHETIC DATA</small><h2>Executive summary</h2><p>${escape(inv.risk.summary)}</p><div class="metrics">${inv.metrics.map((m) => `<div>${escape(m.label)}<b>${escape(m.value)}</b></div>`).join("")}</div><h2>Detected issue & affected population</h2><p>${escape(inv.risk.title)}. Severity: ${escape(inv.risk.severity)}. ${inv.risk.affectedRecords} affected records. Estimated exposure: ${amount(inv.risk.estimatedExposure)}. Exposure is flagged value, not confirmed loss.</p><h2>Key findings</h2>${list(inv.findings)}<h2>Supporting evidence & data references</h2>${inv.evidence.map((e) => `<h3>${escape(e.title)}</h3><small>${escape(e.id)} · ${escape(e.source)}</small><p>${escape(e.detail)}</p>${list(e.records)}`).join("")}<h2>Risk assessment</h2><p>These signals warrant investigation and are not confirmed fraud. Correlations do not establish causation. A human reviewer must assess the source records before taking any action.</p><h2>Recommended actions</h2>${list(inv.actions)}${report.scenario ? `<h2>Scenario analysis — illustrative estimate</h2><p>Current exposure ${amount(report.scenario.baseline)}; modeled exposure ${amount(report.scenario.projected)}. Modeled reduction ${amount(report.scenario.reduction)}.</p>${list(report.scenario.assumptions)}` : "<h2>Scenario analysis</h2><p>No scenario is attached to this report.</p>"}<h2>Scope & limitations</h2><p>Analysis scope: ${escape(scopeLabel(inv.scope))}.</p><p>${escape(limitations)} Findings use deterministic local analytics. No Gemini model or live banking system is connected. No controls or financial decisions have been executed.</p><footer><small>BankWeave AI — Understand your data. Investigate risk. Act with confidence.</small></footer></body></html>`;
}
