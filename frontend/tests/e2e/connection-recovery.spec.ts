import { test, expect } from "@playwright/test";

test("Settings shows a failed AI check and recovers on explicit retry", async ({ page }) => {
  let failed = true;
  await page.setViewportSize({ width: 320, height: 740 });
  await page.route("**/api/health", (route) =>
    failed ? route.fulfill({ status: 503, json: { error: "Unavailable" } }) : route.continue()
  );
  await page.goto("/#settings");
  await expect(page.getByText("AI connection unavailable.", { exact: true })).toBeVisible();
  await expect(page.getByText("Checking the AI connection…", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  failed = false;
  await page.getByRole("button", { name: "Retry AI connection", exact: true }).click();
  await expect(
    page.getByText("Local analysis and document reading", { exact: true })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry AI connection", exact: true })).toHaveCount(
    0
  );
});

test("a stalled health request times out and the Analyst can recover without losing a question", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/health", async (route) => {
    await pending;
    await route.continue().catch(() => {});
  });
  await page.goto("/#ai-analyst");
  const input = page.getByLabel("Ask anything about your banking data");
  await expect(input).toBeEnabled();
  await input.fill("Keep my unsent review question.");
  await expect(
    page.getByRole("alert").filter({ hasText: "The AI connection could not be checked" })
  ).toBeVisible({
    timeout: 15000,
  });
  await expect(
    page.getByRole("button", { name: "Retry AI connection", exact: true })
  ).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.screenshot({ path: test.info().outputPath("ai-connection-retry-phone.png") });
  await page.unroute("**/api/health");
  release();
  await page.getByRole("button", { name: "Retry AI connection", exact: true }).click();
  await expect(page.locator(".composer-mode")).toContainText("Local");
  await expect(input).toHaveValue("Keep my unsent review question.");
});

test("Settings retries failed permissions and restores the whole workspace", async ({ page }) => {
  let failed = true;
  await page.route("**/api/identity", (route) =>
    failed ? route.fulfill({ status: 503, json: { error: "Unavailable" } }) : route.continue()
  );
  await page.goto("/#settings");
  await expect(page.getByText("Staff permissions unavailable.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Local staff role")).toHaveCount(0);
  failed = false;
  await page.getByRole("button", { name: "Retry staff permissions", exact: true }).click();
  await expect(page.getByLabel("Local staff role")).toBeVisible();
  await page.getByRole("button", { name: "AI Analyst", exact: true }).click();
  await expect(page.getByLabel("Ask anything about your banking data")).toBeEnabled();
});

test("unready or malformed health does not claim the AI is connected", async ({ page }) => {
  await page.route("**/api/health", (route) =>
    route.fulfill({ json: { provider: "vertex", readyForAnalysis: false } })
  );
  await page.goto("/#settings");
  await expect(page.getByText("AI connection unavailable.", { exact: true })).toBeVisible();
  await expect(page.getByText("Connected", { exact: true })).toHaveCount(0);
  await page.route("**/api/health", (route) =>
    route.fulfill({ body: "not JSON", contentType: "text/html" })
  );
  await page.getByRole("button", { name: "Retry AI connection", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Retry AI connection", exact: true })
  ).toBeEnabled();
  await expect(page.getByText("Connected", { exact: true })).toHaveCount(0);
});
