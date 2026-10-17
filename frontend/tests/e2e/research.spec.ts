import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

test("research scopes database series, renders modern charts, restores and exports the saved PDF", async ({
  page,
  request,
}) => {
  await page.goto("/#ai-analyst");
  await expect(page.getByLabel("Reporting month")).toHaveCount(0);
  await expect(page.getByLabel("Ask anything about your banking data")).toBeEnabled();
  await page.locator(".composer-tools summary").click();
  await page.getByRole("button", { name: "Research", exact: true }).click();
  await expect(page.getByRole("button", { name: "Unselect Research", exact: true })).toBeVisible();
  await page
    .getByLabel("Ask anything about your banking data")
    .fill("Research fraud across channels and regions");
  await page.getByRole("button", { name: "Send question", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Research brief", exact: true })).toBeVisible({
    timeout: 60000,
  });
  await expect(page.locator(".chart-card-research")).toHaveCount(4);
  await expect(page.locator(".answer-heading .export-pdf")).toHaveCount(0);
  const exportActions = page.getByRole("group", { name: "Research export", exact: true });
  await expect(exportActions.getByRole("button", { name: "Export PDF", exact: true })).toHaveCount(
    1
  );
  expect(
    await exportActions.evaluate((element) => {
      const answer = element.closest(".ai-answer")!;
      const content = answer.querySelector(".response-blocks")!;
      const suggestions = answer.querySelector(".suggested-questions")!;
      const followsContent = Boolean(
        content.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING
      );
      const followsSuggestions = Boolean(
        suggestions.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING
      );
      return followsContent && followsSuggestions && element === answer.lastElementChild;
    })
  ).toBe(true);
  await expect(page.locator(".research-donut")).toHaveCount(1);
  await expect(page.locator(".chat-thread")).toContainText("Research scope: Meridian demo");
  await expect(page.locator(".chat-thread")).toContainText(/\d{1,3}(?:,\d{3})+/);
  await page.locator(".chat-tool-trace summary").click();
  await expect(page.locator(".chat-tool-trace")).toContainText("Scoping the research");
  const downloadEvent = page.waitForEvent("download");
  const exportRequest = page.waitForRequest((request) =>
    request.url().includes("/api/analyst/export?")
  );
  await page.getByRole("button", { name: "Export PDF", exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toMatch(
    /^Meridian_demo_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_IST\.pdf$/
  );
  const file = await download.path();
  expect(fs.readFileSync(file!).subarray(0, 4).toString()).toBe("%PDF");
  const id = new URL((await exportRequest).url()).searchParams.get("id")!;
  const unauthorized = await request.get(`/api/analyst/export?id=${id}`, {
    headers: {
      "x-risklens-role": "analyst",
      "x-risklens-session": "foreign-research-export-session",
    },
  });
  expect(unauthorized.status()).toBe(403);
  await page.reload();
  await expect(page.getByRole("button", { name: "Export PDF", exact: true })).toBeVisible();
  await expect(page.locator(".chart-card-research")).toHaveCount(4);
});

test("research remains usable with blocked browser storage and on a phone", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "sessionStorage", {
      get() {
        throw new Error("Storage blocked");
      },
    });
  });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/#ai-analyst");
  await expect(page.getByLabel("Reporting month")).toHaveCount(0);
  await expect(page.getByLabel("Ask anything about your banking data")).toBeEnabled();
  await page.locator(".composer-tools summary").click();
  await page.getByRole("button", { name: "Research", exact: true }).click();
  await expect(page.getByRole("button", { name: "Unselect Research", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  const chat = (await page.getByRole("button", { name: "Start a new chat" }).boundingBox())!;
  expect(chat.x + chat.width).toBeLessThanOrEqual(320);
  await expect(page.locator(".chat-composer")).toBeInViewport();
});

test("cashflow research honors the relative window and downloads an intact structured PDF", async ({
  page,
}) => {
  await page.goto("/#ai-analyst");
  await expect(page.getByLabel("Ask anything about your banking data")).toBeEnabled();
  await page
    .getByLabel("Ask anything about your banking data")
    .fill("Create a full research report of the last three months of transactions and cashflows");
  await page.getByRole("button", { name: "Send question", exact: true }).click();
  await expect(page.locator(".research-execution")).toContainText(
    "Local research · No model API calls"
  );
  await expect(page.locator(".chat-thread")).toContainText("2026-07 to 2026-09");
  await expect(page.locator(".chart-card-research")).toHaveCount(6);
  await expect(page.locator(".chat-thread")).toContainText("Synthetic cashflow reconciliation");
  const responseEvent = page.waitForResponse((response) =>
    response.url().includes("/api/analyst/export?")
  );
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PDF", exact: true }).click();
  const response = await responseEvent;
  const download = await downloadEvent;
  const file = (await download.path())!;
  const bytes = fs.readFileSync(file);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(
    response.headers()["x-content-sha256"]
  );
  const output = execFileSync(
    process.execPath,
    [
      "scripts/runtime/python.mjs",
      "-c",
      "import fitz,sys,json; p=fitz.open(sys.argv[1]); print(json.dumps(dict(pages=len(p),text=' '.join(' '.join(page.get_text().split()) for page in p))))",
      file,
    ],
    { encoding: "utf8" }
  );
  const pdf = JSON.parse(output);
  expect(pdf.pages).toBeGreaterThan(5);
  expect(pdf.text).toContain("Transaction and Cashflow Research");
  expect(pdf.text).toContain("2026-07 to 2026-09");
  expect(pdf.text).toContain("Cashflow monthly SQL tool");
  expect(pdf.text).toContain("Agent and tool execution receipts");
});
