import { test, expect } from "@playwright/test";

test("employee campaign report pipeline reaches the dashboard, draft review and notification inbox", async ({
  page,
}) => {
  await page.goto("/#card-campaigns");
  await expect(page.getByRole("heading", { name: "Card Campaigns", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Scenario Simulator", exact: true })).toHaveCount(
    0
  );
  await expect(page.getByRole("button", { name: "Start a new chat" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Prepare employee report", exact: true })
  ).toBeEnabled();
  await expect(page.locator(".campaign-data-status")).toContainText("5,000 existing customers");
  await page.getByRole("button", { name: "Prepare employee report", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Record your employee review", exact: true })
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "2026-10 card campaign", exact: true })
  ).toBeVisible({ timeout: 90000 });
  await expect(page.locator(".campaign-report-detail")).toContainText("Customer emails sent: 0");
  const reportUrl = page.url();
  await page.getByRole("button", { name: "Email drafts", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Read email draft", exact: true }).first()
  ).toBeVisible();
  await page.getByRole("button", { name: "Read email draft", exact: true }).first().click();
  await expect(page.getByRole("dialog")).toContainText("Annual fee: INR");
  await expect(page.getByRole("dialog")).toContainText("No offer has been sent");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Employee report", exact: true }).click();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download employee report", exact: true }).click();
  expect((await downloadEvent).suggestedFilename()).toMatch(/CREPORT-.*-card-campaign\.html/);
  await page.getByRole("button", { name: "Command Center", exact: true }).click();
  await expect(page.locator(".dashboard-campaign-reports")).toContainText("2026-10 card campaign");
  await page.getByRole("button", { name: "Notifications", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("2026-10 card campaign report is ready");
  await page.getByRole("button", { name: "Open employee report", exact: true }).first().click();
  await expect(page.locator(".campaign-report-detail")).toBeVisible();
  await page.goto(reportUrl);
  await expect(page.locator(".campaign-report-detail")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(390);
});

test("BankShield cannot start a campaign and Meridian does not offer a month picker", async ({
  page,
}) => {
  await page.goto("/#card-campaigns");
  await expect(page.getByLabel("Campaign dataset")).toBeEnabled();
  await page.getByLabel("Campaign dataset").selectOption("bankshield");
  await expect(page.locator(".campaign-data-status")).toContainText("incomplete customer joins");
  await expect(
    page.getByRole("button", { name: "Prepare employee report", exact: true })
  ).toBeDisabled();
  await page.getByLabel("Campaign dataset").selectOption("meridian");
  await expect(page.getByLabel("Campaign month")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Prepare employee report", exact: true })
  ).toBeEnabled();
  await page.goto("/#scenario-simulator");
  await expect(page.getByRole("heading", { name: "Card Campaigns", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/#card-campaigns$/);
});

test("admin can review a report without sending and viewers cannot prepare campaigns", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("risklens-role", "admin"));
  await page.reload();
  await page.goto("/#reports");
  await page.getByRole("button", { name: "Card campaigns", exact: true }).click();
  await page.getByRole("button", { name: "Open campaign report", exact: true }).first().click();
  await expect(
    page.getByRole("heading", { name: "Record your employee review", exact: true })
  ).toBeVisible();
  await page
    .getByLabel("Campaign review note")
    .fill("Reviewed demo product matches and fee disclosures.");
  await page.getByRole("button", { name: "Mark reviewed", exact: true }).click();
  await expect(page.locator(".campaign-report-detail")).toContainText("Reviewed");
  await expect(page.locator(".campaign-report-detail")).toContainText("Customer emails sent: 0");
  const denied = await request.post("/api/card-campaigns", {
    headers: { "x-risklens-role": "viewer" },
    data: {},
  });
  expect(denied.status()).toBe(403);
  await page.evaluate(() => localStorage.setItem("risklens-role", "viewer"));
  await page.reload();
  await page.goto("/#card-campaigns");
  await expect(
    page.getByRole("button", { name: "Prepare employee report", exact: true })
  ).toBeDisabled();
});

test("AI Analyst campaign preparation links to the same durable employee report", async ({
  page,
}) => {
  await page.goto("/#ai-analyst");
  const prompt = page.getByLabel("Ask anything about your banking data");
  await expect(prompt).toBeEnabled();
  await prompt.fill("Prepare an October 2026 cashback card campaign report");
  await page.getByRole("button", { name: "Send question", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Open campaign workspace", exact: true })
  ).toBeVisible({ timeout: 60000 });
  await page.getByRole("button", { name: "Open campaign workspace", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Card Campaigns", exact: true })).toBeVisible();
  await expect(page.locator(".campaign-report-detail")).toBeVisible({ timeout: 90000 });
  await expect(page.locator(".campaign-report-detail")).toContainText("Customer emails sent: 0");
});

test("admin publishes a catalog version while a saved employee report keeps its source hashes", async ({
  page,
  request,
}) => {
  const before = await (await request.get("/api/campaign-reports")).json();
  const saved = await (await request.get(`/api/campaign-reports/${before[0].id}`)).json();
  const products = await (await request.get("/api/card-campaigns/products?period=2026-10")).json();
  const selected = products[0];
  await page.addInitScript(() => localStorage.setItem("risklens-role", "admin"));
  await page.goto("/#card-campaigns");
  await page.getByRole("button", { name: "Manage product catalog", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const version = `qa-${Date.now()}`;
  await page.getByLabel("New product version").fill(version);
  await page.getByLabel("Product annual fee").fill("12.34");
  await page.getByRole("button", { name: "Publish product version", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".campaign-page")).toContainText("New product version published");
  const updated = await (await request.get("/api/card-campaigns/products?period=2026-10")).json();
  expect(updated.find((p: { id: string }) => p.id === selected.id)).toMatchObject({
    version,
    annualFeeMinor: 1234,
  });
  const stillSaved = await (await request.get(`/api/campaign-reports/${saved.id}`)).json();
  expect(stillSaved.contentHash).toBe(saved.contentHash);
  expect(stillSaved.source.productHashes).toEqual(saved.source.productHashes);
});
