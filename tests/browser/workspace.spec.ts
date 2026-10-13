import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { transactions, snapshotMonth } from "../../data/banking";

test("report and scenario routes use backend permissions without mock fallback", async ({
  request,
}) => {
  const headers = { "x-risklens-role": "viewer" };
  const report = await request.post("/api/reports", {
    headers,
    data: { investigation: { id: "INV-FORGED", title: "Untrusted client report" } },
  });
  expect(report.status()).toBe(403);
  const scenario = await request.post("/api/scenarios", {
    headers,
    data: { riskId: "RSK-002", coverage: 80, effectiveness: 65, friction: 5 },
  });
  expect(scenario.status()).toBe(403);
  const unavailable = await request.post("/api/scenarios", {
    headers: { "x-risklens-role": "analyst" },
    data: { riskId: "RSK-002", coverage: 80, effectiveness: 65, friction: 5 },
  });
  expect(unavailable.status()).toBe(422);
  const malformed = await request.post("/api/reports", {
    data: { investigation: { id: "INV-FORGED" }, scenario: "invalid" },
  });
  expect(malformed.status()).toBe(400);
});

test("analyst chat keeps the composer visible and renders tool results inline", async ({
  page,
}) => {
  await page.goto("/#ai-analyst");
  await expect(page.getByRole("heading", { name: "Hello, Analyst." })).toBeVisible();
  await expect(page.locator(".analyst-side-panel")).toHaveCount(0);
  fs.mkdirSync("artifacts", { recursive: true });
  await page.screenshot({ path: "artifacts/risklens-chat-empty.png" });
  const composer = page.locator(".chat-composer");
  const before = await composer.boundingBox();
  expect(before!.y + before!.height).toBeLessThanOrEqual(1050);
  await page
    .getByRole("textbox", { name: "Ask anything about your banking data" })
    .fill("Why did fraud increase this month?");
  await page.getByRole("button", { name: "Send question" }).click();
  // The first analyst round-trip also pays next-dev route compilation on a cold server.
  await expect(page.getByRole("heading", { name: "The signal behind the increase" })).toBeVisible({
    timeout: 20000,
  });
  await expect(page.locator(".chat-thread .chart-card")).toHaveCount(2);
  await expect(page.locator(".chat-thread table")).toHaveCount(1);
  await page.waitForTimeout(850);
  await page.screenshot({ path: "artifacts/risklens-chat-answer.png" });
  await page.locator(".chat-scroll").evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  expect((await composer.boundingBox())!.y).toBeCloseTo(before!.y, 0);
  await page.getByRole("button", { name: "Start a new chat" }).click();
  await expect(page.getByRole("heading", { name: "Hello, Analyst." })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Hello, Analyst." })).toBeVisible();
  await expect(composer).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
  await page.screenshot({ path: "artifacts/risklens-chat-mobile.png" });
});

test("complete banking investigation, scenario, and report flow", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Command Center", exact: true })).toBeVisible();
  await expect(
    page.getByText(
      transactions.filter((tx) => tx.month === snapshotMonth).length.toLocaleString(),
      { exact: true }
    )
  ).toBeVisible();
  fs.mkdirSync("artifacts", { recursive: true });
  await page.waitForTimeout(850); // Let the intentional chart entrance finish before visual capture.
  await page.screenshot({ path: "artifacts/risklens-desktop.png", fullPage: true });
  await expect(page.getByLabel("Ask anything about your banking data")).toHaveCount(0);
  await page.getByRole("button", { name: "Open AI Analyst", exact: true }).click();
  await page
    .getByRole("button", { name: "Why did fraud increase this month?", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "The signal behind the increase" })).toBeVisible();
  await expect(page.getByText("1,091", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Only Ahmedabad", exact: true }).last().click();
  await expect(page.getByText("Ahmedabad · September 2026", { exact: false }).last()).toBeVisible();
  await page.getByRole("button", { name: "Compare it to Surat", exact: true }).last().click();
  await expect(
    page.getByText("Ahmedabad vs Surat · September 2026", { exact: false }).last()
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Open investigation workspace", exact: true })
    .last()
    .click();
  await expect(page.getByRole("heading", { name: "Follow the evidence." })).toBeVisible();
  await page.getByText("Reconciled source records", { exact: true }).click();
  await expect(page.getByText(/TX-9\d{5}/).first()).toBeVisible();
  await page.screenshot({ path: "artifacts/risklens-investigation.png", fullPage: true });
  await page.getByRole("button", { name: "Run a scenario", exact: true }).click();
  await page.getByRole("button", { name: "Run simulation", exact: true }).click();
  await expect(page.getByText("52% modeled reduction")).toBeVisible();
  await page.getByLabel("Authentication coverage", { exact: true }).fill("100");
  await expect(page.getByText("Assumptions changed.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Run simulation", exact: true }).click();
  await expect(page.getByText("65% modeled reduction")).toBeVisible();
  await page.getByRole("button", { name: "Create report with this scenario" }).click();
  await expect(page.getByRole("heading", { name: "Reports", exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download report" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/RPT-.*-bankweave.html/);
  const file = await download.path();
  const html = fs.readFileSync(file!, "utf-8");
  expect(html).toContain("Scenario analysis — illustrative estimate");
  expect(html).toContain("SYNTHETIC DATA");
  await page.reload();
  await expect(page.getByRole("button", { name: "Download report" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("risk filtering, dismissal, policy search, header navigation and theme", async ({ page }) => {
  await page.goto("/#risk-radar");
  await expect(page.getByRole("heading", { name: "Risk Radar", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "High severity", exact: true }).click();
  await expect(page.locator(".risk-grid .risk-card")).toHaveCount(2);
  await page.getByRole("button", { name: "Dismiss", exact: true }).first().click();
  await expect(page.locator(".risk-grid .risk-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Restore dismissed" }).click();
  await expect(page.locator(".risk-grid .risk-card")).toHaveCount(2);
  await page.getByRole("button", { name: "Knowledge Library", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Knowledge library" })).toBeVisible();
  await page.getByRole("button", { name: "Policies & procedures", exact: true }).click();
  await page.getByRole("textbox", { name: "Search knowledge library" }).fill("KYC");
  await expect(page.locator(".policy-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Read policy" }).click();
  await expect(page.getByRole("dialog")).toContainText("Verify the completeness");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Light", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Command Center", exact: true }).click();
  await page.waitForTimeout(850);
  await page.screenshot({ path: "artifacts/risklens-light.png", fullPage: true });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("tablet dashboard separates risk cards and explains dismissed state", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 1200 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Command Center", exact: true })).toBeVisible();
  const cards = page.locator(".dashboard-aside .risk-list .risk-card");
  await expect(cards).toHaveCount(3);
  const widths = await cards.evaluateAll((els) =>
    els.map((el) => getComputedStyle(el).borderTopWidth)
  );
  expect(widths.every((w) => w !== "0px")).toBe(true);
  await page.goto("/#risk-radar");
  await expect(page.getByRole("heading", { name: "Risk Radar", exact: true })).toBeVisible();
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "Dismiss", exact: true }).first().click();
  }
  await expect(page.locator(".risk-grid .risk-card")).toHaveCount(0);
  await page.getByRole("button", { name: "Command Center", exact: true }).click();
  await expect(page.getByText("All caught up")).toBeVisible();
  await expect(page.getByText("00", { exact: true })).toBeVisible();
});

test("mobile navigation, readable viewport, and analytical question", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Command Center", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
  await page.waitForTimeout(850);
  await page.screenshot({ path: "artifacts/risklens-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "AI Analyst", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Ask anything about your banking data" })
    .fill("Compare default rates by branch");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(
    page.getByRole("heading", { name: "A closer look at loan performance" })
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
});
