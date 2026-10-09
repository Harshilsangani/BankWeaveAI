import { chromium, expect as baseExpect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const phase = process.argv[2] ?? "after";
const detailed = phase !== "before";
const fullThemeAudit = phase === "google-theme";
const expect = baseExpect.configure({ timeout: 45000 });
const baseURL = process.env.RISKLENS_BROWSER_BASE_URL ?? "http://127.0.0.1:3000";
const output = path.resolve("artifacts/ui-audit", phase);
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({
  channel: process.platform === "win32" ? "msedge" : undefined,
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
page.setDefaultTimeout(45000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text().slice(0, 1500));
});
const captures = [];
if (
  process.argv.includes("--finish-light") ||
  process.argv.includes("--final-check") ||
  process.argv.includes("--drawer-check") ||
  process.argv.includes("--forms-check")
) {
  const previous = JSON.parse(await fs.readFile(path.join(output, "layout.json"), "utf8"));
  captures.push(...previous.captures);
  errors.push(...previous.errors);
}
const screens = [
  ["command-center", "Command Center"],
  ["ai-analyst", "AI Analyst"],
  ["risk-radar", "Risk Radar"],
  ["investigations", "Investigations"],
  ["scenario-simulator", "Scenario Simulator"],
  ["reports", "Reports"],
  ["knowledge", "Knowledge library"],
  ["settings", "Settings"],
  ["data-workspace", "Data Workspace"],
];
async function go(slug, heading) {
  await page.goto(`${baseURL}/#${slug}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible({
    timeout: 45000,
  });
  if (slug === "ai-analyst") await expect(page.getByLabel("Analysis dataset")).toBeEnabled();
  if (slug === "data-workspace")
    await expect(page.getByRole("button", { name: "Aarav Shah", exact: true })).toBeVisible();
  if (slug === "knowledge") await expect(page.locator(".policy-card").first()).toBeVisible();
  if (slug === "knowledge")
    await expect(page.getByRole("button", { name: "Add policy document" })).toBeVisible();
  if (slug === "risk-radar")
    await expect(page.getByRole("button", { name: "Run detection", exact: true })).toBeVisible();
  if (slug === "settings") await expect(page.getByLabel("Local staff role")).toBeVisible();
}
async function capture(name, viewport, theme, target = page) {
  await target.waitForTimeout(350);
  const filename = `${viewport}-${theme}-${name}.png`;
  const layout = await target.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    overflow: [
      ...document.querySelectorAll(
        "main button, main input, main select, main textarea, .dialog-content"
      ),
    ]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return (
          r.width &&
          r.height &&
          (r.right > innerWidth + 1 || r.left < -1) &&
          !el.closest(".table-scroll, .data-table-scroll, .relationship-canvas")
        );
      })
      .map((el) => ({
        text: (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 100),
        class: el.className,
      })),
  }));
  await target.screenshot({
    path: path.join(output, filename),
    fullPage:
      (await target.getByRole("dialog").count()) === 0 &&
      (await target.locator('.mobile-menu[aria-expanded="true"]').count()) === 0,
    animations: "disabled",
  });
  const existing = captures.findIndex((item) => item.filename === filename);
  if (existing !== -1) captures.splice(existing, 1);
  captures.push({ name, viewport, theme, filename, ...layout });
  console.log(
    `${filename} — overflow: ${layout.documentWidth - layout.viewportWidth}px; controls: ${layout.overflow.length}`
  );
}
try {
  if (process.argv.includes("--forms-check")) {
    // Inspect write workflows without submitting or changing customer records.
    await go("risk-radar", "Risk Radar");
    await page
      .locator(".risk-card")
      .filter({ hasText: "Suspicious device cluster" })
      .getByRole("button", { name: "Investigate", exact: true })
      .click();
    await expect(page.getByRole("heading", { name: "Observed relationship map" })).toBeVisible();
    for (const theme of ["dark", "light"]) {
      await go("settings", "Settings");
      await page
        .getByRole("button", { name: theme === "dark" ? "Dark" : "Light", exact: true })
        .click();
      for (const [viewport, size] of [
        ["desktop", { width: 1440, height: 1050 }],
        ["mobile", { width: 390, height: 844 }],
      ]) {
        await page.setViewportSize(size);
        await go("data-workspace", "Data Workspace");
        await page.getByRole("button", { name: "Add customer", exact: true }).click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await capture("customer-create", viewport, theme);
        await page.getByRole("button", { name: "Close dialog" }).click();
        await page.getByRole("button", { name: "Edit Aarav Shah", exact: true }).click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await capture("customer-edit", viewport, theme);
        await page.getByRole("button", { name: "Close dialog" }).click();
        await page.getByRole("button", { name: "Delete Aarav Shah", exact: true }).click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await capture("customer-delete-review", viewport, theme);
        await page.getByRole("button", { name: "Cancel", exact: true }).click();
        await page.getByRole("button", { name: "Aarav Shah", exact: true }).click();
        await expect(page.getByRole("dialog")).toContainText("ACC-00001");
        await page.getByText("Controlled record maintenance", { exact: true }).click();
        const workflow = page.getByLabel("Record workflow");
        await expect(workflow).toBeVisible();
        for (const [value, label] of [
          ["policies", "insurance-maintenance"],
          ["payments", "payment-maintenance"],
        ]) {
          await workflow.selectOption(value);
          await workflow.scrollIntoViewIfNeeded();
          await capture(label, viewport, theme);
        }
        await page.getByText("Controlled record maintenance", { exact: true }).click();
        await page.getByText("KYC review cases", { exact: true }).click();
        await page.getByLabel("New KYC review reason").scrollIntoViewIfNeeded();
        await capture("kyc-review", viewport, theme);
        await page.getByText("KYC review cases", { exact: true }).click();
        await page.getByText("Cashflow & recorded obligations", { exact: true }).click();
        await page
          .getByText("Cashflow & recorded obligations", { exact: true })
          .scrollIntoViewIfNeeded();
        await capture("customer-cashflow", viewport, theme);
        await page.getByRole("button", { name: "Close dialog" }).click();
        await go("knowledge", "Knowledge library");
        await page.getByRole("button", { name: "Add policy document" }).click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await capture("policy-upload", viewport, theme);
        await page.getByRole("button", { name: "Close dialog" }).click();
        await go("ai-analyst", "AI Analyst");
        await capture("analyst-welcome", viewport, theme);
        await go("investigations", "Follow the evidence.");
        await page
          .getByRole("heading", { name: "Observed relationship map" })
          .scrollIntoViewIfNeeded();
        await capture("relationship-map", viewport, theme);
      }
    }
    await page.setViewportSize({ width: 1440, height: 1050 });
    await page.getByRole("button", { name: "Create report", exact: true }).click();
    await expect(page.getByRole("button", { name: "Download report", exact: true })).toBeVisible();
    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download report", exact: true }).click();
    const download = await downloading;
    const reportPath = path.join(output, "downloaded-report.html");
    await download.saveAs(reportPath);
    const reportPage = await context.newPage();
    await reportPage.goto(pathToFileURL(reportPath).href);
    await capture("downloaded-report", "desktop", "light", reportPage);
    await reportPage.setViewportSize({ width: 390, height: 844 });
    await capture("downloaded-report", "mobile", "light", reportPage);
    await reportPage.close();
  } else if (process.argv.includes("--drawer-check")) {
    await go("knowledge", "Knowledge library");
    await page.getByRole("button", { name: "Read policy", exact: true }).first().click();
    await capture("policy-reader", "desktop", "dark");
    await page.getByRole("button", { name: "Close dialog" }).click();
    await page.getByRole("button", { name: "Search workspace" }).click();
    await capture("command-palette", "desktop", "dark");
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 390, height: 844 });
    await go("risk-radar", "Risk Radar");
    await page.getByRole("button", { name: "Dismiss", exact: true }).first().click();
    await expect(
      page.getByRole("status").filter({ hasText: "Risk dismissal saved." })
    ).toBeVisible();
    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(page.locator(".toast")).toHaveCount(0);
    await capture("navigation", "mobile", "dark");
  } else if (process.argv.includes("--final-check")) {
    await go("settings", "Settings");
    await page.getByRole("button", { name: "Light", exact: true }).click();
    await capture("settings", "desktop", "light");
    await go("knowledge", "Knowledge library");
    await expect(page.getByRole("button", { name: "Add policy document" })).toBeVisible();
    await capture("knowledge", "desktop", "light");
    await go("risk-radar", "Risk Radar");
    await expect(page.getByRole("button", { name: "Run detection", exact: true })).toBeVisible();
    await capture("risk-radar", "desktop", "light");
    await go("data-workspace", "Data Workspace");
    await capture("data-workspace", "desktop", "light");
    await go("settings", "Settings");
    await page.getByRole("button", { name: "Dark", exact: true }).click();
    await page.setViewportSize({ width: 900, height: 1200 });
    await go("command-center", "Command Center");
    await capture("command-center", "tablet", "dark");
    for (const [viewport, size] of [
      ["desktop", { width: 1440, height: 1050 }],
      ["mobile", { width: 390, height: 844 }],
    ]) {
      await page.setViewportSize(size);
      await go("data-workspace", "Data Workspace");
      await page.getByRole("button", { name: "Aarav Shah", exact: true }).click();
      await expect(page.getByRole("dialog")).toContainText("ACC-00001");
      await capture("customer-overview", viewport, "dark");
      await page.getByText("Declared needs & staff suggestions", { exact: true }).click();
      await page.getByLabel("Consent to suggestion review").scrollIntoViewIfNeeded();
      await capture("customer-needs", viewport, "dark");
      await page.getByRole("button", { name: "Close dialog" }).click();
      await page.getByRole("button", { name: "Data quality & imports", exact: true }).click();
      await expect(
        page.getByText("Preview a CSV transaction import", { exact: true })
      ).toBeVisible();
      await capture("data-quality", viewport, "dark");
      await go("risk-radar", "Risk Radar");
      await expect(
        page.getByRole("button", { name: "Dismiss", exact: true }).first()
      ).toBeVisible();
      await page.getByRole("button", { name: "Dismiss", exact: true }).first().click();
      await expect(
        page.getByRole("status").filter({ hasText: "Risk dismissal saved." })
      ).toBeVisible();
      await page.evaluate(() => {
        location.hash = "ai-analyst";
      });
      await expect(page.locator(".analyst-notice")).toContainText("Risk dismissal saved.");
      const composer = await page.locator(".chat-composer").boundingBox();
      const notice = await page.locator(".analyst-notice").boundingBox();
      expect(notice.y + notice.height).toBeLessThan(composer.y);
      expect(composer.y + composer.height).toBeLessThanOrEqual(size.height);
      await capture("analyst-notice", viewport, "dark");
    }
    await page.setViewportSize({ width: 1440, height: 1050 });
    await go("knowledge", "Knowledge library");
    await page.getByRole("button", { name: "Read policy", exact: true }).first().click();
    await capture("policy-reader", "desktop", "dark");
    await page.getByRole("button", { name: "Close dialog" }).click();
    await page.getByRole("button", { name: "Search workspace" }).click();
    await capture("command-palette", "desktop", "dark");
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Open navigation" }).click();
    await capture("navigation", "mobile", "dark");
  } else if (process.argv.includes("--finish-light")) {
    await go("settings", "Settings");
    await page.getByRole("button", { name: "Light", exact: true }).click();
    await go("data-workspace", "Data Workspace");
    await capture("data-workspace", "desktop", "light");
    await go("settings", "Settings");
    await page.getByRole("button", { name: "Dark", exact: true }).click();
  } else {
    for (const [viewport, size] of [
      ["desktop", { width: 1440, height: 1050 }],
      ["mobile", { width: 390, height: 844 }],
    ]) {
      await page.setViewportSize(size);
      for (const [slug, heading] of screens) {
        await go(slug, heading);
        await capture(slug, viewport, "dark");
        if (slug === "data-workspace") {
          await page.getByRole("button", { name: "Aarav Shah", exact: true }).click();
          await expect(page.getByRole("dialog")).toContainText("ACC-00001");
          await capture("customer-overview", viewport, "dark");
          if (detailed) {
            await page.getByText("Declared needs & staff suggestions", { exact: true }).click();
            await expect(page.getByLabel("Consent to suggestion review")).toBeVisible();
            await page.getByLabel("Consent to suggestion review").scrollIntoViewIfNeeded();
            await capture("customer-needs", viewport, "dark");
          }
          await page.getByRole("button", { name: "Close dialog" }).click();
          await page.getByRole("button", { name: "Source records", exact: true }).click();
          await expect(page.locator(".data-pagination")).toContainText(/1[,.]20[,.]000|120,000/, {
            timeout: 45000,
          });
          await capture("source-records", viewport, "dark");
          await page.getByRole("button", { name: "Data quality & imports", exact: true }).click();
          await expect(
            page.getByText("Preview a CSV transaction import", { exact: true })
          ).toBeVisible();
          await capture("data-quality", viewport, "dark");
        }
      }
    }
    await page.setViewportSize({ width: 1440, height: 1050 });
    await go("ai-analyst", "AI Analyst");
    await page
      .getByLabel("Ask anything about your banking data")
      .fill("Why did fraud increase this month?");
    await page.getByRole("button", { name: "Send question", exact: true }).click();
    await expect(page.getByRole("heading", { name: "The signal behind the increase" })).toBeVisible(
      {
        timeout: 60000,
      }
    );
    await capture("analyst-answer", "desktop", "dark");
    await page.locator(".chat-scroll").evaluate((el) => (el.scrollTop = el.scrollHeight));
    await capture("analyst-answer-bottom", "desktop", "dark");
    await page
      .getByRole("button", { name: "Open investigation workspace", exact: true })
      .last()
      .click();
    await expect(page.getByRole("heading", { name: "Follow the evidence." })).toBeVisible({
      timeout: 60000,
    });
    await capture("investigation-open", "desktop", "dark");
    await page.setViewportSize({ width: 390, height: 844 });
    await capture("investigation-open", "mobile", "dark");
    await page.setViewportSize({ width: 1440, height: 1050 });
    await page.getByRole("button", { name: "Run a scenario", exact: true }).click();
    await page.getByRole("button", { name: "Run simulation", exact: true }).click();
    await expect(page.getByText("52% modeled reduction")).toBeVisible();
    await capture("scenario-result", "desktop", "dark");
    await page.getByRole("button", { name: "Create report with this scenario" }).click();
    await expect(page.getByRole("button", { name: "Download report" })).toBeVisible({
      timeout: 60000,
    });
    await capture("saved-report", "desktop", "dark");
    if (fullThemeAudit) {
      await go("settings", "Settings");
      await page.getByRole("button", { name: "Light", exact: true }).click();
      await go("ai-analyst", "AI Analyst");
      await page.locator(".chat-scroll").evaluate((el) => (el.scrollTop = 0));
      await capture("analyst-answer", "desktop", "light");
      await page.setViewportSize({ width: 390, height: 844 });
      await capture("analyst-answer", "mobile", "light");
      await page.locator(".chat-scroll").evaluate((el) => (el.scrollTop = el.scrollHeight));
      await capture("analyst-answer-bottom", "mobile", "light");
      await go("settings", "Settings");
      await page.getByRole("button", { name: "Dark", exact: true }).click();
      await page.setViewportSize({ width: 1440, height: 1050 });
    }
    if (detailed) {
      await go("ai-analyst", "AI Analyst");
      await page.locator(".composer-tools summary").click();
      await capture("analyst-tools", "desktop", "dark");
      await page.setViewportSize({ width: 390, height: 844 });
      await capture("analyst-tools", "mobile", "dark");
      await page.locator(".composer-tools summary").click();
      await page.getByLabel("Upload customer form").setInputFiles("public/demo/customer-form.pdf");
      await expect(page.locator(".markdown-preview")).toContainText("Ananya Shah", {
        timeout: 60000,
      });
      await capture("uploaded-form", "mobile", "dark");
      await page.setViewportSize({ width: 1440, height: 1050 });
      await capture("uploaded-form", "desktop", "dark");
      await go("knowledge", "Knowledge library");
      await page.getByRole("button", { name: "Read policy", exact: true }).first().click();
      await capture("policy-reader", "desktop", "dark");
      await page.getByRole("button", { name: "Close dialog" }).click();
      await page.getByRole("button", { name: "Search workspace" }).click();
      await capture("command-palette", "desktop", "dark");
      await page.keyboard.press("Escape");
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole("button", { name: "Open navigation" }).click();
      await capture("navigation", "mobile", "dark");
      await page.keyboard.press("Escape");
      await page.setViewportSize({ width: 900, height: 1200 });
      await go("command-center", "Command Center");
      await capture("command-center", "tablet", "dark");
      await page.setViewportSize({ width: 1440, height: 1050 });
    }
    await go("settings", "Settings");
    await page.getByRole("button", { name: "Light", exact: true }).click();
    for (const [viewport, size] of [
      ["desktop", { width: 1440, height: 1050 }],
      ...(fullThemeAudit ? [["mobile", { width: 390, height: 844 }]] : []),
    ]) {
      await page.setViewportSize(size);
      for (const [slug, heading] of screens) {
        await go(slug, slug === "investigations" ? "Follow the evidence." : heading);
        await capture(slug, viewport, "light");
        if (fullThemeAudit && slug === "data-workspace") {
          await page.getByRole("button", { name: "Aarav Shah", exact: true }).click();
          await expect(page.getByRole("dialog")).toContainText("ACC-00001");
          await capture("customer-overview", viewport, "light");
          await page.getByText("Declared needs & staff suggestions", { exact: true }).click();
          await expect(page.getByLabel("Consent to suggestion review")).toBeVisible();
          await page.getByLabel("Consent to suggestion review").scrollIntoViewIfNeeded();
          await capture("customer-needs", viewport, "light");
          await page.getByRole("button", { name: "Close dialog" }).click();
          await page.getByRole("button", { name: "Source records", exact: true }).click();
          await expect(page.locator(".data-pagination")).toContainText(/1[,.]20[,.]000|120,000/);
          await capture("source-records", viewport, "light");
          await page.getByRole("button", { name: "Data quality & imports", exact: true }).click();
          await expect(
            page.getByText("Preview a CSV transaction import", { exact: true })
          ).toBeVisible();
          await capture("data-quality", viewport, "light");
        }
      }
      if (fullThemeAudit) {
        await go("knowledge", "Knowledge library");
        await page.getByRole("button", { name: "Read policy", exact: true }).first().click();
        await capture("policy-reader", viewport, "light");
        await page.getByRole("button", { name: "Close dialog" }).click();
        await page.getByRole("button", { name: "Search workspace" }).click();
        await capture("command-palette", viewport, "light");
        await page.keyboard.press("Escape");
        await go("ai-analyst", "AI Analyst");
        await page.locator(".chat-scroll").evaluate((el) => (el.scrollTop = el.scrollHeight));
        await capture("uploaded-form", viewport, "light");
        await page.locator(".composer-tools summary").click();
        await capture("analyst-tools", viewport, "light");
        await page.locator(".composer-tools summary").click();
      }
    }
    if (fullThemeAudit) {
      await page.getByRole("button", { name: "Open navigation" }).click();
      await capture("navigation", "mobile", "light");
      await page.keyboard.press("Escape");
    }
    await go("settings", "Settings");
    await page.getByRole("button", { name: "Dark", exact: true }).click();
  }
} finally {
  await fs.writeFile(
    path.join(output, "layout.json"),
    JSON.stringify({ phase, capturedAt: new Date().toISOString(), errors, captures }, null, 2)
  );
  const cards = captures
    .map(
      (c) =>
        `<article data-theme="${c.theme}" data-viewport="${c.viewport}"><h2>${c.viewport} · ${c.theme} · ${c.name}</h2><p>Page overflow: ${c.documentWidth - c.viewportWidth}px · Outlying controls: ${c.overflow.length}</p><a href="${c.filename}"><img loading="lazy" src="${c.filename}" alt="${c.name}" /></a></article>`
    )
    .join("");
  await fs.writeFile(
    path.join(output, "index.html"),
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>BankWeave UI audit — ${phase}</title><style>body{font:14px "Segoe UI",system-ui;background:#202124;color:#f1f3f4;margin:32px}h1{font-size:28px;font-weight:550}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(330px,100%),1fr));gap:24px}article{background:#292a2d;border:1px solid #414449;border-radius:20px;padding:16px}h2{font-size:15px}p,label{color:#bdc1c6;font-size:13px}img{width:100%;max-height:650px;object-fit:contain;object-position:top;background:#202124}nav{display:flex;flex-wrap:wrap;gap:20px;align-items:center;margin:24px 0}select{font:inherit;color:#a8c7fa;background:#303236;border:1px solid #626872;border-radius:24px;padding:10px 16px;margin-left:8px}a{color:#a8c7fa}select:focus-visible,a:focus-visible{outline:2px solid #a8c7fa;outline-offset:4px}@media(max-width:600px){body{margin:20px}}</style><h1>BankWeave UI audit — ${phase}</h1><p>${captures.length} screenshots · ${errors.length} browser errors · <a href="http://127.0.0.1:3000/">Open BankWeave</a></p><nav aria-label="Screenshot filters"><label>Theme<select id="theme"><option value="">Both themes</option><option value="light">Light</option><option value="dark">Dark</option></select></label><label>Screen<select id="viewport"><option value="">All sizes</option><option value="desktop">Desktop</option><option value="mobile">Mobile</option><option value="tablet">Tablet</option></select></label><span id="count" aria-live="polite"></span></nav><main>${cards}</main><script>const theme=document.getElementById('theme'),viewport=document.getElementById('viewport');function filter(){let count=0;document.querySelectorAll('article').forEach(card=>{card.hidden=Boolean((theme.value&&card.dataset.theme!==theme.value)||(viewport.value&&card.dataset.viewport!==viewport.value));if(!card.hidden)count++});document.getElementById('count').textContent=count+' screenshots shown'}theme.addEventListener('change',filter);viewport.addEventListener('change',filter);filter();</script></html>`
  );
  await browser.close();
}
