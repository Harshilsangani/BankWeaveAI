import { chromium, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const baseURL = process.env.RISKLENS_BROWSER_BASE_URL ?? "http://127.0.0.1:3000";
const output = path.resolve("artifacts/ui-audit/chat-history");
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({
  channel: process.platform === "win32" ? "msedge" : undefined,
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
  reducedMotion: "reduce",
});
const sid = randomUUID(),
  headers = { "x-risklens-session": sid };
const captures = [],
  errors = [];
await context.addInitScript((session) => localStorage.setItem("risklens-session-v1", session), sid);
const page = await context.newPage();
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.setDefaultTimeout(45000);
const richTitle = "Why did fraud increase in Ahmedabad?";
try {
  for (const question of [
    richTitle,
    "Hello, help me get started",
    "How does the workspace work?",
    "Which tasks can you help with?",
    "Help me read a filled form",
    "Hello, explain the demo limits",
    "How do I use saved chats?",
    "Hello, explain customer onboarding",
  ]) {
    await context.request.post(`${baseURL}/api/conversations`, {
      headers,
      data: { datasetId: "meridian", period: "2026-08" },
    });
    const answer = await context.request.post(`${baseURL}/api/analyst`, {
      headers,
      data: {
        query: question,
        context: { datasetId: "meridian", domain: "fraud", period: "2026-08" },
      },
    });
    if (!answer.ok()) throw new Error(`Screenshot fixture failed (${answer.status()}).`);
  }
  await page.goto(`${baseURL}/#ai-analyst`);
  await expect(page.getByLabel("Ask anything about your banking data")).toBeEnabled({
    timeout: 45000,
  });
  await page.getByRole("button", { name: `Open chat: ${richTitle}`, exact: true }).click();
  await expect(page.locator(".chat-thread .chart-card")).toHaveCount(2);
  const capture = async (name, theme, size) => {
    await page.setViewportSize(size);
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    );
    const layout = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
      historyScrolls:
        document.querySelector(".chat-history-list").scrollHeight >
        document.querySelector(".chat-history-list").clientHeight,
      composer: (() => {
        const r = document.querySelector(".chat-composer").getBoundingClientRect();
        return { top: r.top, bottom: r.bottom };
      })(),
      sidebarProfile: (() => {
        const r = document.querySelector(".sidebar .profile").getBoundingClientRect();
        return { top: r.top, bottom: r.bottom };
      })(),
    }));
    if (layout.documentWidth > size.width) throw new Error(`Page overflow in ${name}`);
    if (
      (size.width > 760 || name.endsWith("history-drawer")) &&
      layout.sidebarProfile.bottom > size.height + 1
    )
      throw new Error(`Profile below the viewport in ${name}: ${layout.sidebarProfile.bottom}`);
    await page.screenshot({ path: path.join(output, `${name}.png`) });
    captures.push({ name, theme, size, ...layout });
  };
  for (const theme of ["dark", "light"]) {
    await page.locator(".sidebar").evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.locator(".chat-scroll").evaluate((el) => {
      el.scrollTop = 0;
    });
    await capture(`desktop-${theme}-rich-answer`, theme, { width: 1440, height: 1050 });
    await capture(`laptop-${theme}-rich-answer`, theme, { width: 1366, height: 768 });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page.locator(".sidebar").evaluate((el) => {
      el.scrollTop = 0;
    });
    await capture(`mobile-${theme}-history-drawer`, theme, { width: 390, height: 844 });
    await page.getByLabel("Search chats").fill("Ahmedabad");
    await capture(`mobile-${theme}-history-search`, theme, { width: 390, height: 844 });
    await page.getByRole("button", { name: `Open chat: ${richTitle}`, exact: true }).click();
    await expect(page.getByRole("button", { name: "Open navigation" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    await expect(page.getByLabel("Ask anything about your banking data")).toBeEnabled();
    await page.locator(".chat-scroll").evaluate((el) => {
      el.scrollTop = 0;
    });
    await capture(`mobile-${theme}-restored-answer`, theme, { width: 390, height: 844 });
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page.getByLabel("Search chats").fill("");
    await page.keyboard.press("Escape");
  }
  const manifest = { captures, errors };
  await fs.writeFile(path.join(output, "layout.json"), JSON.stringify(manifest, null, 2));
  await fs.writeFile(
    path.join(output, "index.html"),
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>BankWeave saved chat review</title><style>body{margin:0;padding:32px;background:#202124;color:#e8eaed;font:15px system-ui}h1{font-size:24px}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:24px}figure{margin:0;padding:16px;background:#292a2d;border-radius:16px}img{width:100%;max-height:750px;object-fit:contain;object-position:top}figcaption{margin:12px 0;color:#a8c7fa}a{color:inherit}</style><h1>BankWeave AI — saved chat review</h1><p>${captures.length} desktop, laptop and mobile captures. Page overflow: 0. Browser errors: ${errors.length}. Synthetic data, local provider.</p><section>${captures.map((c) => `<figure><a href="${c.name}.png"><img src="${c.name}.png" alt="${c.name.replaceAll("-", " ")}" loading="lazy"></a><figcaption>${c.name.replaceAll("-", " ")}</figcaption></figure>`).join("")}</section></html>`
  );
  if (errors.length) throw new Error(`${errors.length} browser errors. See layout.json.`);
  console.log(`Captured ${captures.length} views with no page overflow or browser errors.`);
} finally {
  await browser.close();
}
