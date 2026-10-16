import { test, expect } from "@playwright/test";
test("actual progress stream, cancellation and retry leave the analyst usable", async ({
  page,
}) => {
  await page.goto("/#ai-analyst");
  await expect(page.getByRole("heading", { name: "Hello, Analyst." })).toBeVisible();
  let calls = 0;
  await page.route("**/api/operations", async (route) => {
    if (route.request().method() === "DELETE") {
      await route.fulfill({ json: { cancelRequested: true } });
      return;
    }
    calls++;
    if (calls === 1) {
      await new Promise((resolve) => setTimeout(resolve, 1800));
      await route.abort().catch(() => {});
      return;
    }
    await route.continue();
  });
  await page
    .getByLabel("Ask anything about your banking data")
    .fill("Why did fraud increase this month?");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.getByText("Waiting for service response")).toBeVisible();
  await page.getByRole("button", { name: "Cancel request" }).click();
  await expect(page.locator(".error-banner")).toContainText("Request cancelled");
  await page.getByRole("button", { name: "Retry request" }).click();
  await expect(page.getByRole("heading", { name: "The signal behind the increase" })).toBeVisible({
    timeout: 20000,
  });
  await expect(page.getByRole("button", { name: "Cancel request" })).toHaveCount(0);
  expect(calls).toBe(2);
});
