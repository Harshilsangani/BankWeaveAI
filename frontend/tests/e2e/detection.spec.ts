import { test, expect } from "@playwright/test";
test("Radar exposes recorded rule facts and reuses unchanged snapshot runs", async ({ page }) => {
  await page.goto("/#risk-radar");
  // Dashboard compatibility records the default historical snapshot; Radar reads its receipt.
  await expect(page.locator(".risk-grid .risk-card")).toHaveCount(4, { timeout: 30000 });
  await page.getByText("Rule & recorded run", { exact: false }).first().click();
  await expect(page.locator(".risk-grid")).toContainText(
    "at least 25 records and ≥20% count increase"
  );
  await expect(page.locator(".risk-grid")).toContainText("Observed: 1091 vs 833");
  await page.getByRole("button", { name: "Run detection", exact: true }).click();
  await expect(page.getByText("Existing snapshot reused", { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.locator(".risk-grid .risk-card")).toHaveCount(4);
});

test("detection and review retain the selected dataset and month", async ({ page }) => {
  await page.goto("/#risk-radar");
  await expect(page.getByLabel("Risk dataset")).toBeEnabled();
  await page.getByLabel("Risk dataset").selectOption("bankshield");
  await expect(page.getByLabel("Risk snapshot month")).toHaveValue("2024-06");
  await expect(page.getByLabel("Risk snapshot month")).toBeEnabled();
  const operation = page.waitForRequest(
    (request) => request.method() === "POST" && request.url().endsWith("/api/detectors")
  );
  await page.getByRole("button", { name: "Run detection", exact: true }).click();
  expect((await operation).postDataJSON()).toEqual({ datasetId: "bankshield", period: "2024-06" });
  await expect(page.locator(".risk-grid .risk-card")).toHaveCount(1);
  await expect(page.locator(".radar-method")).toContainText("0 model calls");
  await expect(page.locator(".radar-checks")).toContainText("Public sample fraud labels");
  const disposition = page.waitForRequest(
    (request) => request.method() === "PATCH" && request.url().includes("/api/risk-state")
  );
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  expect((await disposition).postDataJSON()).toMatchObject({
    datasetId: "bankshield",
    period: "2024-06",
    action: "dismiss",
    riskId: "BS-001",
  });
  await expect(page.locator(".risk-grid .risk-card")).toHaveCount(0);
  // Dashboard and dataset metadata are independent requests on a cold load.
  // Hold metadata until the dashboard is ready to exercise that ordering.
  let releaseDatasets!: () => void;
  const datasetsReady = new Promise<void>((resolve) => (releaseDatasets = resolve));
  await page.route("**/api/datasets", async (route) => {
    await datasetsReady;
    await route.continue();
  });
  const dashboardReady = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/dashboard"
  );
  await page.reload();
  await dashboardReady;
  await expect(page.getByLabel("Risk dataset")).toHaveCount(0);
  releaseDatasets();
  await expect(page.getByLabel("Risk dataset")).toHaveValue("bankshield");
  await expect(page.getByLabel("Risk snapshot month")).toHaveValue("2024-06");
  await page.getByRole("button", { name: "Dismissed", exact: true }).click();
  await expect(page.locator(".risk-grid .risk-card")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Investigate", exact: true })).toBeDisabled();
  await page.getByLabel("Risk dataset").selectOption("meridian");
  await expect(page.locator(".risk-grid .risk-card")).toHaveCount(4);
});

test("first source month separates missing growth baselines from dated overdue evidence", async ({
  page,
}) => {
  await page.goto("/#risk-radar");
  await expect(page.getByLabel("Risk snapshot month")).toBeEnabled();
  await page.getByLabel("Risk snapshot month").selectOption("2026-04");
  await expect(page.getByRole("button", { name: "Run detection", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Run detection", exact: true }).click();
  await expect(page.getByRole("button", { name: "Run detection", exact: true })).toBeEnabled();
  await expect(page.locator(".radar-checks .radar-check")).toHaveCount(4);
  await expect(page.locator(".radar-checks")).toContainText("Insufficient data");
  await expect(page.locator(".radar-checks")).toContainText("Signal found");
  await expect(page.locator(".risk-grid .risk-card")).toHaveCount(1);
  await expect(page.locator(".risk-grid")).toContainText("396 loans");
  await expect(page.locator(".radar-baseline")).toContainText("March 2026 · Unavailable");
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
